#!/usr/bin/env node
/**
 * policy-guard-ci: the trusted-CI entry point for the policy guard (#44).
 *
 * Run this from a checkout of the protected base revision, in a workflow whose file lives on that
 * protected branch. It reads the pull request under review from the GitHub event payload, fetches
 * the base, head and trusted commits by id into a fresh throwaway data repository, and runs the
 * sibling `policy-guard.mjs` over them in `committed` mode.
 *
 * The pull request is data. No PR file is checked out, imported, sourced, installed or executed:
 * only `git fetch` and `git cat-file` read it, and the guard reads Git objects. The guard and the
 * enrollment it trusts come from this checkout and the trusted commit, so the PR cannot replace
 * the checker, pick a friendlier base, delete the enrollment or grant its own exemption. Nothing
 * from the event (a title, a branch name, an owner string) is interpolated into a shell: every
 * process is spawned with an argument array, and the remote URL is parsed and scheme-checked.
 *
 * Inputs (all from the trusted workflow environment, never from the branch):
 *   GITHUB_EVENT_PATH   required; the runner's event payload JSON
 *   GITHUB_REPOSITORY   required; `owner/repo`, used only as a remote fallback
 *   GITHUB_SERVER_URL   optional; default `https://github.com`
 *   GITHUB_TOKEN        required for an `https` remote; read-only contents token
 *   TRUSTED_SHA         required; the protected commit the guard and policy are read from
 *   POLICY_PATH         optional; default `lint-kit.policy.json`
 *
 * Exit code is the guard's: `0` clean, `1` an unapproved enrolled change, `2` the check could not
 * run (a missing or invalid input, an unreachable commit, a fetch failure, or the guard failing).
 * Missing evidence is never clean.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** This command's folder: the guard beside it is the trusted copy, never one from the PR. */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const GUARD = path.join(HERE, 'policy-guard.mjs');

/** The input cannot be trusted: fail closed with the guard's exit `2`. */
class CiError extends Error {}

/** A full Git object id; SHA-1 now, SHA-256 tolerated. */
const OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

const DEFAULT_POLICY = 'lint-kit.policy.json';

/** A required, non-empty environment input. */
function requireEnv(name) {
	const value = process.env[name];
	if (typeof value !== 'string' || value.length === 0) throw new CiError(`${name} is required`);
	return value;
}

/** The event payload the runner wrote; the PR metadata in it is GitHub's, not the branch's. */
function readPullRequest(eventPath) {
	let text;
	try {
		text = fs.readFileSync(eventPath, 'utf8');
	} catch {
		throw new CiError(`cannot read GITHUB_EVENT_PATH ${eventPath}`);
	}
	let event;
	try {
		event = JSON.parse(text);
	} catch {
		throw new CiError('GITHUB_EVENT_PATH is not valid JSON');
	}
	const pr = event?.pull_request;
	if (pr === null || typeof pr !== 'object') throw new CiError('the event payload has no pull_request');
	const base = pr.base;
	const head = pr.head;
	if (base === null || typeof base !== 'object' || head === null || typeof head !== 'object') {
		throw new CiError('the pull request payload has no base or head');
	}
	if (!OBJECT_ID.test(base.sha ?? '')) throw new CiError('the pull request base is not a full commit id');
	if (!OBJECT_ID.test(head.sha ?? '')) throw new CiError('the pull request head is not a full commit id');
	return { baseSha: base.sha, headSha: head.sha, cloneUrl: base.repo?.clone_url };
}

/**
 * The base repository URL to fetch from. Prefer the payload's `clone_url` (the base repo, never
 * the fork); fall back to `GITHUB_SERVER_URL`/`GITHUB_REPOSITORY`. Only `https:` (GitHub) and
 * `file:` (a local test remote) are accepted, so a crafted value cannot become a transport such
 * as `ext::` that runs a command.
 */
