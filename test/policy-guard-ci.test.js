/**
 * The trusted-CI policy guard invocation (#44).
 *
 * These tests build a real local Git repository, copy the real guard, helper and template into a
 * trusted checkout, and run the real template command (`node tools/policy/policy-guard-ci.mjs`)
 * against a local `file://` remote. The pull request is a real branch fetched only as Git data:
 * every head-owned executable shape (a replaced guard, a package install hook, a `.npmrc`, a
 * marker script) is present in the PR and must never run. The tests assert exit codes, stdout and
 * the absence of the marker files, not helper internals.
 *
 * GitHub Actions itself is not run here. The template's command and context are reproduced; its
 * head association and the external repository protections are not, and are recorded as pending
 * in the trusted-CI docs. The local fixture needs no network and no GitHub token.
 */

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import { main } from '../bin/lint-kit.js';

/** The trusted GitHub context the workflow supplies; every fixture event is held against it. */
const TRUSTED_REPO = 'shayshahal/lint-kit';
const TRUSTED_SERVER = 'https://github.com';
const TRUSTED_BASE = 'main';
/** A synthetic secret: it must never appear in the helper's stdout, stderr or the guard's env. */
const SENTINEL = 'synthetic-secret-sentinel-do-not-log';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POLICY_DIR = path.join(ROOT, 'tools', 'policy');
const JSONC_PARSER_SOURCE = path.join(ROOT, 'node_modules', 'jsonc-parser');
const TEMPLATE = path.join(POLICY_DIR, 'policy-guard-ci.yml');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-kit-policy-ci-'));
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

let counter = 0;
const unique = (name) => `${name}-${counter++}`;

