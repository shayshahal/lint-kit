#!/usr/bin/env node
/**
 * policy-guard: reports an unapproved change to an enrolled checker configuration.
 *
 * A repository declares the checker files the first release watches in `lint-kit.policy.json`
 * (strict JSON, read only from the resolved `--trusted-ref` commit). This command diffs the
 * source change since the merge-base of `--base` and `--target`, intersects it with those
 * enrolled paths, and reports each enrolled path whose target bytes differ from the trusted
 * snapshot. It parses no checker format: an enrolled file is an opaque path, and a change to it
 * needs human review rather than a guessed verdict.
 *
 * Two baselines stay separate. The source baseline is the merge-base of `--base` and `--target`;
 * the trusted baseline is the commit named by `--trusted-ref`, selected outside the branch. The
 * guard never defaults the trusted snapshot to HEAD, the target or the working tree, and it never
 * imports or executes repository code: it only reads Git objects and files.
 *
 * Exit `0` clean or advisory-only, `1` an unapproved enrolled change, `2` the check could not run
 * (a missing or unresolvable input, a malformed policy, or a Git failure). A local run is
 * feedback, not authorization; required CI blocks both `1` and `2`.
 *
 * The interface and exit contract are in README.md beside this file.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const USAGE =
	'usage: policy-guard --base <ref> --target <ref> --trusted-ref <ref> --policy <path> ' +
	'--mode committed|working-tree [--cwd <dir>]';

/** The source snapshots the guard can inspect. */
const MODES = ['committed', 'working-tree'];

/** The enrollment formats the first release supports. */
const FORMATS = ['jsonc', 'opaque'];

/** The only parsed checker adapter frozen for the first release. */
const ADAPTERS = ['fallow-jsonc'];

/** The comparison directions an enrolled identity may declare. */
const DIRECTIONS = ['max', 'min', 'subset'];

/** The status letter `git diff --name-status` prints for a plain change. */
const CHANGE_KIND = {
	A: 'added',
	D: 'deleted',
	M: 'modified',
	T: 'typechanged',
	U: 'unmerged',
	X: 'unknown',
};

/** The check cannot run: a missing input, a malformed policy, or a Git failure. */
class PolicyGuardError extends Error {}

/**
 * Runs one Git command in `repo` and returns its stdout. Throws PolicyGuardError on a non-zero
 * exit, so every caller fails closed with exit 2 instead of treating a Git failure as clean.
 */
function runGit(repo, args, encoding = 'utf8') {
	try {
		return execFileSync('git', args, {
			cwd: repo,
			encoding,
			stdio: ['ignore', 'pipe', 'pipe'],
			maxBuffer: 64 * 1024 * 1024,
		});
	} catch (error) {
		const detail = String(error.stderr ?? '').trim() || error.message;
		throw new PolicyGuardError(`git ${args.join(' ')} failed: ${detail}`);
	}
}

/** The working-tree root of `cwd`, or exit 2 when `cwd` is not inside a Git repository. */
function resolveRepositoryRoot(cwd) {
	try {
		return execFileSync('git', ['rev-parse', '--show-toplevel'], {
			cwd,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
		}).trim();
	} catch {
		throw new PolicyGuardError(`--cwd ${cwd} is not inside a Git repository`);
	}
}

/**
 * The full commit SHA `ref` names. `--end-of-options` keeps a ref such as `--octopus` or
 * `--output=x` from being read as a Git option, so option injection fails with exit 2 and never
 * writes a file.
 */
function resolveCommitRef(repo, label, ref) {
	if (typeof ref !== 'string' || ref.length === 0 || ref.includes('\0')) {
		throw new PolicyGuardError(`${label} must be a non-empty ref`);
	}
	return runGit(repo, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]).trim();
}

/** The common ancestor of two resolved commits; unrelated histories have none, so exit 2. */
function findMergeBase(repo, targetSha, baseSha) {
	const mergeBase = runGit(repo, ['merge-base', '--end-of-options', targetSha, baseSha]).trim();
	if (mergeBase.length === 0) throw new PolicyGuardError('the target and base have no merge base');
	return mergeBase;
}

