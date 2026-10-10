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
 * malformed or unreadable ledger grants no exception at all (fail closed).
 *
 * This module owns the format and the lifecycle (structural validity and expiry). The ESLint
 * `vitest/no-disabled-tests` rule reuses it to decide one report; the CLI beside it
 * (`check-quarantine-ledger.mjs`) is the repository-wide structural check that runs even when no
 * test file is in a push. Neither is a general exception system.
 */

import { execFileSync } from 'node:child_process';
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
 * Read the ledger at `gitRoot`. A missing optional file is `absent` (no exceptions, not an
 * error); an unreadable one is `invalid` and grants nothing.
 */
export function readQuarantineLedger(gitRoot) {
	if (!gitRoot) return { status: 'absent' };
	let text;
	try {
		text = fs.readFileSync(path.join(gitRoot, QUARANTINE_LEDGER_FILENAME), 'utf8');
	} catch (error) {
		if (error?.code === 'ENOENT') return { status: 'absent' };
		return { status: 'invalid', problem: 'unreadable' };
	}
	return parseQuarantineLedger(text);
}

/** A path as the filesystem spells it, so an 8.3 short name and Git's long name compare. */
function canonical(target) {
	try {
		return realpathSync.native(target);
	} catch {
		return target;
	}
}

const gitRoots = new Map();

/** The Git repository root containing `cwd`, in canonical form, or null when there is none. */
export function gitRootOf(cwd) {
	if (gitRoots.has(cwd)) return gitRoots.get(cwd);
	let root = null;
	try {
		const toplevel = execFileSync('git', ['rev-parse', '--show-toplevel'], {
			cwd,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
		}).trim();
		root = toplevel ? canonical(toplevel) : null;
	} catch {
		root = null;
	}
	gitRoots.set(cwd, root);
	return root;
}