function git(dir, args) {
	const result = spawnSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
	assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`);
	return (result.stdout ?? '').trim();
}

const fallow = (maxCognitive) => `{\n\t"health": { "maxCognitive": ${maxCognitive} }\n}\n`;
const policyText = () =>
	`${JSON.stringify(
		{
			version: 1,
			enrollments: [
				{
					id: 'fallow',
					source: '.fallowrc.json',
					format: 'jsonc',
					adapter: 'fallow-jsonc',
					identities: [{ id: 'health.maxCognitive', unit: 'score', direction: 'max' }],
				},
				{ id: 'tools/policy/policy-guard.mjs', source: 'tools/policy/policy-guard.mjs', format: 'opaque' },
			],
		},
		null,
		'\t',
	)}\n`;

/** The trusted tool copies, taken from this checkout and landed on the base commit. */
function toolFiles() {
	return Object.fromEntries(
		['policy-guard.mjs', 'policy-guard-ci.mjs', 'policy-guard-ci.yml', 'README.md'].map((file) => [
			`tools/policy/${file}`,
			fs.readFileSync(path.join(POLICY_DIR, file), 'utf8'),
		]),
	);
}

/** Write `files` under `dir`; a `null` value deletes the path. */
function writeFiles(dir, files) {
	for (const [rel, content] of Object.entries(files)) {
		const file = path.join(dir, rel);
		if (content === null) {
			fs.rmSync(file, { recursive: true, force: true });
			continue;
		}
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, content);
	}
}

function copyParser(dir) {
	assert.ok(fs.existsSync(JSONC_PARSER_SOURCE), `the frozen jsonc-parser is not installed at ${JSONC_PARSER_SOURCE}`);
	fs.cpSync(JSONC_PARSER_SOURCE, path.join(dir, 'node_modules', 'jsonc-parser'), { recursive: true, dereference: true });
}

/**
 * A local base repository with a protected-looking `main`, plus the trusted checkout that a real
 * CI job would make from the base commit. `parser` controls whether the frozen jsonc-parser is
 * resolvable from the trusted checkout, standing in for the trusted lockfile install.
 */
function fixture(name, { baseFiles = {}, parser = true } = {}) {
	const base = path.join(TMP, unique(name));
	fs.mkdirSync(base, { recursive: true });
	const origin = path.join(base, 'origin.git');
	git(base, ['init', '--bare', '-q', '-b', 'main', origin]);
	const seed = path.join(base, 'seed');
	git(base, ['clone', '-q', origin, seed]);
	git(seed, ['config', 'user.email', 'policy-ci@lint-kit.test']);
	git(seed, ['config', 'user.name', 'lint-kit']);
	writeFiles(seed, {
		'.fallowrc.json': fallow(25),
		'lint-kit.policy.json': policyText(),
		'package.json': '{\n\t"name": "consumer",\n\t"devDependencies": { "jsonc-parser": "3.3.1" }\n}\n',
		'README.md': 'base\n',
		...toolFiles(),
		...baseFiles,
	});
	git(seed, ['add', '-A']);
	git(seed, ['commit', '-qm', 'base']);
	git(seed, ['branch', '-M', 'main']);
	git(seed, ['push', '-q', 'origin', 'main']);
	const baseSha = git(seed, ['rev-parse', 'HEAD']);
	const trusted = path.join(base, 'trusted');
	git(base, ['clone', '-q', '--branch', 'main', origin, trusted]);
	if (parser) copyParser(trusted);
	return { base, origin, seed, trusted, baseSha };
}

let branchCounter = 0;
/** A pull request head: a branch from `main` with `files` committed and pushed. */
function openPullRequest(fx, files, { from = 'main' } = {}) {
	const branch = `pr-${branchCounter++}`;
	git(fx.seed, ['checkout', '-q', from]);
	git(fx.seed, ['checkout', '-qb', branch]);
	writeFiles(fx.seed, files);
	git(fx.seed, ['add', '-A']);
	git(fx.seed, ['commit', '-qm', `head of ${branch}`]);
	git(fx.seed, ['push', '-q', 'origin', branch]);
	const headSha = git(fx.seed, ['rev-parse', 'HEAD']);
	git(fx.seed, ['checkout', '-q', 'main']);
	return headSha;
}

/** A reachable commit on its own branch that carries `files` on top of the current base. */
function pinnedCommit(fx, name, files) {
	const branch = `pin-${name}`;
	git(fx.seed, ['checkout', '-q', 'main']);
	git(fx.seed, ['checkout', '-qb', branch]);
	writeFiles(fx.seed, files);
	git(fx.seed, ['add', '-A']);
	git(fx.seed, ['commit', '--allow-empty', '-qm', branch]);
	git(fx.seed, ['push', '-q', 'origin', branch]);
	const sha = git(fx.seed, ['rev-parse', 'HEAD']);
	git(fx.seed, ['checkout', '-q', 'main']);
	return sha;
}

const cloneUrl = (fx) => pathToFileURL(fx.origin).href;

/** A `pull_request_target` payload with the trusted repo and base branch GitHub would report. */
function ciEvent({ baseSha, headSha, baseRef = TRUSTED_BASE, baseRepository = TRUSTED_REPO, cloneUrl: url, action = 'opened' }) {
	return {
		action,
		pull_request: {
			number: 1,
			base: { ref: baseRef, sha: baseSha, repo: { full_name: baseRepository, clone_url: url } },
			head: { ref: 'feature', sha: headSha, repo: { full_name: baseRepository, clone_url: url } },
		},
	};
}

/** The GitHub context a workflow step would set; no token is needed for a `file://` remote. */
function ciEnv(fx, { baseSha, headSha, trustedSha = fx.baseSha, policy = 'lint-kit.policy.json', event = {}, overrides = {} }) {
	const eventPath = path.join(TMP, unique('event'), 'event.json');
	fs.mkdirSync(path.dirname(eventPath), { recursive: true });
	fs.writeFileSync(eventPath, JSON.stringify(ciEvent({ baseSha, headSha, cloneUrl: cloneUrl(fx), ...event })));
	return {
		GITHUB_EVENT_PATH: eventPath,
		GITHUB_REPOSITORY: TRUSTED_REPO,
		GITHUB_SERVER_URL: TRUSTED_SERVER,
		TRUSTED_BASE_BRANCH: TRUSTED_BASE,
		TRUSTED_SHA: trustedSha,
		POLICY_PATH: policy,
		...overrides,
	};
}

/** Rewrite the fixture event's fields and return the path, for a malformed-context case. */
function editEvent(env, change) {
	const event = JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
	change(event);
	fs.writeFileSync(env.GITHUB_EVENT_PATH, JSON.stringify(event));
	return env;
}

/** Run the real trusted helper from the trusted checkout with a clean environment plus context. */
function runCi(fx, env) {
	const result = spawnSync(process.execPath, [path.join(fx.trusted, 'tools', 'policy', 'policy-guard-ci.mjs')], {
		cwd: fx.trusted,
		encoding: 'utf8',
		env: { ...process.env, GITHUB_TOKEN: '', ...env },
	});
	const stdout = result.stdout ?? '';
	const stderr = result.stderr ?? '';
	return { code: result.status, stdout, stderr, output: `${stdout}${stderr}` };
}

/**
 * Run the real helper with exactly `env` (plus the ambient process environment, with any
 * credential/config/trace variable removed case-insensitively). This injects no uppercase alias,
 * so a lower- or mixed-case key is the only spelling the child can see.
 */
function runCiExact(fx, env) {
	const ambient = {};
	for (const [key, value] of Object.entries(process.env)) {
		const name = key.toUpperCase();
		if (name === 'GITHUB_TOKEN' || name.startsWith('GIT_CONFIG') || name.startsWith('GIT_TRACE') || name.startsWith('GIT_CURL')) continue;
		if (name === 'GIT_ASKPASS' || name === 'SSH_ASKPASS') continue;
		ambient[key] = value;
	}
	const result = spawnSync(process.execPath, [path.join(fx.trusted, 'tools', 'policy', 'policy-guard-ci.mjs')], {
		cwd: fx.trusted,
		encoding: 'utf8',
		env: { ...ambient, ...env },
	});
	const stdout = result.stdout ?? '';
	const stderr = result.stderr ?? '';
	return { code: result.status, stdout, stderr, output: `${stdout}${stderr}` };
}

const findMarker = (root, name) => {
	for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
		const entryPath = path.join(root, entry.name);
		if (entry.isDirectory()) {
			if (findMarker(entryPath, name)) return true;
		} else if (entry.name === name) return true;
	}
	return false;
};
const markers = (fx) => ({
	guard: findMarker(fx.base, 'guard-executed.marker'),
	install: findMarker(fx.base, 'install-executed.marker'),
});