/** Path -> change kind for every file the source change touched, parsed from NUL-safe output. */
function parseNameStatus(raw) {
	const fields = raw.split('\0');
	const changes = new Map();
	for (let i = 0; i < fields.length; i++) {
		const status = fields[i];
		if (status === '') break;
		if (status[0] === 'R' || status[0] === 'C') {
			const from = fields[++i];
			const to = fields[++i];
			changes.set(from, status[0] === 'R' ? 'renamed-from' : 'copied-from');
			changes.set(to, status[0] === 'R' ? 'renamed-to' : 'copied-to');
		} else {
			changes.set(fields[++i], CHANGE_KIND[status[0]] ?? 'changed');
		}
	}
	return changes;
}

/**
 * The source change since `mergeBase`, as a path -> kind map. `--name-status -M -z` is the only
 * lossless parse: a status token, then the path, NUL-separated, with raw UTF-8 names. A second
 * revision means committed-only; omitting it compares the merge-base to the working tree.
 * `--no-ext-diff --no-textconv` stop a repository diff driver from hiding a change.
 */
function readChangedPaths(repo, mergeBase, targetSha) {
	const args = ['diff', '--no-ext-diff', '--no-textconv', '--name-status', '-M', '-z', '--end-of-options', mergeBase];
	if (targetSha !== null) args.push(targetSha);
	args.push('--');
	return parseNameStatus(runGit(repo, args));
}

/**
 * Enrolled paths that exist in the working tree but are not tracked. `--others` without
 * `--exclude-standard` still hides ignored files, so the ignored form is asked too: an explicit
 * enrollment must not be hidden by an ignore pattern.
 */
function readUntrackedEnrolled(repo, enrolledPaths) {
	const untracked = new Map();
	for (const relativePath of enrolledPaths) {
		const listed =
			runGit(repo, ['ls-files', '-z', '--others', '--exclude-standard', '--', relativePath]).length > 0 ||
			runGit(repo, ['ls-files', '-z', '--others', '--ignored', '--exclude-standard', '--', relativePath]).length > 0;
		if (listed) untracked.set(relativePath, 'untracked');
	}
	return untracked;
}

/** A repository-relative path in forward-slash form, or exit 2 for absolute, `..` or NUL input. */
function normalizePolicyPath(value, label) {
	if (typeof value !== 'string' || value.length === 0) {
		throw new PolicyGuardError(`${label} must be a non-empty string`);
	}
	if (value.includes('\0')) throw new PolicyGuardError(`${label} must not contain a NUL byte`);
	const slashed = value.replaceAll('\\', '/');
	if (slashed.startsWith('/') || /^[A-Za-z]:\//.test(slashed)) {
		throw new PolicyGuardError(`${label} must be repository-relative, not absolute`);
	}
	const segments = slashed.split('/').filter((segment) => segment !== '' && segment !== '.');
	if (segments.length === 0 || segments.includes('..')) {
		throw new PolicyGuardError(`${label} must stay inside the repository`);
	}
	return segments.join('/');
}

