#!/usr/bin/env node
/**
 * check-quarantine-ledger: the repository-wide structural check for `test-quarantine.json`.
 *
 * This runs as a non-file-filtered pre-push step, so every ledger entry is validated even when a
 * push changes no test file (a docs-only or deletion-only push, or a push that selects no test at
 * all). It answers only the structural question the ESLint rule cannot answer when it sees no
 * source: can the ledger run at all, and is every entry still live? It never reads a test file,
 * so a valid entry pointing at no remaining skip still has to be structurally valid and unexpired.
 *
 *   unresolvable repo    -> exit 2, no clean/absent verdict (a bad CWD, no Git, or Git failing)
 *   absent optional file  -> exit 0 (no exceptions; not an error)
 *   present but malformed -> exit 1, naming only the problem code
 *   any expired entry      -> exit 1, naming each location and its expiry date
 *   every entry valid      -> exit 0
 *
 * Output is metadata only: a repository-relative location, a status and a date. An entry's reason,
 * owner and source are never printed, and neither is raw JSON parser output or a Git error.
 *
 * The lifecycle verdict has one owner: this check. The `vitest/no-disabled-tests` rule reuses the
 * same format module to drop a report an entry excuses, and keeps the upstream diagnostic
 * otherwise; it does not repeat the lifecycle message this check owns.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	QUARANTINE_LEDGER_FILENAME,
	currentUtcDate,
	isQuarantineEntryExpired,
	readQuarantineLedger,
	resolveGitRoot,
} from './quarantine-ledger.mjs';

/**
 * The outcome of validating the ledger from `cwd`. `code` is the process exit; `lines` is
 * metadata-only output. No entry reason, owner or source text is ever placed in `lines`.
 */
export function checkQuarantineLedger({ cwd = process.cwd(), now = new Date() } = {}) {
	// The structural check needs a repository. An unresolved root is not an absent ledger: without
	// it the command cannot say anything about every entry, so it exits 2 rather than reporting a
	// clean push it never validated.
	const resolved = resolveGitRoot(cwd);
	if (resolved.status !== 'found') {
		const why = resolved.status === 'no-repository' ? 'no Git repository here' : 'the Git root could not be resolved';
		return {
			code: 2,
			lines: [`${QUARANTINE_LEDGER_FILENAME}: unavailable (${why}); every entry was not validated`],
		};
	}
	const ledger = readQuarantineLedger(resolved.root);
	if (ledger.status === 'absent') {
		return { code: 0, lines: [`${QUARANTINE_LEDGER_FILENAME}: absent; no quarantine exceptions`] };
	}
	if (ledger.status === 'invalid') {
		return {
			code: 1,
			lines: [`${QUARANTINE_LEDGER_FILENAME}: invalid (${ledger.problem}); no entry excuses anything`],
		};
	}
	const today = currentUtcDate(now);
	const expired = ledger.entries.filter((entry) => isQuarantineEntryExpired(entry, today));
	if (expired.length > 0) {
		return {
			code: 1,
			lines: [
				`${QUARANTINE_LEDGER_FILENAME}: ${expired.length} expired entry(s); renew through review or fix the test`,
				...expired.map((entry) => `  ${entry.file}:${entry.line}:${entry.column} expired ${entry.expires}`),
			],
		};
	}
	return {
		code: 0,
		lines: [`${QUARANTINE_LEDGER_FILENAME}: ${ledger.entries.length} valid entry(s)`],
	};
}

const isMain = process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
	const cwd = path.resolve(process.argv[2] ?? process.cwd());
	const result = checkQuarantineLedger({ cwd });
	for (const line of result.lines) console.log(line);
	process.exitCode = result.code;
}