function resolveRemote(cloneUrl, repository, serverUrl) {
	const candidate = typeof cloneUrl === 'string' && cloneUrl.length > 0 ? cloneUrl : `${serverUrl.replace(/\/+$/, '')}/${repository}.git`;
	let url;
	try {
		url = new URL(candidate);
	} catch {
		throw new CiError('the base repository URL is not a valid URL');
	}
	if (url.protocol !== 'https:' && url.protocol !== 'file:') {
		throw new CiError(`refusing to fetch over ${url.protocol} (only https and file are supported)`);
	}
	return url.href;
}

/**
 * The Git environment. For an `https` remote the read-only token travels in an
 * `http.extraheader` configured through the environment (`GIT_CONFIG_COUNT`), never on the
 * command line and never in a remote URL, so it is not in the process argument list. The prompt
 * is disabled so a missing credential fails closed instead of hanging.
 */
function gitEnv(remote, token) {
	const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
	if (remote.startsWith('https:')) {
		if (typeof token !== 'string' || token.length === 0) throw new CiError('GITHUB_TOKEN is required for an https remote');
		const basic = Buffer.from(`x-access-token:${token}`, 'utf8').toString('base64');
		env.GIT_CONFIG_COUNT = '1';
		env.GIT_CONFIG_KEY_0 = 'http.extraheader';
		env.GIT_CONFIG_VALUE_0 = `Authorization: basic ${basic}`;
	}
	return env;
}

/** One Git command in `repo` as an argument array; no shell, so no value is re-parsed. */
function git(repo, args, env) {
	return execFileSync('git', ['--literal-pathspecs', ...args], {
		cwd: repo,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
		env,
		maxBuffer: 64 * 1024 * 1024,
	});
}

/**
 * Fetch one commit id with its full ancestry (never a shallow `--depth 1`, which would break the
 * merge-base) and prove it is a commit. The branch name, owner and ref are never used: only the
 * commit id from the trusted event payload reaches Git.
 */
function fetchCommit(repo, remote, sha, env) {
	try {
		git(repo, ['fetch', '--no-tags', '--quiet', remote, sha], env);
		git(repo, ['cat-file', '-e', `${sha}^{commit}`], env);
	} catch (error) {
		const detail = String(error.stderr ?? '').trim() || error.message;
		throw new CiError(`could not fetch ${sha}: ${detail}`);
	}
}

/** Run the trusted guard from this checkout, pointed at the data repository, and pass its code. */
function runGuard(dataRepo, { baseSha, headSha, trustedSha, policyPath }) {
	const args = [
		GUARD,
		'--cwd', dataRepo,
		'--base', baseSha,
		'--target', headSha,
		'--trusted-ref', trustedSha,
		'--policy', policyPath,
		'--mode', 'committed',
	];
	const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
	if (result.error) throw new CiError(`could not run the policy guard: ${result.error.message}`);
	return typeof result.status === 'number' ? result.status : 2;
}

/** The whole trusted invocation. Any error fails closed with the guard's exit `2`. */
export function main() {
	let dataRepo;
	try {
		const eventPath = requireEnv('GITHUB_EVENT_PATH');
		const repository = requireEnv('GITHUB_REPOSITORY');
		const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com';
		const trustedSha = process.env.TRUSTED_SHA;
		if (!OBJECT_ID.test(trustedSha ?? '')) throw new CiError('TRUSTED_SHA must be a full commit id');
		const policyPath = process.env.POLICY_PATH || DEFAULT_POLICY;
		const { baseSha, headSha, cloneUrl } = readPullRequest(eventPath);
		const remote = resolveRemote(cloneUrl, repository, serverUrl);
		const env = gitEnv(remote, process.env.GITHUB_TOKEN);
		dataRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'policy-guard-ci-'));
		git(dataRepo, ['init', '-q'], env);
		fetchCommit(dataRepo, remote, baseSha, env);
		fetchCommit(dataRepo, remote, headSha, env);
		fetchCommit(dataRepo, remote, trustedSha, env);
		return runGuard(dataRepo, { baseSha, headSha, trustedSha, policyPath });
	} catch (error) {
		console.error(`policy-guard-ci: ${error instanceof CiError ? error.message : (error?.stack ?? String(error))}`);
		return 2;
	} finally {
		if (dataRepo) fs.rmSync(dataRepo, { recursive: true, force: true });
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	process.exitCode = main();
}