// ── the trusted path runs and its verdicts are the guard's ──────────────────────

test('the trusted helper runs the real guard against the pull request and passes a clean head', () => {
	const fx = fixture('clean');
	const headSha = openPullRequest(fx, { 'README.md': 'base\n\nan ordinary change\n' });
	const result = runCi(fx, ciEnv(fx, { baseSha: fx.baseSha, headSha }));
	assert.equal(result.code, 0, result.output);
	assert.match(result.stdout, /no unapproved enrolled change since/);
});

test('a weakened max ceiling in the pull request exits 1 and is named', () => {
	const fx = fixture('weaken');
	const headSha = openPullRequest(fx, { '.fallowrc.json': fallow(40) });
	const result = runCi(fx, ciEnv(fx, { baseSha: fx.baseSha, headSha }));
	assert.equal(result.code, 1, result.output);
	assert.match(result.stdout, /enrolled-weakened: health\.maxCognitive raised from 25 to 40/);
});

test('an unchanged or tightened ceiling passes', () => {
	const unchanged = fixture('unchanged');
	const sameHead = openPullRequest(unchanged, { 'README.md': 'base\n\nnote\n' });
	assert.equal(runCi(unchanged, ciEnv(unchanged, { baseSha: unchanged.baseSha, headSha: sameHead })).code, 0);

	const tightened = fixture('tightened');
	const tightHead = openPullRequest(tightened, { '.fallowrc.json': fallow(20) });
	const result = runCi(tightened, ciEnv(tightened, { baseSha: tightened.baseSha, headSha: tightHead }));
	assert.equal(result.code, 0, result.output);
});

test('an APPROVED-BY marker and a widened ignore list never authorize a weakening', () => {
	const fx = fixture('approved-by');
	const headSha = openPullRequest(fx, {
		'.fallowrc.json': fallow(40),
		'APPROVED-BY': 'maintainer approved this policy change\n',
	});
	const result = runCi(fx, ciEnv(fx, { baseSha: fx.baseSha, headSha }));
	assert.equal(result.code, 1, result.output);
	assert.match(result.stdout, /enrolled-weakened: health\.maxCognitive raised from 25 to 40/);
});

test('the pull request cannot delete or edit the enrollment to exempt itself', () => {
	const fx = fixture('self-exempt');
	const headSha = openPullRequest(fx, {
		'.fallowrc.json': fallow(40),
		'lint-kit.policy.json': '{\n\t"version": 1,\n\t"enrollments": []\n}\n',
	});
	const result = runCi(fx, ciEnv(fx, { baseSha: fx.baseSha, headSha }));
	assert.equal(result.code, 1, result.output);
	assert.match(result.stdout, /enrolled-weakened: health\.maxCognitive raised from 25 to 40/);
});

test('adding ** to an enrolled ignore list is an unapproved widening', () => {
	const policy = `${JSON.stringify(
		{
			version: 1,
			enrollments: [
				{
					id: 'fallow',
					source: '.fallowrc.json',
					format: 'jsonc',
					adapter: 'fallow-jsonc',
					identities: [{ id: 'ignorePatterns', unit: 'glob-list', direction: 'subset' }],
				},
				{ id: 'tools/policy/policy-guard.mjs', source: 'tools/policy/policy-guard.mjs', format: 'opaque' },
			],
		},
		null,
		'\t',
	)}\n`;
	const fx = fixture('ignores', {
		baseFiles: { 'lint-kit.policy.json': policy, '.fallowrc.json': '{\n\t"ignorePatterns": ["dist/**"]\n}\n' },
	});
	const headSha = openPullRequest(fx, { '.fallowrc.json': '{\n\t"ignorePatterns": ["dist/**", "**"]\n}\n' });
	const result = runCi(fx, ciEnv(fx, { baseSha: fx.baseSha, headSha }));
	assert.equal(result.code, 1, result.output);
	assert.match(result.stdout, /enrolled-weakened: ignorePatterns/);
});

