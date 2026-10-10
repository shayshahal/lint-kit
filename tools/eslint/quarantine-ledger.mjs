/**
 * quarantine-ledger: the repository-root `test-quarantine.json` format.
 *
 * One entry excuses one unconditional test/describe disabling call — nothing else. It is
 * structural permission to leave that call disabled until a date, not proof that anyone approved
 * it: approval is the repository's trusted-ref review of this file (see the pre-push validator
 * and the opaque `lint-kit.policy.json` enrollment the installer names). An entry is addressed by
 * the repository-relative `file` and the 1-based start `line`/`column` of the *enclosing*
 * test/describe call, plus `sourceCallSha256`, the SHA-256 of that call's exact source text with
 * CRLF normalized to LF. The hash is what keeps a move, a replacement or a broadened group body
 * from reusing a waiver: the source bytes change, so the entry no longer matches.
 *
 * `reason` and `owner` are free text, trimmed and non-empty. `expires` is an inclusive UTC
 * calendar date; an entry is valid through the end of that day. The module never logs an entry's
 * reason, owner or source: callers get metadata (location, hash, status, date) only, and a
 * malformed or unreadable ledger grants no exception at all (fail closed). The document is exactly
 * `{version, entries}`: an unknown top-level key makes the whole ledger invalid, so a hand-added
 * approval field cannot smuggle a capability in. Reading is fail closed too — the ledger must be a
 * regular file inside the repository root, decoded as strict UTF-8; a symlink (dangling or not), a
 * directory, an unreadable path or an invalid byte sequence is invalid, never a clean absence.
 *
 * This module owns the format and the lifecycle (structural validity and expiry). The ESLint
 * `vitest/no-disabled-tests` rule reuses it to decide one report; the CLI beside it
 * (`check-quarantine-ledger.mjs`) is the repository-wide structural check that runs even when no
 * test file is in a push. Neither is a general exception system.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { realpathSync } from 'node:fs';
import path from 'node:path';

/** The one ledger name, always at the Git repository root. */
export const QUARANTINE_LEDGER_FILENAME = 'test-quarantine.json';

/** The hash of `sourceCallSha256`, spelled out so a reader never guesses the field's unit. */
export const SOURCE_CALL_HASH_ALGORITHM = 'sha256';

/** The exact fields one entry may carry; an unknown or missing field makes the ledger invalid. */
const ENTRY_FIELDS = ['file', 'line', 'column', 'sourceCallSha256', 'reason', 'owner', 'expires'];

/** The exact fields the document may carry; an unknown top-level key is not an approval field. */
const DOCUMENT_FIELDS = ['version', 'entries'];

const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A repository-relative path in forward-slash form, or null. The same shape the policy guard
 * accepts: no absolute path, drive letter, NUL, `.` or `..` segment, and no empty path.
 */
export function normalizeLedgerFile(value) {
	if (typeof value !== 'string' || value.length === 0) return null;
	if (value.includes('\0')) return null;
	const slashed = value.replaceAll('\\', '/');
	if (slashed.startsWith('/') || /^[A-Za-z]:/.test(slashed)) return null;
	const segments = slashed.split('/').filter((segment) => segment !== '' && segment !== '.');
	if (segments.length === 0 || segments.includes('..')) return null;
	return segments.join('/');
}

/**
 * The exact source call's SHA-256, with CRLF normalized to LF so a Windows and a POSIX checkout
 * of the same call hash the same. It is the call text, not a parse of it: no whitespace or
 * semantic guess is applied, so a changed fingerprint is a changed call.
 */
export function hashSourceCallText(sourceText) {
	return createHash(SOURCE_CALL_HASH_ALGORITHM)
		.update(String(sourceText).replace(/\r\n/g, '\n'))
		.digest('hex');
}

/** Today as a UTC `YYYY-MM-DD`. `now` is a pure boundary for tests; production reads the clock. */
export function currentUtcDate(now = new Date()) {
	return now.toISOString().slice(0, 10);
}

