#!/usr/bin/env node
/**
 * policy-guard-ci: the trusted-CI entry point for the policy guard (#44).
 *
 * Run this from a checkout of the protected base revision, in a workflow whose file lives on that
 * protected branch and whose trigger names that branch (`pull_request_target` with `branches`).
 * It reads the pull request under review from the GitHub event payload, checks the pull request's
 * base against the trusted repository and base branch, fetches the base, head and trusted commits
 * by id into a fresh throwaway data repository, and runs the sibling `policy-guard.mjs` over them
 * in `committed` mode.
 *
 * The pull request is data. No PR file is checked out, imported, sourced, installed or executed:
 * only `git fetch` and `git cat-file` read it, and the guard reads Git objects. The guard and the
 * enrollment it trusts come from this checkout and the trusted commit, so the PR cannot replace
 * the checker, pick a friendlier base, delete the enrollment or grant its own exemption. Nothing
 * from the event (a title, a branch name, an owner string) is interpolated into a shell: every
 * process is spawned with an argument array.
 *
 * The credential is bound to the repository before it is used. `GITHUB_SERVER_URL` and
 * `GITHUB_REPOSITORY` are the authority for the remote; the event's `clone_url` is only checked
 * against them, and a userinfo part, a query, a fragment, a foreign host or another repository is
 * refused. The read-only token becomes a URL-scoped `http.<remote>.extraheader` (never a command
 * line, never a remote URL, never a plain environment value), redirects are refused so the header
 * cannot travel to another host, and the guard subprocess runs with the token and every inherited
 * `GIT_CONFIG_*`/`GIT_TRACE*` variable removed. Git's own stderr, traces and stacks are never
 * printed: a failure is reported as a fixed category.
 *
 * Inputs (all from the trusted workflow environment, never from the branch):
 *   GITHUB_EVENT_PATH    required; the runner's event payload JSON
 *   GITHUB_REPOSITORY    required; `owner/repo`, the trusted repository
 *   GITHUB_SERVER_URL    required; the trusted `https` origin
 *   TRUSTED_BASE_BRANCH  required; the one protected base branch this job supports
 *   TRUSTED_SHA          required; the protected commit the guard and policy are read from
 *   GITHUB_TOKEN         required for an `https` remote; read-only contents token
 *   POLICY_PATH          optional; default `lint-kit.policy.json`
 *
 * Exit code is the guard's: `0` clean, `1` an unapproved enrolled change, `2` the check could not
 * run (a missing or invalid input, a refused remote, an unreachable commit, a fetch failure, or the
 * guard failing). Missing evidence is never clean.
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

/** `owner/repo`, exactly two non-empty segments: the trusted repository, nothing else. */
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** The pull request actions this invocation judges; the template triggers exactly these. */
const ACTIONS = new Set(['opened', 'synchronize', 'reopened']);

const DEFAULT_POLICY = 'lint-kit.policy.json';

/** A required, non-empty environment input. */
function requireEnv(name) {
	const value = process.env[name];
	if (typeof value !== 'string' || value.length === 0) throw new CiError(`${name} is required`);
	return value;
}

/**
 * The event payload the runner wrote; the PR metadata in it is GitHub's, not the branch's. The
 * base repository and base branch are returned so the caller can hold them against the trusted
 * context, and only the base's `clone_url` is read as a URL candidate.
 */
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
	if (!ACTIONS.has(event?.action)) throw new CiError('the event is not a supported pull_request_target action');
	const pr = event.pull_request;
	if (pr === null || typeof pr !== 'object') throw new CiError('the event payload has no pull_request');
	const base = pr.base;
	const head = pr.head;
	if (base === null || typeof base !== 'object' || head === null || typeof head !== 'object') {
		throw new CiError('the pull request payload has no base or head');
	}
	if (!OBJECT_ID.test(base.sha ?? '')) throw new CiError('the pull request base is not a full commit id');
	if (!OBJECT_ID.test(head.sha ?? '')) throw new CiError('the pull request head is not a full commit id');
	const baseRepo = base.repo;
	if (baseRepo === null || typeof baseRepo !== 'object') throw new CiError('the pull request base has no repository');
	return {
		baseSha: base.sha,
		headSha: head.sha,
		baseRef: base.ref,
		baseRepository: baseRepo.full_name,
		cloneUrl: baseRepo.clone_url,
	};
}