test('a pull request that rewrites the workflow file cannot change the trusted invocation', () => {
	const fx = fixture('workflow-tamper');
	const headSha = openPullRequest(fx, {
		'.github/workflows/policy-guard.yml': 'name: policy-guard\non: [push]\njobs:\n  policy-guard:\n    runs-on: ubuntu-latest\n    steps:\n      - run: exit 0\n',
		'.fallowrc.json': fallow(40),
	});
	const result = runCi(fx, ciEnv(fx, { baseSha: fx.baseSha, headSha }));
	assert.equal(result.code, 1, result.output);
	assert.match(result.stdout, /enrolled-weakened: health\.maxCognitive raised from 25 to 40/);
});

// ── the pull request is data: nothing head-owned executes ───────────────────────

test('a replaced guard, package install hook, .npmrc and marker script never execute', () => {
	const fx = fixture('no-exec');
	const pwn = `import fs from 'node:fs';\nfs.writeFileSync('guard-executed.marker', 'x');\n`;
	const headSha = openPullRequest(fx, {
		'tools/policy/policy-guard.mjs': pwn,
		'tools/policy/policy-guard-ci.mjs': pwn,
		'package.json': JSON.stringify({ name: 'consumer', scripts: { postinstall: 'node install-hook.mjs' } }),
		'install-hook.mjs': `import fs from 'node:fs';\nfs.writeFileSync('install-executed.marker', 'x');\n`,
		'.npmrc': 'ignore-scripts=false\n',
		// the enrolled guard is replaced, so the trusted guard flags it as an opaque change
	});
	const result = runCi(fx, ciEnv(fx, { baseSha: fx.baseSha, headSha }));
	assert.equal(result.code, 1, result.output);
	assert.match(result.stdout, /enrolled-change: tools\/policy\/policy-guard\.mjs/);
	assert.deepEqual(markers(fx), { guard: false, install: false }, 'no head-owned file ran');
	assert.equal(fs.existsSync(path.join(fx.seed, 'node_modules')), false, 'nothing was installed from the head');
});

test('a nested path that only shares the PR branch name does not confuse the trusted run', () => {
	const fx = fixture('paths');
	const headSha = openPullRequest(fx, {
		'tools/policy/policy-guard.mjs': 'export const tampered = true;\n',
		'nested/tools/policy/policy-guard.mjs': 'export const decoy = true;\n',
	});
	const result = runCi(fx, ciEnv(fx, { baseSha: fx.baseSha, headSha }));
	assert.equal(result.code, 1, result.output);
	assert.match(result.stdout, /enrolled-change: tools\/policy\/policy-guard\.mjs/);
});

// ── trusted inputs fail closed ──────────────────────────────────────────────────

test('a missing enrollment at the trusted commit exits 2, never clean', () => {
	const fx = fixture('no-policy');
	const noPolicy = pinnedCommit(fx, 'no-policy', { 'lint-kit.policy.json': null });
	const headSha = openPullRequest(fx, { '.fallowrc.json': fallow(40) });
	const result = runCi(fx, ciEnv(fx, { baseSha: fx.baseSha, headSha, trustedSha: noPolicy }));
	assert.equal(result.code, 2, result.output);
	assert.match(result.output, /policy lint-kit\.policy\.json does not exist at --trusted-ref/);
});

test('a parsed enrollment without the frozen parser exits 2, never clean', () => {
	const fx = fixture('no-parser', { parser: false });
	const headSha = openPullRequest(fx, { '.fallowrc.json': fallow(20) });
	const result = runCi(fx, ciEnv(fx, { baseSha: fx.baseSha, headSha }));
	assert.equal(result.code, 2, result.output);
	assert.match(result.output, /cannot load jsonc-parser/);
});

test('an unresolvable head commit exits 2, never clean', () => {
	const fx = fixture('bad-head');
	const result = runCi(fx, ciEnv(fx, { baseSha: fx.baseSha, headSha: 'a'.repeat(40) }));
	assert.equal(result.code, 2, result.output);
	assert.match(result.output, /could not fetch/);
});

test('a malformed or missing event payload exits 2, never clean', () => {
	const fx = fixture('bad-event');
	// the head commit is valid; the event file is not JSON
	const headSha = openPullRequest(fx, { 'README.md': 'base\n\nchange\n' });
	const env = ciEnv(fx, { baseSha: fx.baseSha, headSha });
	fs.writeFileSync(env.GITHUB_EVENT_PATH, 'not json\n');
	const malformed = runCi(fx, env);
	assert.equal(malformed.code, 2, malformed.output);
	assert.match(malformed.output, /not valid JSON/);

	const missing = runCi(fx, { ...env, GITHUB_EVENT_PATH: path.join(TMP, 'absent.json') });
	assert.equal(missing.code, 2, missing.output);
	assert.match(missing.output, /cannot read GITHUB_EVENT_PATH/);
});

