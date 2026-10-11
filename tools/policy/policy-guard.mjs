#!/usr/bin/env node
/**
 * policy-guard: reports an unapproved change to an enrolled checker configuration.
 *
 * A repository declares the checker files the first release watches in `lint-kit.policy.json`
 * (strict JSON, read only from the resolved `--trusted-ref` commit). This command takes the
 * source change since the merge-base of `--base` and `--target`, intersects it with those
 * enrolled paths, and reads each changed enrolled path's guarded values at the trusted and
 * target snapshots. A declared identity's supported direction decides the verdict: a `max`
 * ceiling may not rise, a `min` severity floor may not fall, and a `subset` ignore list may not
 * grow. A change outside the declared identities, and every `opaque` enrollment, is an unparsed
 * enrolled change that needs human review rather than a guessed verdict. The only parsed adapter
 * is `fallow-jsonc` for `.fallowrc.json`, read with `jsonc-parser`; no checker module is
 * imported, evaluated or executed, and the parser is loaded only when a parsed enrollment needs
 * it.
 *
 * The source change is always Git object-to-object: `git diff <mergeBase> <target>`. In
 * `working-tree` mode the working tree is read directly for every enrolled path and compared with
 * the merge-base object, and untracked status comes from `ls-files` metadata. The guard never
 * asks Git to diff the filesystem, so a repository clean filter cannot hide a mutation and no
 * filter command runs.
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
import { createRequire } from 'node:module';
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

/** Fallow's severity order: a `min` floor is weaker when its rank falls. */
const FALLOW_SEVERITY = ['off', 'warn', 'error'];

/**
 * The identities the frozen `fallow-jsonc` adapter knows, each with the only unit and direction
 * real Fallow configuration gives it. `health.maxCognitive` and `health.maxCrap` are numeric
 * score ceilings, `rules` is a rule-id -> severity floor map, and `ignorePatterns` is a literal
 * glob list. An enrollment that disagrees is a forged policy change, so it fails closed instead
 * of comparing, say, a `min` floor against a `max` ceiling and silently permitting the rise.
 */
const FALLOW_IDENTITIES = {
	'health.maxCognitive': { unit: 'score', direction: 'max' },
	'health.maxCrap': { unit: 'score', direction: 'max' },
	rules: { unit: 'severity-map', direction: 'min' },
	ignorePatterns: { unit: 'glob-list', direction: 'subset' },
};

/** jsonc-parser 3.3.1, loaded only when a parsed `jsonc` enrollment needs it. */
let jsoncParser;
function loadJsoncParser() {
	if (jsoncParser === undefined) {
		try {
			jsoncParser = createRequire(import.meta.url)('jsonc-parser');
		} catch (error) {
			throw new PolicyGuardError(`the fallow-jsonc adapter cannot load jsonc-parser: ${error.message}`);
		}
	}
	return jsoncParser;
}

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
 * Literal pathspecs for every Git call, so a filename holding `[`, `?` or `*` is matched as
 * itself and not as a pattern. The ambient `GIT_GLOB_PATHSPECS`/`GIT_NOGLOB_PATHSPECS` settings
 * are removed because they conflict with forcing literal matching.
 */
const GIT_ENV = { ...process.env, GIT_LITERAL_PATHSPECS: '1' };
delete GIT_ENV.GIT_GLOB_PATHSPECS;
delete GIT_ENV.GIT_NOGLOB_PATHSPECS;

/**
 * Runs one Git command in `repo` and returns its stdout. Throws PolicyGuardError on a non-zero
 * exit, so every caller fails closed with exit 2 instead of treating a Git failure as clean.
 */