function isPlainObject(value) {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Rejects unknown fields and missing required ones, so a malformed policy fails closed. */
function requireExactKeys(object, required, where, optional = []) {
	const allowed = new Set([...required, ...optional]);
	for (const key of Object.keys(object)) {
		if (!allowed.has(key)) throw new PolicyGuardError(`${where} has unknown field ${key}`);
	}
	for (const key of required) {
		if (!(key in object)) throw new PolicyGuardError(`${where} is missing required field ${key}`);
	}
}

/**
 * The enrolled path set from the trusted enrollment file, plus the enrollment file itself so it
 * is self-protected. `version` must be `1`; every enrollment declares `id`, `source` and
 * `format`; `jsonc` requires the frozen `fallow-jsonc` adapter and at least one identity;
 * `opaque` declares neither. Unknown fields and enum values are exit 2. No approval field is
 * read, so a branch-owned approval cannot authorize anything.
 */
function parseEnrollmentPolicy(text, policyPath) {
	let document;
	try {
		document = JSON.parse(text);
	} catch (error) {
		throw new PolicyGuardError(`policy ${policyPath} is not valid JSON: ${error.message}`);
	}
	if (!isPlainObject(document)) throw new PolicyGuardError(`policy ${policyPath} must be a JSON object`);
	requireExactKeys(document, ['version', 'enrollments'], `policy ${policyPath}`);
	if (document.version !== 1) throw new PolicyGuardError(`policy ${policyPath} version must be 1`);
	if (!Array.isArray(document.enrollments) || document.enrollments.length === 0) {
		throw new PolicyGuardError(`policy ${policyPath} needs a non-empty enrollments array`);
	}
	const enrolled = new Set([policyPath]);
	const ids = new Set();
	for (const [index, enrollment] of document.enrollments.entries()) {
		const where = `policy ${policyPath} enrollment ${index}`;
		if (!isPlainObject(enrollment)) throw new PolicyGuardError(`${where} must be an object`);
		requireExactKeys(enrollment, ['id', 'source', 'format'], where, ['adapter', 'identities']);
		if (typeof enrollment.id !== 'string' || enrollment.id.length === 0) {
			throw new PolicyGuardError(`${where} id must be a non-empty string`);
		}
		if (ids.has(enrollment.id)) throw new PolicyGuardError(`${where} id ${enrollment.id} is declared twice`);
		ids.add(enrollment.id);
		if (!FORMATS.includes(enrollment.format)) {
			throw new PolicyGuardError(`${where} format must be one of ${FORMATS.join(', ')}`);
		}
		if (enrollment.format === 'opaque') {
			if ('adapter' in enrollment || 'identities' in enrollment) {
				throw new PolicyGuardError(`${where} is opaque, so it must not declare adapter or identities`);
			}
		} else {
			if (!ADAPTERS.includes(enrollment.adapter)) {
				throw new PolicyGuardError(`${where} adapter must be one of ${ADAPTERS.join(', ')}`);
			}
			if (!Array.isArray(enrollment.identities) || enrollment.identities.length === 0) {
				throw new PolicyGuardError(`${where} needs a non-empty identities array`);
			}
			for (const [identityIndex, identity] of enrollment.identities.entries()) {
				const at = `${where} identity ${identityIndex}`;
				if (!isPlainObject(identity)) throw new PolicyGuardError(`${at} must be an object`);
				requireExactKeys(identity, ['id', 'unit', 'direction'], at);
				if (typeof identity.id !== 'string' || identity.id.length === 0) {
					throw new PolicyGuardError(`${at} id must be a non-empty string`);
				}
				if (typeof identity.unit !== 'string' || identity.unit.length === 0) {
					throw new PolicyGuardError(`${at} unit must be a non-empty string`);
				}
				if (!DIRECTIONS.includes(identity.direction)) {
					throw new PolicyGuardError(`${at} direction must be one of ${DIRECTIONS.join(', ')}`);
				}
			}
		}
		enrolled.add(normalizePolicyPath(enrollment.source, `${where} source`));
	}
	return enrolled;
}

/**
 * The bytes of `relativePath` at `commitSha`, or null when the path is absent there. A tree,
 * gitlink or symbolic link is rejected rather than followed, so no read leaves the repository.
 */
function readCommitBlob(repo, commitSha, relativePath) {
	const listing = runGit(repo, ['ls-tree', '-z', commitSha, '--', relativePath]);
	if (listing.length === 0) return null;
	const entry = listing.slice(0, listing.indexOf('\0'));
	const [mode, type, sha] = entry.split('\t')[0].split(' ');
	if (type !== 'blob') throw new PolicyGuardError(`${relativePath} is a ${type} at ${commitSha}, not a file`);
	if (mode === '120000') throw new PolicyGuardError(`${relativePath} is a symbolic link at ${commitSha}`);
	return runGit(repo, ['cat-file', 'blob', sha], null);
}

/** The raw bytes of an enrolled path in the working tree, or null when it is absent. */
function readWorktreeFile(repo, relativePath) {
	const absolute = path.join(repo, ...relativePath.split('/'));
	let stats;
	try {
		stats = fs.lstatSync(absolute);
	} catch (error) {
		if (error.code === 'ENOENT') return null;
		throw new PolicyGuardError(`cannot read ${relativePath}: ${error.message}`);
	}
	if (stats.isSymbolicLink()) throw new PolicyGuardError(`${relativePath} is a symbolic link in the working tree`);
	if (!stats.isFile()) throw new PolicyGuardError(`${relativePath} is not a regular file in the working tree`);
	return fs.readFileSync(absolute);
}

function sameBytes(left, right) {
	if (left === null || right === null) return left === right;
	return left.equals(right);
}

/** Prints findings with a stable id and a project-relative location, then the summary line. */
function reportFindings(options, findings, changes, enrolled) {
	for (const finding of findings) {
		console.log(`policy-guard: enrolled-change: ${finding.path} (${finding.change})`);
	}
	if (findings.length > 0) {
		console.log(`policy-guard: ${findings.length} unapproved enrolled change(s); review required (local feedback is not authorization)`);
		return;
	}
	console.log(`policy-guard: no unapproved enrolled change since ${options.base}`);
	const advisory = [...changes.keys()].filter((changed) => !enrolled.has(changed));
	if (advisory.length > 0) console.log(`policy-guard: ${advisory.length} non-enrolled file(s) changed (advisory)`);
}

/**
 * The whole check: resolve the three commits, read the enrollment from the trusted commit only,
 * diff the source change, and report enrolled paths whose target bytes diverge from the trusted
 * snapshot. A change whose target bytes already match the trusted snapshot is not a new
 * unapproved change.
 */
function runPolicyGuard(options) {
	const repo = resolveRepositoryRoot(options.cwd);
	const baseSha = resolveCommitRef(repo, '--base', options.base);
	const targetSha = resolveCommitRef(repo, '--target', options.target);
	const trustedSha = resolveCommitRef(repo, '--trusted-ref', options.trustedRef);
	if (options.mode === 'working-tree') {
		const headSha = resolveCommitRef(repo, 'HEAD', 'HEAD');
		if (headSha !== targetSha) {
			throw new PolicyGuardError(`--mode working-tree needs --target to be HEAD (${headSha}), not ${options.target}`);
		}
	}
	const policyPath = normalizePolicyPath(options.policy, '--policy');
	const policyBytes = readCommitBlob(repo, trustedSha, policyPath);
	if (policyBytes === null) {
		throw new PolicyGuardError(`policy ${policyPath} does not exist at --trusted-ref ${options.trustedRef}`);
	}
	const enrolled = parseEnrollmentPolicy(policyBytes.toString('utf8'), policyPath);
	const mergeBase = findMergeBase(repo, targetSha, baseSha);
	const changes = readChangedPaths(repo, mergeBase, options.mode === 'committed' ? targetSha : null);
	if (options.mode === 'working-tree') {
		for (const [relativePath, kind] of readUntrackedEnrolled(repo, enrolled)) {
			if (!changes.has(relativePath)) changes.set(relativePath, kind);
		}
	}
	const findings = [];
	for (const relativePath of [...enrolled].sort()) {
		if (!changes.has(relativePath)) continue;
		const targetBytes =
			options.mode === 'committed' ? readCommitBlob(repo, targetSha, relativePath) : readWorktreeFile(repo, relativePath);
		const trustedBytes = readCommitBlob(repo, trustedSha, relativePath);
		if (sameBytes(targetBytes, trustedBytes)) continue;
		findings.push({ path: relativePath, change: changes.get(relativePath) });
	}
	reportFindings(options, findings, changes, enrolled);
	return findings.length === 0 ? 0 : 1;
}

/** The parsed CLI inputs, or null when `--help` was printed. */
function parseGuardArguments(argv) {
	const names = {
		'--base': 'base',
		'--target': 'target',
		'--trusted-ref': 'trustedRef',
		'--policy': 'policy',
		'--mode': 'mode',
		'--cwd': 'cwd',
	};
	const options = { cwd: process.cwd() };
	const seen = new Set();
	for (let i = 0; i < argv.length; i++) {
		const argument = argv[i];
		if (argument === '--help' || argument === '-h') {
			console.log(USAGE);
			return null;
		}
		const key = names[argument];
		if (key === undefined) throw new PolicyGuardError(`unknown argument: ${argument}`);
		if (seen.has(key)) throw new PolicyGuardError(`duplicate argument: ${argument}`);
		seen.add(key);
		const value = argv[++i];
		if (value === undefined) throw new PolicyGuardError(`${argument} needs a value`);
		options[key] = value;
	}
	for (const [flag, key] of Object.entries(names)) {
		if (key !== 'cwd' && !seen.has(key)) throw new PolicyGuardError(`missing required argument: ${flag}`);
	}
	if (!MODES.includes(options.mode)) {
		throw new PolicyGuardError(`--mode must be committed or working-tree, not ${options.mode}`);
	}
	return options;
}

/** Runs the guard and maps its outcome to the documented exit code. */
export function main(argv = process.argv.slice(2)) {
	try {
		const options = parseGuardArguments(argv);
		if (options === null) return 0;
		return runPolicyGuard(options);
	} catch (error) {
		const message = error instanceof PolicyGuardError ? error.message : (error?.stack ?? String(error));
		console.error(`policy-guard: ${message}`);
		return 2;
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	process.exitCode = main();
}