test('a non-https, non-file remote URL exits 2 instead of fetching over a command transport', () => {
	const fx = fixture('bad-remote');
	const headSha = openPullRequest(fx, { 'README.md': 'base\n\nchange\n' });
	const env = ciEnv(fx, { baseSha: fx.baseSha, headSha });
	const event = JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
	event.pull_request.base.repo.clone_url = 'ext::sh -c echo pwned';
	fs.writeFileSync(env.GITHUB_EVENT_PATH, JSON.stringify(event));
	const result = runCi(fx, env);
	assert.equal(result.code, 2, result.output);
	assert.match(result.output, /is not a valid URL|refusing to fetch over/);
});

test('a missing or malformed TRUSTED_SHA exits 2, never clean', () => {
	const fx = fixture('no-trust');
	const headSha = openPullRequest(fx, { '.fallowrc.json': fallow(20) });
	const missing = runCi(fx, { ...ciEnv(fx, { baseSha: fx.baseSha, headSha }), TRUSTED_SHA: '' });
	assert.equal(missing.code, 2, missing.output);
	assert.match(missing.output, /TRUSTED_SHA is required/);
	const malformed = runCi(fx, { ...ciEnv(fx, { baseSha: fx.baseSha, headSha }), TRUSTED_SHA: 'not-a-commit' });
	assert.equal(malformed.code, 2, malformed.output);
	assert.match(malformed.output, /TRUSTED_SHA must be a full commit id/);
});

// ── separate roles, advanced base, different pull requests ──────────────────────

test('the source base and the trusted policy are separate roles', () => {
	const fx = fixture('separate-roles');
	// a pinned trusted commit that is not the source base, carrying the same approved policy
	const pinned = pinnedCommit(fx, 'trusted', { '.fallowrc.json': fallow(25), 'lint-kit.policy.json': policyText() });
	writeFiles(fx.seed, { 'README.md': 'base\n\nmain advanced\n' });
	git(fx.seed, ['add', '-A']);
	git(fx.seed, ['commit', '-qm', 'advance main']);
	git(fx.seed, ['push', '-q', 'origin', 'main']);
	const advanced = git(fx.seed, ['rev-parse', 'HEAD']);
	const headSha = openPullRequest(fx, { '.fallowrc.json': fallow(40) });
	const result = runCi(fx, ciEnv(fx, { baseSha: advanced, headSha, trustedSha: pinned }));
	assert.equal(result.code, 1, result.output);
	assert.match(result.stdout, /enrolled-weakened: health\.maxCognitive raised from 25 to 40/);
});

test('an advanced main still finds the merge base and judges only the pull request change', () => {
	const fx = fixture('advanced-main');
	const headSha = openPullRequest(fx, { 'README.md': 'base\n\npull request change\n' });
	writeFiles(fx.seed, { '.fallowrc.json': fallow(20) });
	git(fx.seed, ['add', '-A']);
	git(fx.seed, ['commit', '-qm', 'advance main with a tightening']);
	git(fx.seed, ['push', '-q', 'origin', 'main']);
	const advanced = git(fx.seed, ['rev-parse', 'HEAD']);
	const result = runCi(fx, ciEnv(fx, { baseSha: advanced, headSha, trustedSha: advanced }));
	assert.equal(result.code, 0, result.output);
	assert.match(result.stdout, /no unapproved enrolled change/);
});

test('a different pull request commit is judged, not the branch the event did not name', () => {
	const fx = fixture('different-pr');
	const safeHead = openPullRequest(fx, { 'README.md': 'base\n\nsafe\n' });
	const weakHead = openPullRequest(fx, { '.fallowrc.json': fallow(40) });
	// the event names the safe head, so the weakening commit is never read
	const safe = runCi(fx, ciEnv(fx, { baseSha: fx.baseSha, headSha: safeHead }));
	assert.equal(safe.code, 0, safe.output);
	const weak = runCi(fx, ciEnv(fx, { baseSha: fx.baseSha, headSha: weakHead }));
	assert.equal(weak.code, 1, weak.output);
});

// ── the remote and the credential are bound to the trusted repository ───────────