function runGit(repo, args, encoding = 'utf8') {
	try {
		return execFileSync('git', ['--literal-pathspecs', ...args], {
			cwd: repo,
			encoding,
			stdio: ['ignore', 'pipe', 'pipe'],
			env: GIT_ENV,
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
		return execFileSync('git', ['--literal-pathspecs', 'rev-parse', '--show-toplevel'], {
			cwd,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
			env: GIT_ENV,
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
 * The source change between two commits, as a path -> kind map. `--name-status -M -z` is the
 * only lossless parse: a status token, then the path, NUL-separated, with raw UTF-8 names. Both
 * arguments are commits, so Git never reads the filesystem and never runs a clean filter;
 * `--no-ext-diff --no-textconv` also stop a repository diff driver from hiding a change.
 */
function readChangedPaths(repo, mergeBase, targetSha) {
	return parseNameStatus(
		runGit(repo, ['diff', '--no-ext-diff', '--no-textconv', '--name-status', '-M', '-z', '--end-of-options', mergeBase, targetSha, '--']),
	);
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
	if (slashed.startsWith('/') || /^[A-Za-z]:/.test(slashed)) {
		throw new PolicyGuardError(`${label} must be repository-relative, not absolute or drive-relative`);
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
 * The declared identities of a `fallow-jsonc` enrollment, checked against the identities real
 * Fallow configuration has. The unit and direction are identity, not decoration: a declaration
 * that disagrees with the adapter's known semantics fails closed, so a forged `min` floor on a
 * `max` ceiling can never make an actual weakening look clean.
 */
function parseFallowIdentities(identities, where) {
	return identities.map((identity, index) => {
		const at = `${where} identity ${index}`;
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
		const known = FALLOW_IDENTITIES[identity.id];
		if (known === undefined) throw new PolicyGuardError(`${at} id ${identity.id} is not a known fallow-jsonc identity`);
		if (identity.unit !== known.unit) {
			throw new PolicyGuardError(`${at} unit for ${identity.id} must be ${known.unit}, not ${identity.unit}`);
		}
		if (identity.direction !== known.direction) {
			throw new PolicyGuardError(`${at} direction for ${identity.id} must be ${known.direction}, not ${identity.direction}`);
		}
		return { id: identity.id, unit: identity.unit, direction: identity.direction };
	});
}

/**
 * The enrollment policy: the enrolled path set (plus the policy file itself, so it is
 * self-protected) and each enrollment's format and identities. `version` must be `1`; every
 * enrollment declares `id`, `source` and `format`; `jsonc` requires the frozen `fallow-jsonc`
 * adapter and at least one known identity; `opaque` declares neither. Unknown fields and enum
 * values are exit 2. No approval field is read, so a branch-owned approval cannot authorize
 * anything.
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
	const paths = new Set([policyPath]);
	const enrollments = [];
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
		const source = normalizePolicyPath(enrollment.source, `${where} source`);
		if (enrollment.format === 'opaque') {
			if ('adapter' in enrollment || 'identities' in enrollment) {
				throw new PolicyGuardError(`${where} is opaque, so it must not declare adapter or identities`);
			}
			enrollments.push({ source, format: 'opaque' });
		} else {
			if (!ADAPTERS.includes(enrollment.adapter)) {
				throw new PolicyGuardError(`${where} adapter must be one of ${ADAPTERS.join(', ')}`);
			}
			if (!Array.isArray(enrollment.identities) || enrollment.identities.length === 0) {
				throw new PolicyGuardError(`${where} needs a non-empty identities array`);
			}
			enrollments.push({ source, format: 'jsonc', adapter: enrollment.adapter, identities: parseFallowIdentities(enrollment.identities, where) });
		}
		paths.add(source);
	}
	return { paths, enrollments };
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

/**
 * Rejects a symbolic link or junction in any parent component of `relativePath`, so an enrolled
 * path cannot be followed out of the repository through a linked directory. The leaf itself is
 * checked by `readWorktreeFile`.
 */
function assertNoSymlinkParents(repo, relativePath) {
	const segments = relativePath.split('/');
	let current = repo;
	for (const segment of segments.slice(0, -1)) {
		current = path.join(current, segment);
		let stats;
		try {
			stats = fs.lstatSync(current);
		} catch (error) {
			if (error.code === 'ENOENT') return;
			throw new PolicyGuardError(`cannot inspect ${relativePath}: ${error.message}`);
		}
		if (stats.isSymbolicLink()) throw new PolicyGuardError(`${relativePath} has a symbolic link in its path`);
		if (!stats.isDirectory()) return;
	}
}

/** The raw bytes of an enrolled path in the working tree, or null when it is absent. */
function readWorktreeFile(repo, relativePath) {
	assertNoSymlinkParents(repo, relativePath);
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

/**
 * The working-tree source change: every enrolled path whose raw bytes differ from the merge-base
 * object, plus the raw bytes read. This reads files directly and never asks Git to diff the
 * filesystem, so a repository clean filter cannot hide a mutation and no filter command runs. A
 * path whose raw bytes equal the merge-base object is unchanged and is not added.
 */
function readWorkingTreeSourceChanges(repo, mergeBase, enrolledPaths) {
	const changes = new Map();
	const rawBytes = new Map();
	for (const relativePath of enrolledPaths) {
		const raw = readWorktreeFile(repo, relativePath);
		rawBytes.set(relativePath, raw);
		const atMergeBase = readCommitBlob(repo, mergeBase, relativePath);
		if (sameBytes(raw, atMergeBase)) continue;
		changes.set(relativePath, raw === null ? 'deleted' : atMergeBase === null ? 'added' : 'modified');
	}
	return { changes, rawBytes };
}

function sameBytes(left, right) {
	if (left === null || right === null) return left === right;
	return left.equals(right);
}

/**
 * The text of raw file bytes, decoded as strict UTF-8. `Buffer.toString('utf8')` and a
 * non-fatal `TextDecoder` both replace every invalid byte with U+FFFD, so an invalid byte in the
 * target would read exactly like a literal U+FFFD in the trusted snapshot and the change would
 * pass silently. A fatal decoder throws instead, so a byte sequence that is not valid UTF-8
 * fails closed (exit 2) at the owning raw-byte boundary. `ignoreBOM: true` keeps a byte-order
 * mark as text, so adding or removing one is a visible residual edit rather than an implicit
 * normalization that hides it.
 */
function decodeUtf8Strict(bytes, source, snapshot) {
	try {
		return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
	} catch {
		throw new PolicyGuardError(`${source} is not valid UTF-8 at ${snapshot}`);
	}
}

/** A parsed JSONC document with every comment text, so an edit outside the values is still seen. */
function parseJsoncDocument(text, source, snapshot) {
	const jsonc = loadJsoncParser();
	const errors = [];
	const tree = jsonc.parseTree(text, errors);
	if (errors.length > 0) {
		throw new PolicyGuardError(`${source} is not valid JSONC at ${snapshot}: ${jsonc.printParseErrorCode(errors[0].error)}`);
	}
	const comments = [];
	jsonc.visit(text, { onComment: (offset, length) => comments.push(text.slice(offset, offset + length)) });
	return { text, tree, comments };
}

/**
 * One declared identity's value and its source range in a parsed document. A value absent or
 * wrong-typed for its unit is exit 2, never a default: the guard cannot compare a value it did
 * not read.
 */
function readFallowIdentityValue(document, identity, source, snapshot) {
	const jsonc = loadJsoncParser();
	const node = jsonc.findNodeAtLocation(document.tree, identity.id.split('.'));
	if (node === undefined) throw new PolicyGuardError(`${source} has no ${identity.id} at ${snapshot}`);
	const value = jsonc.getNodeValue(node);
	const range = [node.offset, node.offset + node.length];
	if (identity.unit === 'score') {
		if (typeof value !== 'number' || !Number.isFinite(value)) {
			throw new PolicyGuardError(`${source} ${identity.id} must be a number at ${snapshot}`);
		}
		return { value, range };
	}
	if (identity.unit === 'severity-map') {
		if (!isPlainObject(value)) throw new PolicyGuardError(`${source} ${identity.id} must be an object at ${snapshot}`);
		for (const [rule, severity] of Object.entries(value)) {
			if (!FALLOW_SEVERITY.includes(severity)) {
				throw new PolicyGuardError(`${source} ${identity.id}.${rule} must be one of ${FALLOW_SEVERITY.join(', ')} at ${snapshot}`);
			}
		}
		return { value, range };
	}
	if (identity.unit === 'glob-list') {
		if (!Array.isArray(value) || value.some((pattern) => typeof pattern !== 'string')) {
			throw new PolicyGuardError(`${source} ${identity.id} must be a string array at ${snapshot}`);
		}
		return { value, range };
	}
	throw new PolicyGuardError(`${source} ${identity.id} has unsupported unit ${identity.unit}`);
}

/** The weakening sentence for one declared identity, or null when the change is equal or tighter. */
function compareFallowIdentity(identity, trustedValue, targetValue) {
	if (identity.direction === 'max') {
		return targetValue > trustedValue ? `raised from ${trustedValue} to ${targetValue} (a max ceiling must not rise)` : null;
	}
	if (identity.direction === 'min') {
		for (const [rule, trustedSeverity] of Object.entries(trustedValue)) {
			const targetSeverity = targetValue[rule];
			if (targetSeverity === undefined) return `removed rule ${rule} (a min floor must not withdraw)`;
			if (FALLOW_SEVERITY.indexOf(targetSeverity) < FALLOW_SEVERITY.indexOf(trustedSeverity)) {
				return `lowered ${rule} from ${trustedSeverity} to ${targetSeverity} (a min floor must not fall)`;
			}
		}
		for (const [rule, targetSeverity] of Object.entries(targetValue)) {
			if (rule in trustedValue) continue;
			if (FALLOW_SEVERITY.indexOf(targetSeverity) < FALLOW_SEVERITY.indexOf('error')) {
				return `added rule ${rule} at ${targetSeverity} (a new setting weaker than error)`;
			}
		}
		return null;
	}
	if (identity.direction === 'subset') {
		const trustedPatterns = new Set(trustedValue);
		for (const pattern of targetValue) {
			if (!trustedPatterns.has(pattern)) return `added ignore ${JSON.stringify(pattern)} (the ignore set must not grow)`;
		}
		return null;
	}
	throw new PolicyGuardError(`${identity.id} has unsupported direction ${identity.direction}`);
}

/** The document text with the declared identity value ranges replaced, so only other edits remain. */
function fallowResidual(document, ranges) {
	const sorted = [...ranges].sort((left, right) => left[0] - right[0]);
	let residual = '';
	let cursor = 0;
	for (const [start, end] of sorted) {
		residual += document.text.slice(cursor, start) + '\0';
		cursor = end;
	}
	return residual + document.text.slice(cursor);
}

/**
 * The verdict for one changed `jsonc` source: a `weakened` detail per declared identity that
 * loosened, plus an `unrecognized` detail when anything outside the declared values changed
 * (another key, a comment, or whitespace). An empty list means every change was equal or
 * tighter, so the enrolled change is silent.
 */
function compareFallowSource(trustedBytes, targetBytes, identities, source) {
	const uniqueIdentities = [...new Map(identities.map((identity) => [identity.id, identity])).values()];
	const trustedDocument = parseJsoncDocument(decodeUtf8Strict(trustedBytes, source, '--trusted-ref'), source, '--trusted-ref');
	const targetDocument = parseJsoncDocument(decodeUtf8Strict(targetBytes, source, '--target'), source, '--target');
	const trustedRanges = [];
	const targetRanges = [];
	const details = [];
	for (const identity of uniqueIdentities) {
		const trustedValue = readFallowIdentityValue(trustedDocument, identity, source, '--trusted-ref');
		const targetValue = readFallowIdentityValue(targetDocument, identity, source, '--target');
		trustedRanges.push(trustedValue.range);
		targetRanges.push(targetValue.range);
		const weakening = compareFallowIdentity(identity, trustedValue.value, targetValue.value);
		if (weakening !== null) details.push({ kind: 'weakened', message: `${identity.id} ${weakening}` });
	}
	if (JSON.stringify(trustedDocument.comments) !== JSON.stringify(targetDocument.comments)) {
		details.push({ kind: 'unrecognized', message: 'a comment changed outside the enrolled values' });
	}
	if (fallowResidual(trustedDocument, trustedRanges) !== fallowResidual(targetDocument, targetRanges)) {
		details.push({ kind: 'unrecognized', message: 'a value changed outside the enrolled identities' });
	}
	return details;
}

/** Enrollments keyed by their normalized source path, so each changed path is judged once. */
function groupEnrollmentsBySource(enrollments) {
	const bySource = new Map();
	for (const enrollment of enrollments) {
		const group = bySource.get(enrollment.source);
		if (group === undefined) bySource.set(enrollment.source, [enrollment]);
		else group.push(enrollment);
	}
	return bySource;
}

/** Prints findings with a stable id and a project-relative location, then the summary line. */
function reportFindings(options, findings, changes, enrolled) {
	for (const finding of findings) {
		console.log(`policy-guard: enrolled-change: ${finding.path} (${finding.change})`);
		for (const detail of finding.details) {
			console.log(`policy-guard: enrolled-${detail.kind}: ${detail.message}`);
		}
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
 * take the object-to-object source change, and judge each enrolled path whose target bytes
 * diverge from the trusted snapshot. An `opaque` path is review; a `jsonc` path is compared by
 * its declared identities' direction, and a change the adapter cannot place fails closed. In
 * working-tree mode the target bytes are the raw working-tree bytes, and untracked and
 * raw-source candidates augment the committed change. A change whose target bytes already match
 * the trusted snapshot is not a new unapproved change.
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
	const { paths: enrolled, enrollments } = parseEnrollmentPolicy(decodeUtf8Strict(policyBytes, policyPath, '--trusted-ref'), policyPath);
	const mergeBase = findMergeBase(repo, targetSha, baseSha);
	const changes = readChangedPaths(repo, mergeBase, targetSha);
	let workingTreeBytes = null;
	if (options.mode === 'working-tree') {
		const sourceChanges = readWorkingTreeSourceChanges(repo, mergeBase, enrolled);
		for (const [relativePath, kind] of sourceChanges.changes) {
			if (!changes.has(relativePath)) changes.set(relativePath, kind);
		}
		workingTreeBytes = sourceChanges.rawBytes;
		for (const [relativePath, kind] of readUntrackedEnrolled(repo, enrolled)) {
			changes.set(relativePath, kind);
		}
	}
	const findings = [];
	const enrollmentsBySource = groupEnrollmentsBySource(enrollments);
	for (const relativePath of [...enrolled].sort()) {
		if (!changes.has(relativePath)) continue;
		const targetBytes =
			options.mode === 'committed' ? readCommitBlob(repo, targetSha, relativePath) : workingTreeBytes.get(relativePath);
		const trustedBytes = readCommitBlob(repo, trustedSha, relativePath);
		if (sameBytes(targetBytes, trustedBytes)) continue;
		const group = enrollmentsBySource.get(relativePath);
		if (group === undefined || group.some((enrollment) => enrollment.format === 'opaque') || trustedBytes === null || targetBytes === null) {
			findings.push({ path: relativePath, change: changes.get(relativePath), details: [] });
			continue;
		}
		const details = compareFallowSource(trustedBytes, targetBytes, group.flatMap((enrollment) => enrollment.identities), relativePath);
		if (details.length > 0) findings.push({ path: relativePath, change: changes.get(relativePath), details });
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
