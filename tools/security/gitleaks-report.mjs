/**
 * gitleaks-report: what the wrapper is allowed to learn from a Gitleaks JSON report.
 *
 * A Gitleaks finding carries a `Secret` and a `Match`. Full redaction (`--redact=100`) replaces
 * both with the literal `REDACTED`, and this module refuses to read a report whose findings are not
 * redacted: a matched value must never reach a caller, a log or an error message. What it returns
 * is an allowlist of four fields — rule, file, line and commit — so no other report field (Match,
 * Secret, Author, Email, Message, Link) can leak through.
 *
 * A report that is not an array, or whose entry is missing an allowlisted field or carries a
 * non-redacted Secret, is a failure value, never an empty finding list.
 */

/** The literal Gitleaks writes in `Secret` and `Match` when `--redact=100` is in effect. */
export const REDACTED = 'REDACTED';

const NOT_JSON = 'the Gitleaks report is not valid JSON';
const NOT_ARRAY = 'the Gitleaks report is not an array of findings';
const NOT_OBJECT = 'the Gitleaks report holds an entry that is not a finding object';
const NO_RULE = 'the Gitleaks report holds a finding without a rule id';
const NO_FILE = 'the Gitleaks report holds a finding without a file';
const NO_LINE = 'the Gitleaks report holds a finding without a start line';
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
	if (typeof entry.RuleID !== 'string' || entry.RuleID === '') return { ok: false, reason: NO_RULE };
	if (typeof entry.File !== 'string' || entry.File === '') return { ok: false, reason: NO_FILE };
	if (!Number.isInteger(entry.StartLine) || entry.StartLine < 1) return { ok: false, reason: NO_LINE };
	if (entry.Secret !== REDACTED) return { ok: false, reason: NOT_REDACTED };
	const endLine = Number.isInteger(entry.EndLine) && entry.EndLine >= entry.StartLine ? entry.EndLine : entry.StartLine;
	return {
		ok: true,
		finding: {
			ruleId: entry.RuleID,
			file: entry.File,
			startLine: entry.StartLine,
			endLine,
			commit: typeof entry.Commit === 'string' ? entry.Commit : '',
		},
	};
}