test('the trusted repository URL is accepted and a foreign one is refused before any fetch', () => {
	const fx = fixture('remote-binding');
	const headSha = openPullRequest(fx, { 'README.md': 'base\n\nchange\n' });
	// accepted: the exact runner server and repository, proven by the credential stage being reached
	for (const url of ['https://github.com/shayshahal/lint-kit.git', 'https://github.com/shayshahal/lint-kit']) {
		const accepted = runCi(
			fx,
			ciEnv(fx, { baseSha: fx.baseSha, headSha, event: { cloneUrl: url }, overrides: { GITHUB_TOKEN: '' } }),
		);
		assert.equal(accepted.code, 2, accepted.output);
		assert.match(accepted.output, /GITHUB_TOKEN is required for an https remote/, url);
	}
	// refused: a foreign host, another repository, userinfo, a query, a fragment and another scheme
	const refused = {
		'https://foreign.example/shayshahal/lint-kit.git': /does not match GITHUB_SERVER_URL\/GITHUB_REPOSITORY/,
		'https://github.com/attacker/lint-kit.git': /does not match GITHUB_SERVER_URL\/GITHUB_REPOSITORY/,
		'https://github.com/shayshahal/other.git': /does not match GITHUB_SERVER_URL\/GITHUB_REPOSITORY/,
		'https://synthetic-user:synthetic-secret@github.com/shayshahal/lint-kit.git': /must not carry userinfo/,
		'https://github.com/shayshahal/lint-kit.git?x=1': /must not carry userinfo/,
		'https://github.com/shayshahal/lint-kit.git#x': /must not carry userinfo/,
		'ext::sh -c echo pwned': /refusing to fetch over ext:/,
	};
	for (const [url, expected] of Object.entries(refused)) {
		const result = runCi(fx, ciEnv(fx, { baseSha: fx.baseSha, headSha, event: { cloneUrl: url } }));
		assert.equal(result.code, 2, `${url}: ${result.output}`);
		assert.match(result.output, expected, url);
	}
});

test('the trusted server and repository are validated, never defaulted', () => {
	const fx = fixture('validated-context');
	const headSha = openPullRequest(fx, { 'README.md': 'base\n\nchange\n' });
	const cases = [
		[{ GITHUB_REPOSITORY: 'owner' }, /GITHUB_REPOSITORY must be owner\/repo/],
		[{ GITHUB_REPOSITORY: 'owner/repo/extra' }, /GITHUB_REPOSITORY must be owner\/repo/],
		[{ GITHUB_SERVER_URL: 'http://github.com' }, /GITHUB_SERVER_URL must be an https origin/],
		[{ GITHUB_SERVER_URL: 'https://user:pass@github.com' }, /GITHUB_SERVER_URL must be a bare https origin/],
		[{ GITHUB_SERVER_URL: 'https://github.com/sub' }, /GITHUB_SERVER_URL must be a bare https origin/],
	];
	for (const [overrides, expected] of cases) {
		const result = runCi(fx, ciEnv(fx, { baseSha: fx.baseSha, headSha, overrides }));
		assert.equal(result.code, 2, `${JSON.stringify(overrides)}: ${result.output}`);
		assert.match(result.output, expected);
	}
});

test('a pull request against a branch other than the supported base exits 2', () => {
	const fx = fixture('wrong-branch');
	const headSha = openPullRequest(fx, { 'README.md': 'base\n\nchange\n' });
	const result = runCi(fx, ciEnv(fx, { baseSha: fx.baseSha, headSha, event: { baseRef: 'unprotected' } }));
	assert.equal(result.code, 2, result.output);
	assert.match(result.output, /not TRUSTED_BASE_BRANCH/);
});

test('a pull request whose base is another repository, or has no base branch, exits 2', () => {
	const fx = fixture('wrong-base');
	const headSha = openPullRequest(fx, { 'README.md': 'base\n\nchange\n' });
	const otherRepo = runCi(fx, ciEnv(fx, { baseSha: fx.baseSha, headSha, event: { baseRepository: 'attacker/lint-kit' } }));
	assert.equal(otherRepo.code, 2, otherRepo.output);
	assert.match(otherRepo.output, /not GITHUB_REPOSITORY/);
	const noRef = runCi(fx, editEvent(ciEnv(fx, { baseSha: fx.baseSha, headSha }), (event) => delete event.pull_request.base.ref));
	assert.equal(noRef.code, 2, noRef.output);
	assert.match(noRef.output, /not TRUSTED_BASE_BRANCH/);
});

test('an unsupported or missing event action exits 2', () => {
	const fx = fixture('wrong-action');
	const headSha = openPullRequest(fx, { 'README.md': 'base\n\nchange\n' });
	const closed = runCi(fx, ciEnv(fx, { baseSha: fx.baseSha, headSha, event: { action: 'closed' } }));
	assert.equal(closed.code, 2, closed.output);
	assert.match(closed.output, /not a supported pull_request_target action/);
	const missing = runCi(fx, editEvent(ciEnv(fx, { baseSha: fx.baseSha, headSha }), (event) => delete event.action));
	assert.equal(missing.code, 2, missing.output);
	assert.match(missing.output, /not a supported pull_request_target action/);
});

test('a missing trusted context input exits 2, never clean', () => {
	const fx = fixture('missing-context');
	const headSha = openPullRequest(fx, { 'README.md': 'base\n\nchange\n' });
	for (const name of ['GITHUB_REPOSITORY', 'GITHUB_SERVER_URL', 'TRUSTED_BASE_BRANCH']) {
		const result = runCi(fx, { ...ciEnv(fx, { baseSha: fx.baseSha, headSha }), [name]: '' });
		assert.equal(result.code, 2, `${name}: ${result.output}`);
		assert.match(result.output, new RegExp(`${name} is required`));
	}
});