/** True when `value` is a real `YYYY-MM-DD` date, checked by a UTC round-trip (`2026-02-30` is not). */
export function isRealUtcDate(value) {
	if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const date = new Date(`${value}T00:00:00.000Z`);
	return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** An entry is expired the UTC day after `expires`; `expires` is inclusive through that day. */
export function isQuarantineEntryExpired(entry, todayUtc) {
	return entry.expires < todayUtc;
}

/** One structurally valid entry, or null. Reason and owner are trimmed but never reported. */
function parseEntry(raw) {
	if (!isPlainObject(raw)) return null;
	const keys = Object.keys(raw);
	if (keys.length !== ENTRY_FIELDS.length) return null;
	if (!ENTRY_FIELDS.every((field) => field in raw)) return null;
	const file = normalizeLedgerFile(raw.file);
	if (!file) return null;
	if (!Number.isInteger(raw.line) || raw.line < 1) return null;
	if (!Number.isInteger(raw.column) || raw.column < 1) return null;
	if (typeof raw.sourceCallSha256 !== 'string' || !/^[0-9a-fA-F]{64}$/.test(raw.sourceCallSha256)) return null;
	if (typeof raw.reason !== 'string' || raw.reason.trim() === '') return null;
	if (typeof raw.owner !== 'string' || raw.owner.trim() === '') return null;
	if (!isRealUtcDate(raw.expires)) return null;
	return {
		file,
		line: raw.line,
		column: raw.column,
		sourceCallSha256: raw.sourceCallSha256.toLowerCase(),
		reason: raw.reason.trim(),
		owner: raw.owner.trim(),
		expires: raw.expires,
	};
}

/**
 * Parse ledger `text` into `{status:'valid', entries}` or `{status:'invalid', problem}`. Any
 * structural problem — bad JSON, wrong version, an unknown or missing field, a duplicate
 * `(file,line,column)` identity, a bad date — makes the whole ledger invalid, so no entry in it
 * excuses anything. `problem` is a short code, never raw parser output.
 */
export function parseQuarantineLedger(text) {
	let document;
	try {
		document = JSON.parse(text);
	} catch {
		return { status: 'invalid', problem: 'not-json' };
	}
	if (!isPlainObject(document)) return { status: 'invalid', problem: 'not-object' };
	// The document schema is exact: an unknown top-level key (for example `APPROVED-BY`) is not a
	// capability and makes the whole ledger invalid rather than being ignored.
	const documentKeys = Object.keys(document);
	if (documentKeys.length !== DOCUMENT_FIELDS.length || !DOCUMENT_FIELDS.every((field) => field in document))
		return { status: 'invalid', problem: 'unknown-document-field' };
	if (document.version !== 1) return { status: 'invalid', problem: 'bad-version' };
	if (!Array.isArray(document.entries)) return { status: 'invalid', problem: 'bad-entries' };
	const entries = [];
	const seen = new Set();
	for (const raw of document.entries) {
		const entry = parseEntry(raw);
		if (!entry) return { status: 'invalid', problem: 'bad-entry' };
		const identity = `${entry.file}\0${entry.line}\0${entry.column}`;
		if (seen.has(identity)) return { status: 'invalid', problem: 'duplicate-entry' };
		seen.add(identity);
		entries.push(entry);
	}
	return { status: 'valid', entries };
}

/**
 * Read the ledger at `gitRoot`. Only a missing regular file is `absent` (no exceptions, not an
 * error). Every other shape fails closed and grants nothing: a directory or other non-regular
 * node, a symlink (a dangling link is a present-but-unusable file, not an absent one), a path that
 * resolves outside the repository root through a parent link, an unreadable path, and bytes that
 * are not valid UTF-8. `problem` is a short code; the raw path, bytes and parser output are never
 * returned or logged.
 */
export function readQuarantineLedger(gitRoot) {
	if (!gitRoot) return { status: 'absent' };
	const ledgerPath = path.join(gitRoot, QUARANTINE_LEDGER_FILENAME);
	let stats;
	try {
		stats = fs.lstatSync(ledgerPath);
	} catch (error) {
		if (error?.code === 'ENOENT') return { status: 'absent' };
		return { status: 'invalid', problem: 'unreadable' };
	}
	// `lstat` sees the link itself, so a symlink is never followed to read bytes outside the root.
	if (!stats.isFile()) return { status: 'invalid', problem: 'not-regular-file' };
	if (!isInsideRoot(ledgerPath, gitRoot)) return { status: 'invalid', problem: 'outside-root' };
	let bytes;
	try {
		bytes = fs.readFileSync(ledgerPath);
	} catch {
		return { status: 'invalid', problem: 'unreadable' };
	}
	let text;
	try {
		text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch {
		return { status: 'invalid', problem: 'bad-encoding' };
	}
	return parseQuarantineLedger(text);
}

const gitRoots = new Map();

/** A path as the filesystem spells it, so an 8.3 short name and Git's long name compare. */
function canonical(target) {
	try {
		return realpathSync.native(target);
	} catch {
		return target;
	}
}

/** Whether `target` resolves to a path inside the already-canonical `root`, without following
 *  anything outside it. A `realpath` failure is not inside. */
function isInsideRoot(target, root) {
	let real;
	try {
		real = realpathSync.native(target);
	} catch {
		return false;
	}
	const relative = path.relative(root, real);
	return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * The Git repository root containing `cwd`, as one of three outcomes. `no-repository` is an
 * expected answer (Git ran and said there is no repository here); `unavailable` means the question
 * could not be asked at all (Git missing, a bad `cwd`, or an unexpected Git failure). A caller
 * that only needs the root path uses `found`; a caller that must not turn an unresolved root into
 * a clean ledger distinguishes the other two.
 *
 * Only a `found` result is cached. A cached `null` would freeze "no repository here yet" and hide
 * a root that appears later in the same process.
 */
export function resolveGitRoot(cwd) {
	const cached = gitRoots.get(cwd);
	if (cached !== undefined) return { status: 'found', root: cached };
	const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
		cwd,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	if (result.error) return { status: 'unavailable', problem: 'git-unavailable' };
	if (result.status === 0) {
		const toplevel = result.stdout.trim();
		if (!toplevel) return { status: 'unavailable', problem: 'no-toplevel' };
		const root = canonical(toplevel);
		gitRoots.set(cwd, root);
		return { status: 'found', root };
	}
	// Git reports "not a git repository" with exit 128; that is the expected negative answer. Any
	// other failure is a context problem the caller must surface, not an absent ledger.
	if (result.status === 128 && /not a git repository/i.test(result.stderr ?? '')) return { status: 'no-repository' };
	return { status: 'unavailable', problem: 'git-failed' };
}
