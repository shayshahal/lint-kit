/**
 * gitleaks-report: what the wrapper is allowed to learn from a Gitleaks JSON report.
 *
 * A Gitleaks finding carries a `Secret` and a `Match`. Full redaction (`--redact=100`) makes the
 * `Secret` exactly `REDACTED` and replaces the secret inside the `Match` with `REDACTED`, keeping
 * the rule's surrounding context (`apiKey = "REDACTED"`). This module refuses a finding whose
 * `Secret` is not exactly `REDACTED`, or whose `Match` is missing or does not carry the `REDACTED`
 * marker, so a value that was not redacted never reaches a caller, a log or an error message. What
 * it returns is an allowlist of four fields — rule, file, line range and commit — each validated as
 * the shape the wrapper prints, so no other report field (Match, Secret, Author, Email, Message,
 * Link) can leak through and no control character can forge an output line.
 *
 * A report that is not an array, or whose entry is missing a field, carries a non-redacted
 * `Secret`/`Match`, or holds a malformed line range or commit, is a failure value, never an empty
 * finding list.
 */

/** The literal Gitleaks writes in `Secret`, and replaces the secret with inside `Match`. */
export const REDACTED = 'REDACTED';

const NOT_JSON = 'the Gitleaks report is not valid JSON';
const NOT_ARRAY = 'the Gitleaks report is not an array of findings';
const NOT_OBJECT = 'the Gitleaks report holds an entry that is not a finding object';
const NO_RULE = 'the Gitleaks report holds a finding without a safe rule id';
const NO_FILE = 'the Gitleaks report holds a finding without a safe file path';
const NO_LINE = 'the Gitleaks report holds a finding without a valid start line';
const NO_END_LINE = 'the Gitleaks report holds a finding without a valid end line';
const UNSAFE_COMMIT = 'the Gitleaks report holds a finding with a commit that is neither empty nor a full commit id';
const NOT_REDACTED = 'the Gitleaks report holds a value that is not redacted; refusing to read it';

/**
 * Parse a Gitleaks JSON report into allowlisted finding metadata.
 *
 * Returns `{ ok: true, findings }`, each finding `{ ruleId, file, startLine, endLine, commit }`,
 * or `{ ok: false, reason }` where the reason is a fixed literal that never contains report
 * content.
 */
export function parseGitleaksReport(reportText) {
	let parsed;
	try {
		parsed = JSON.parse(reportText);
	} catch {
		return { ok: false, reason: NOT_JSON };
	}
	if (!Array.isArray(parsed)) return { ok: false, reason: NOT_ARRAY };
	const findings = [];
	for (const entry of parsed) {
		const finding = parseFinding(entry);
		if (!finding.ok) return finding;
		findings.push(finding.finding);
	}
	return { ok: true, findings };
}

/** One report entry -> allowlisted finding metadata, or a failure. */
function parseFinding(entry) {
	if (typeof entry !== 'object' || entry === null) return { ok: false, reason: NOT_OBJECT };
	if (!isSafeText(entry.RuleID)) return { ok: false, reason: NO_RULE };
	if (!isSafeText(entry.File)) return { ok: false, reason: NO_FILE };
	if (!Number.isInteger(entry.StartLine) || entry.StartLine < 1) return { ok: false, reason: NO_LINE };
	if (!Number.isInteger(entry.EndLine) || entry.EndLine < entry.StartLine) return { ok: false, reason: NO_END_LINE };
	if (entry.Secret !== REDACTED) return { ok: false, reason: NOT_REDACTED };
	// Match is discarded, not output metadata: real redacted context can contain newlines.
	if (typeof entry.Match !== 'string' || !entry.Match.includes(REDACTED)) return { ok: false, reason: NOT_REDACTED };
	if (typeof entry.Commit !== 'string' || (entry.Commit !== '' && !/^[0-9a-f]{40}$/.test(entry.Commit)))
		return { ok: false, reason: UNSAFE_COMMIT };
	return {
		ok: true,
		finding: {
			ruleId: entry.RuleID,
			file: entry.File,
			startLine: entry.StartLine,
			endLine: entry.EndLine,
			commit: entry.Commit,
		},
	};
}

/** A non-empty string with no control character, so it cannot forge or split an output line. */
function isSafeText(value) {
	return typeof value === 'string' && value !== '' && !/[\u0000-\u001f\u007f]/.test(value);
}