test('a foreign clone_url is refused before a token exists and the token is never printed', () => {
	const fx = fixture('foreign-host');
	const headSha = openPullRequest(fx, { 'README.md': 'base\n\nchange\n' });
	const env = ciEnv(fx, {
		baseSha: fx.baseSha,
		headSha,
		event: { cloneUrl: 'https://foreign.example/shayshahal/lint-kit.git' },
		overrides: { GITHUB_TOKEN: SENTINEL },
	});
	const result = runCi(fx, env);
	assert.equal(result.code, 2, result.output);
	assert.match(result.output, /does not match GITHUB_SERVER_URL\/GITHUB_REPOSITORY/);
	assert.doesNotMatch(result.output, new RegExp(SENTINEL), 'the token is never printed');
});

test('a clone_url with userinfo is refused and its secret is never printed', () => {
	const fx = fixture('userinfo');
	const headSha = openPullRequest(fx, { 'README.md': 'base\n\nchange\n' });
	const env = ciEnv(fx, {
		baseSha: fx.baseSha,
		headSha,
		event: { cloneUrl: `https://user:${SENTINEL}@github.com/shayshahal/lint-kit.git` },
		overrides: { GITHUB_TOKEN: SENTINEL },
	});
	const result = runCi(fx, env);
	assert.equal(result.code, 2, result.output);
	assert.match(result.output, /must not carry userinfo/);
	assert.doesNotMatch(result.output, new RegExp(SENTINEL));
});

test('the guard runs with the token and inherited Git configuration removed', () => {
	const fx = fixture('scrubbed-guard');
	const headSha = openPullRequest(fx, { 'README.md': 'base\n\nchange\n' });
	// stand in for the trusted guard to observe the environment it is actually given
	fs.writeFileSync(
		path.join(fx.trusted, 'tools', 'policy', 'policy-guard.mjs'),
		"process.stdout.write(JSON.stringify({token: 'GITHUB_TOKEN' in process.env, config: 'GIT_CONFIG_COUNT' in process.env, trace: 'GIT_TRACE' in process.env, curl: 'GIT_CURL_VERBOSE' in process.env}) + '\\n');\nprocess.exit(0);\n",
	);
	const env = ciEnv(fx, {
		baseSha: fx.baseSha,
		headSha,
		overrides: {
			GITHUB_TOKEN: SENTINEL,
			GIT_CONFIG_COUNT: '1',
			GIT_CONFIG_KEY_0: 'http.extraheader',
			GIT_CONFIG_VALUE_0: `Authorization: basic ${SENTINEL}`,
			GIT_TRACE: '1',
			GIT_CURL_VERBOSE: '1',
		},
	});
	const result = runCi(fx, env);
	assert.equal(result.code, 0, result.output);
	assert.deepEqual(JSON.parse(result.stdout.trim()), { token: false, config: false, trace: false, curl: false });
	assert.doesNotMatch(result.output, new RegExp(SENTINEL), 'no inherited credential reaches the stream');
});

test('a lower- or mixed-case credential or Git variable cannot reach the guard', () => {
	const fx = fixture('case-insensitive-env');
	const headSha = openPullRequest(fx, { 'README.md': 'base\n\nchange\n' });
	// The stand-in guard reports every credential/config/trace variable it can see, whatever its
	// casing, whether the sentinel is anywhere in its environment, and that a legitimate mixed-case
	// variable still arrives with its value.
	fs.writeFileSync(
		path.join(fx.trusted, 'tools', 'policy', 'policy-guard.mjs'),
		"const names = Object.keys(process.env).map((key) => key.toUpperCase());\n" +
			"const watched = ['GITHUB_TOKEN', 'GIT_CONFIG_COUNT', 'GIT_CONFIG_KEY_0', 'GIT_CONFIG_VALUE_0', 'GIT_TRACE', 'GIT_CURL_VERBOSE', 'GIT_ASKPASS', 'SSH_ASKPASS'];\n" +
			"const kept = Object.entries(process.env).some(([key, value]) => key.toUpperCase() === 'LINT_KIT_MARKER' && value === 'kept');\n" +
			`process.stdout.write(JSON.stringify({seen: watched.filter((name) => names.includes(name)), sentinel: JSON.stringify(process.env).includes(${JSON.stringify(SENTINEL)}), kept}) + '\\n');\n` +
			'process.exit(0);\n',
	);
	// Only lower/mixed-case spellings are sent: no uppercase alias is present to shadow them.
	const result = runCiExact(fx, {
		...ciEnv(fx, { baseSha: fx.baseSha, headSha }),
		github_token: SENTINEL,
		Git_Config_Count: '1',
		git_config_key_0: 'http.extraheader',
		'git_config_value_0': `Authorization: basic ${SENTINEL}`,
		Git_Trace: '1',
		'Git_Curl_Verbose': '1',
		git_askpass: 'synthetic-askpass',
		Lint_Kit_Marker: 'kept',
	});
	assert.equal(result.code, 0, result.output);
	assert.deepEqual(JSON.parse(result.stdout.trim()), { seen: [], sentinel: false, kept: true });
	assert.doesNotMatch(result.output, new RegExp(SENTINEL), 'no case-variant credential reaches the stream');
});