/** Compare two remote URLs without a trailing slash or a `git` suffix, ignoring nothing else. */
const remoteIdentity = (url) => `${url.origin}${url.pathname.replace(/\/+$/, '').replace(/\.git$/, '')}`;

/**
 * The one remote a trusted run may fetch from: the runner's own server and repository, never the
 * event. `GITHUB_SERVER_URL`/`GITHUB_REPOSITORY` are parsed strictly and the remote is built from
 * them, so a hidden fallback cannot point at another repository. When the event carries a
 * `clone_url`, it is only a consistency check: a `file:` URL is the offline fixture (never
 * credentialed), and an `https:` URL must have no userinfo, query or fragment and the exact trusted
 * origin and path. Any other scheme, host or repository is refused before a credential exists.
 */
function resolveRemote(cloneUrl, trusted) {
	if (typeof cloneUrl === 'string' && cloneUrl.length > 0) {
		let url;
		try {
			url = new URL(cloneUrl);
		} catch {
			throw new CiError('the base repository URL is not a valid URL');
		}
		if (url.protocol === 'file:') return url.href;
		if (url.protocol !== 'https:') {
			throw new CiError(`refusing to fetch over ${url.protocol} (only https and file are supported)`);
		}
		if (url.username || url.password || url.search || url.hash) {
			throw new CiError('the base repository URL must not carry userinfo, a query or a fragment');
		}
		if (remoteIdentity(url) !== remoteIdentity(new URL(trusted))) {
			throw new CiError('the base repository URL does not match GITHUB_SERVER_URL/GITHUB_REPOSITORY');
		}
	}
	return trusted;
}

/**
 * The trusted `https` remote, built only from `GITHUB_SERVER_URL`/`GITHUB_REPOSITORY`. The server
 * must be a bare `https` origin; a userinfo part, a query, a fragment, a path or a non-`owner/repo`
 * repository is refused, so the origin and path the credential is scoped to are fully pinned.
 */
function trustedRemote(serverUrl, repository) {
	if (typeof repository !== 'string' || !REPOSITORY.test(repository)) {
		throw new CiError('GITHUB_REPOSITORY must be owner/repo');
	}
	let server;
	try {
		server = new URL(serverUrl);
	} catch {
		throw new CiError('GITHUB_SERVER_URL is not a valid URL');
	}
	if (server.protocol !== 'https:') throw new CiError('GITHUB_SERVER_URL must be an https origin');
	if (server.username || server.password || server.search || server.hash || (server.pathname !== '/' && server.pathname !== '')) {
		throw new CiError('GITHUB_SERVER_URL must be a bare https origin');
	}
	return `${server.origin}/${repository}.git`;
}

/**
 * Drop every inherited variable that could reconfigure a child Git process or make it log a
 * credential: the token itself, `GIT_CONFIG_*`, the `GIT_TRACE*`/`GIT_CURL_VERBOSE` channels and
 * the askpass hooks. The runner's own values are never trusted to be absent.
 */
function scrubEnv(env) {
	const clean = {};
	for (const [key, value] of Object.entries(env)) {
		if (key === 'GITHUB_TOKEN') continue;
		if (key.startsWith('GIT_CONFIG') || key.startsWith('GIT_TRACE') || key.startsWith('GIT_CURL')) continue;
		if (key === 'GIT_ASKPASS' || key === 'SSH_ASKPASS') continue;
		clean[key] = value;
	}
	return clean;
}

/**
 * The environment for one `git` process, built from the scrubbed environment. For an `https`
 * remote the read-only token becomes an `Authorization` header in a `http.<remote>.extraheader`
 * scoped to exactly that server and repository, with `http.followRedirects=false` so the header
 * cannot be replayed to a redirect target. The token is never in the environment, the argument
 * list or a URL. The prompt is disabled so a missing credential fails closed instead of hanging.
 */
function gitEnv(remote, token) {
	const env = scrubEnv(process.env);
	env.GIT_TERMINAL_PROMPT = '0';
	env.GIT_CONFIG_COUNT = '0';
	if (remote.startsWith('https:')) {
		if (typeof token !== 'string' || token.length === 0) throw new CiError('GITHUB_TOKEN is required for an https remote');
		const basic = Buffer.from(`x-access-token:${token}`, 'utf8').toString('base64');
		env.GIT_CONFIG_COUNT = '2';
		env.GIT_CONFIG_KEY_0 = `http.${remote}.extraheader`;
		env.GIT_CONFIG_VALUE_0 = `Authorization: basic ${basic}`;
		env.GIT_CONFIG_KEY_1 = 'http.followRedirects';
		env.GIT_CONFIG_VALUE_1 = 'false';
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
 * commit id from the trusted event payload reaches Git. A failure is reported as a fixed category,
 * never Git's stderr (which can carry a URL or a trace line).
 */
function fetchCommit(repo, remote, sha, env) {
	try {
		git(repo, ['fetch', '--no-tags', '--quiet', remote, sha], env);
	} catch {
		throw new CiError(`could not fetch ${sha}`);
	}
	try {
		git(repo, ['cat-file', '-e', `${sha}^{commit}`], env);
	} catch {
		throw new CiError(`${sha} is not a commit`);
	}
}

/** Run the trusted guard from this checkout with a scrubbed environment, and pass its code. */
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
	const result = spawnSync(process.execPath, args, { stdio: 'inherit', env: scrubEnv(process.env) });
	if (result.error) throw new CiError('could not run the policy guard');
	return typeof result.status === 'number' ? result.status : 2;
}

/** The whole trusted invocation. Any error fails closed with the guard's exit `2`. */
export function main() {
	let dataRepo;
	try {
		const eventPath = requireEnv('GITHUB_EVENT_PATH');
		const repository = requireEnv('GITHUB_REPOSITORY');
		const serverUrl = requireEnv('GITHUB_SERVER_URL');
		const baseBranch = requireEnv('TRUSTED_BASE_BRANCH');
		const trustedSha = requireEnv('TRUSTED_SHA');
		if (!OBJECT_ID.test(trustedSha)) throw new CiError('TRUSTED_SHA must be a full commit id');
		const policyPath = process.env.POLICY_PATH || DEFAULT_POLICY;
		const trusted = trustedRemote(serverUrl, repository);
		const { baseSha, headSha, baseRef, baseRepository, cloneUrl } = readPullRequest(eventPath);
		if (baseRepository !== repository) throw new CiError('the pull request base is not GITHUB_REPOSITORY');
		if (baseRef !== baseBranch) throw new CiError('the pull request base is not TRUSTED_BASE_BRANCH');
		const remote = resolveRemote(cloneUrl, trusted);
		const env = gitEnv(remote, process.env.GITHUB_TOKEN);
		delete process.env.GITHUB_TOKEN;
		dataRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'policy-guard-ci-'));
		git(dataRepo, ['init', '-q'], env);
		fetchCommit(dataRepo, remote, baseSha, env);
		fetchCommit(dataRepo, remote, headSha, env);
		fetchCommit(dataRepo, remote, trustedSha, env);
		return runGuard(dataRepo, { baseSha, headSha, trustedSha, policyPath });
	} catch (error) {
		const message = error instanceof CiError ? error.message : 'unexpected failure (the trusted inputs could not be resolved)';
		console.error(`policy-guard-ci: ${message}`);
		return 2;
	} finally {
		if (dataRepo) fs.rmSync(dataRepo, { recursive: true, force: true });
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	process.exitCode = main();
}