test('a fetch failure is a fixed category, never Git stderr, and never leaks the token', () => {
	const fx = fixture('fixed-error');
	const env = ciEnv(fx, {
		baseSha: fx.baseSha,
		headSha: 'a'.repeat(40),
		overrides: { GITHUB_TOKEN: SENTINEL, GIT_TRACE: '1', GIT_CURL_VERBOSE: '1' },
	});
	const result = runCi(fx, env);
	assert.equal(result.code, 2, result.output);
	assert.match(result.output, /could not fetch a{40}/);
	assert.doesNotMatch(result.output, /fatal:|error:|Authorization/, 'no raw Git channel is printed');
	assert.doesNotMatch(result.output, new RegExp(SENTINEL));
});

// ── the template is a real, inactive, minimal candidate ─────────────────────────

test('init copies the trusted-CI helper and template but writes no workflow', async () => {
	const dir = path.join(TMP, unique('install-guidance'));
	fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
	fs.writeFileSync(path.join(dir, '.git', 'HEAD'), 'ref: refs/heads/main\n');
	fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"c"}\n');
	const lines = [];
	const log = console.log;
	console.log = (...values) => lines.push(values.join(' '));
	let code;
	try {
		code = await main(['init', '--no-install', '--cwd', dir, '--sets', 'policy-guard']);
	} finally {
		console.log = log;
	}
	assert.equal(code, 0);
	assert.ok(fs.existsSync(path.join(dir, 'tools', 'policy', 'policy-guard-ci.mjs')), 'the helper is copied');
	assert.ok(fs.existsSync(path.join(dir, 'tools', 'policy', 'policy-guard-ci.yml')), 'the template is copied');
	assert.equal(fs.existsSync(path.join(dir, '.github')), false, 'no workflow is written or activated');
	assert.match(lines.join('\n'), /manual template/);
});

test('the template is shipped as guidance and not activated in this repository', () => {
	assert.ok(fs.existsSync(TEMPLATE), 'the template is shipped');
	assert.equal(fs.existsSync(path.join(ROOT, '.github', 'workflows', 'policy-guard.yml')), false, 'not activated here');
	const workflow = parse(fs.readFileSync(TEMPLATE, 'utf8'));
	assert.deepEqual(Object.keys(workflow.on), ['pull_request_target']);
	assert.deepEqual(workflow.on.pull_request_target.branches, ['main'], 'one explicit protected base branch');
	assert.deepEqual(workflow.on.pull_request_target.types, ['opened', 'synchronize', 'reopened']);
	assert.equal(workflow.permissions.contents, 'read');
	assert.equal(workflow.jobs['policy-guard'].permissions.contents, 'read');
	assert.equal(workflow.jobs['policy-guard']['runs-on'], 'ubuntu-latest');
	const runStep = workflow.jobs['policy-guard'].steps.find((candidate) => /policy-guard-ci\.mjs/.test(candidate.run ?? ''));
	assert.equal(runStep.env.TRUSTED_BASE_BRANCH, 'main', 'the helper re-checks the base branch');
	assert.equal(runStep.env.TRUSTED_SHA, '${{ github.event.pull_request.base.sha }}');
	const checkout = workflow.jobs['policy-guard'].steps.find((candidate) => candidate.uses === 'actions/checkout@v4');
	assert.equal(checkout.with.ref, '${{ github.event.pull_request.base.sha }}', 'the trusted base commit is checked out');
	assert.equal(checkout.with['persist-credentials'], false);
	assert.doesNotMatch(JSON.stringify(workflow), /secrets\.(?!GITHUB_TOKEN)/);
});

test('the template command is executed for real and returns the guard verdict', () => {
	const fx = fixture('template-run');
	const headSha = openPullRequest(fx, { '.fallowrc.json': fallow(40) });
	const workflow = parse(fs.readFileSync(TEMPLATE, 'utf8'));
	const step = workflow.jobs['policy-guard'].steps.find((candidate) => /policy-guard-ci\.mjs/.test(candidate.run ?? ''));
	assert.ok(step, 'the template runs the helper');
	// The command is `node tools/policy/policy-guard-ci.mjs`; run it exactly as written, from the
	// trusted checkout, with the environment the template would supply.
	const env = ciEnv(fx, { baseSha: fx.baseSha, headSha });
	const result = spawnSync(step.run, { cwd: fx.trusted, encoding: 'utf8', shell: true, env: { ...process.env, GITHUB_TOKEN: '', ...env } });
	const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
	assert.equal(result.status, 1, output);
	assert.match(output, /enrolled-weakened: health\.maxCognitive raised from 25 to 40/);
});
