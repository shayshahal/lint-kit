/**
 * gitleaks-check: the copied command around the pinned Gitleaks 8.30.1 scanner.
 *
 *   node tools/security/gitleaks-check.mjs [options]
 *
 * It answers three questions separately: what the branch introduced, what it inherited, and
 * whether the check could run at all. `--mode branch` (the default) scans the commits between the
 * merge-base and HEAD plus the working tree, attributes each working-tree finding to the line the
 * branch added, and fails only on the introduced ones. `--mode history` is the initial audit: every
 * commit plus the working tree, and every finding is reported.
 *
 * Exit codes: 0 nothing introduced / nothing found, 1 findings, 2 the check could not run. A
 * missing or wrong-version executable, an invalid config, a timeout, a scanner failure and a
 * malformed report are all 2 — never silently "no findings". Do not append `|| true`.
 *
 * The selected configuration is passed explicitly, inline `gitleaks:allow` comments are ignored,
 * `GITLEAKS_*` is removed from the child environment, and a source `.gitleaksignore` is refused,
 * so the branch cannot widen its own exceptions. The only exceptions are the narrow documented
 * ones in the config.
 *
 * Both scans force a text diff for the commits (`--text --no-textconv`, `--all` for the audit) and
 * the working tree, so a branch `.gitattributes` that marks files binary cannot hide a committed or
 * added credential. A Git attribute that changes what the working tree converts to (a clean
 * `filter` or `working-tree-encoding`) is refused instead: the diff could not be trusted to
 * attribute that file's lines.
 *
 * Gitleaks runs with `--redact=100`, and its stdout, stderr and report never reach the output:
 * this command prints an allowlisted rule/file/line/commit metadata line per finding.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGitleaksReport } from './gitleaks-report.mjs';

/** The one Gitleaks release this command is tested against and refuses to substitute. */
const PINNED_GITLEAKS_VERSION = '8.30.1';

/** The exit code Gitleaks is told to use for findings, so scanner failure cannot look like leaks. */
const FINDINGS_EXIT_CODE = 3;

const DEFAULT_TIMEOUT_SECONDS = 300;
const EXIT_CLEAN = 0;
const EXIT_FINDINGS = 1;
const EXIT_CANNOT_CHECK = 2;

const USAGE = `Usage: node tools/security/gitleaks-check.mjs [options]

Options:
  --mode branch|history   branch (default): introduced commits and working tree;
                          history: every commit and the working tree (initial audit)
  --base <ref>            branch mode: the ref to compare with (default origin/HEAD, else origin/main)
  --source <dir>          the repository to scan (default the current directory)
  --config <file>         the selected Gitleaks config (default tools/security/gitleaks.toml)
  --gitleaks <exe>        the pinned Gitleaks 8.30.1 executable (default: gitleaks on PATH)
  --timeout <seconds>     how long any Gitleaks invocation may run (default ${DEFAULT_TIMEOUT_SECONDS})
  -h, --help              print this text

Exit codes: 0 clean, 1 findings, 2 the check could not run.`;

/** Run the command and return its exit code. */
function main(argv) {
	const parsed = parseArguments(argv);
	if (!parsed.ok) return cannotCheck(parsed.reason);
	const options = parsed.options;
	if (options.help) {
		process.stdout.write(`${USAGE}\n`);
		return EXIT_CLEAN;
	}

	const source = path.resolve(options.source ?? process.cwd());
	if (!isDirectory(source)) return cannotCheck(`the source directory does not exist: ${source}`);
	const repositoryRoot = gitText(source, ['rev-parse', '--show-toplevel']);
	if (repositoryRoot === null) return cannotCheck('the source is not a Git repository');
	if (path.relative(fs.realpathSync.native(repositoryRoot), fs.realpathSync.native(source)) !== '')
		return cannotCheck('the source must be the repository root; pass that directory with --source');

	const config = path.resolve(
		options.config ?? path.join(path.dirname(fileURLToPath(import.meta.url)), 'gitleaks.toml'),
	);
	if (!isFile(config)) return cannotCheck(`the selected config does not exist: ${config}`);

	if (fs.existsSync(path.join(source, '.gitleaksignore')))
		return cannotCheck(
			'a .gitleaksignore in the source is not permitted: an ambient ignore file can silence a finding without review. Move reviewed exceptions into the selected config',
		);

	const timeoutMs = (options.timeout ?? DEFAULT_TIMEOUT_SECONDS) * 1000;
	const executable = options.gitleaks ?? 'gitleaks';

	const version = checkVersion(executable, source, timeoutMs);
	if (!version.ok) return cannotCheck(version.reason);

	const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gitleaks-check-'));
	try {
		const ignorePath = writeEmptyIgnoreFile(temp);
		const scan = {
			executable,
			source,
			config,
			ignorePath,
			timeoutMs,
			temp,
		};
		return options.mode === 'history' ? runHistory(scan, version.version) : runBranch(scan, options.base, version.version);
	} finally {
		fs.rmSync(temp, { recursive: true, force: true });
	}
}

/** The initial audit: every commit and the working tree, every finding reported. */
function runHistory(scan, version) {
	const commits = runScan(scan, { subcommand: 'git', logOpts: '--text --no-textconv --all', report: 'commits.json' });
	if (!commits.ok) return cannotCheck(commits.reason);
	const tree = runScan(scan, { subcommand: 'dir', report: 'tree.json' });
	if (!tree.ok) return cannotCheck(tree.reason);

	const findings = dedupe([...commits.findings, ...tree.findings]);
	process.stdout.write(`gitleaks-check: gitleaks ${version} history audit of ${scan.source}\n`);
	for (const finding of findings) process.stdout.write(`${findingLine('finding', finding)}\n`);
	if (findings.length === 0) process.stdout.write('gitleaks-check: no findings\n');
	else process.stdout.write(`gitleaks-check: findings ${findings.length}\n`);
	return findings.length > 0 ? EXIT_FINDINGS : EXIT_CLEAN;
}

/** The branch gate: introduced commits and working-tree lines fail; inherited ones are surfaced. */
function runBranch(scan, requestedBase, version) {
	const base = resolveBase(scan.source, requestedBase);
	if (!base.ok) return cannotCheck(base.reason);
	const mergeBase = gitText(scan.source, ['merge-base', base.sha, 'HEAD']);
	if (!mergeBase || !isCommitSha(mergeBase))
		return cannotCheck(`no merge base between ${base.label} and HEAD`);

	const commits = runScan(scan, {
		subcommand: 'git',
		logOpts: `--text --no-textconv ${mergeBase}..HEAD`,
		report: 'commits.json',
	});
	if (!commits.ok) return cannotCheck(commits.reason);
	const tree = runScan(scan, { subcommand: 'dir', report: 'tree.json' });
	if (!tree.ok) return cannotCheck(tree.reason);

	const attribution = attributeTreeFindings(scan, dedupe(tree.findings), mergeBase);
	if (!attribution.ok) return cannotCheck(attribution.reason);

	const introduced = dedupe([...commits.findings, ...attribution.introduced]);
	const inherited = attribution.inherited;
	process.stdout.write(
		`gitleaks-check: gitleaks ${version} branch scan of ${scan.source} at ${short(mergeBase)}, base ${base.label}\n`,
	);
	for (const finding of introduced) process.stdout.write(`${findingLine('introduced', finding)}\n`);
	for (const finding of inherited)
		process.stdout.write(
			`${findingLine('inherited', finding)} (not introduced by this branch; incident remediation, not a branch blocker)\n`,
		);
	if (introduced.length === 0 && inherited.length === 0)
		process.stdout.write('gitleaks-check: no findings\n');
	else process.stdout.write(`gitleaks-check: introduced ${introduced.length}, inherited ${inherited.length}\n`);
	return introduced.length > 0 ? EXIT_FINDINGS : EXIT_CLEAN;
}

/** Split working-tree findings into the lines the branch added and the ones it inherited. */
function attributeTreeFindings(scan, treeFindings, mergeBase) {
	// NUL-safe tracked names let us classify every reported untracked file, including ignored
	// ones, without enumerating potentially huge ignored dependency/cache directories.
	const tracked = gitRaw(scan.source, ['ls-files', '-z', '--cached']);
	if (tracked === null) return { ok: false, reason: 'could not list tracked files' };
	const trackedFiles = new Set(tracked.split('\0').filter(Boolean));
	const untrackedFiles = new Set(
		treeFindings.map((finding) => normalizePath(finding.file)).filter((file) => !trackedFiles.has(file)),
	);

	// A file the working tree converts on its way to git (a clean `filter` or
	// `working-tree-encoding`) makes the added-line diff describe something other than what
	// Gitleaks scanned. There is no safe attribution for it, so fail closed rather than call it
	// inherited.
	const converted = [
		...new Set(
			treeFindings
				.filter((finding) => !untrackedFiles.has(normalizePath(finding.file)))
				.map((finding) => normalizePath(finding.file)),
		),
	];
	const hazard = checkWorkingTreeConversion(scan.source, converted);
	if (!hazard.ok) return hazard;

	// `--text --no-textconv` forces a text diff: without it `*.ts binary` (or `-diff`, or a
	// textconv driver) makes git print "Binary files ... differ" with no hunks, and a freshly added
	// credential would have no added line to be attributed to.
	const diff = gitRaw(scan.source, [
		'-c',
		'core.quotePath=false',
		'diff',
		'--text',
		'--no-textconv',
		'--unified=0',
		'--no-color',
		'--no-ext-diff',
		'--no-prefix',
		mergeBase,
		'--',
	]);
	if (diff === null) return { ok: false, reason: `could not diff ${short(mergeBase)} against the working tree` };
	const added = parseAddedLines(diff);

	const introduced = [];
	const inherited = [];
	for (const finding of treeFindings) {
		if (isIntroduced(finding, added.lines, untrackedFiles, added.unreliable)) introduced.push(finding);
		else inherited.push(finding);
	}
	return { ok: true, introduced, inherited };
}

/**
 * Fail closed when a reported tracked file sets `filter` or `working-tree-encoding`: those change
 * the bytes git compares, so the diff cannot say which lines the branch added to what Gitleaks read.
 */
function checkWorkingTreeConversion(source, files) {
	if (files.length === 0) return { ok: true };
	const output = gitRaw(source, ['check-attr', '-z', 'filter', 'working-tree-encoding', '--', ...files]);
	if (output === null) return { ok: false, reason: 'could not read the Git attributes of the working tree' };
	const fields = output.split('\0');
	for (let index = 0; index + 2 < fields.length; index += 3) {
		const value = fields[index + 2];
		if (value !== 'unspecified' && value !== 'unset') {
			const [file, attribute] = [fields[index], fields[index + 1]];
			return {
				ok: false,
				reason: `${file} sets the Git ${attribute} attribute, which changes the working-tree content git compares; remove it or scan that file with an explicit config`,
			};
		}
	}
	return { ok: true };
}

/**
 * Whether a working-tree finding overlaps a line the branch added, or sits in an untracked file.
 * The whole `StartLine..EndLine` range counts: a multi-line match whose first line is inherited but
 * whose later lines are new is still the branch's.
 */
function isIntroduced(finding, addedLines, untrackedFiles, unreliable) {
	// A path git printed in a form this command cannot match against is treated as introduced: a
	// wrong guess must never hide a secret, only surface an inherited one as the branch's.
	if (unreliable) return true;
	const file = normalizePath(finding.file);
	if (untrackedFiles.has(file)) return true;
	const lines = addedLines.get(file);
	if (lines === undefined) return false;
	for (const number of lines) {
		if (number >= finding.startLine && number <= finding.endLine) return true;
	}
	return false;
}

/**
 * `git diff --unified=0 --no-prefix` -> the added line numbers per file, and whether any path came
 * back in a form this command cannot attribute (`unreliable`).
 */
function parseAddedLines(diff) {
	const lines = new Map();
	let unreliable = false;
	let file = null;
	for (const line of diff.split('\n')) {
		if (line.startsWith('+++ ')) {
			const name = line.slice(4);
			if (name.startsWith('"')) {
				unreliable = true;
				file = null;
				continue;
			}
			file = name === '/dev/null' ? null : name;
			continue;
		}
		if (file === null || !line.startsWith('@@ ')) continue;
		const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
		if (!hunk) {
			unreliable = true;
			continue;
		}
		const start = Number(hunk[1]);
		const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
		if (count === 0) continue;
		const set = lines.get(file) ?? new Set();
		for (let number = start; number < start + count; number += 1) set.add(number);
		lines.set(file, set);
	}
	return { lines, unreliable };
}

/** Run one Gitleaks scan and return the findings its report allows, or an execution failure. */
function runScan(scan, { subcommand, logOpts, report }) {
	const reportPath = path.join(scan.temp, report);
	const args = [
		subcommand,
		'--no-banner',
		'--no-color',
		'--log-level',
		'error',
		'--config',
		scan.config,
		'--gitleaks-ignore-path',
		scan.ignorePath,
		'--ignore-gitleaks-allow',
		'--redact=100',
		'--exit-code',
		String(FINDINGS_EXIT_CODE),
		'--report-format',
		'json',
		'--report-path',
		reportPath,
	];
	if (logOpts !== undefined) args.push(`--log-opts=${logOpts}`);
	args.push('.');

	const result = runCommand(scan.executable, args, scan.source, scan.timeoutMs);
	if (!result.ok) return result;

	if (result.status === EXIT_CLEAN) {
		const reportText = takeReport(reportPath);
		if (reportText === null) return { ok: true, findings: [] };
		const parsed = parseGitleaksReport(reportText);
		if (!parsed.ok) return { ok: false, reason: parsed.reason };
		if (parsed.findings.length > 0)
			return { ok: false, reason: 'Gitleaks exited clean but wrote findings in its report' };
		return { ok: true, findings: [] };
	}
	if (result.status === FINDINGS_EXIT_CODE) {
		const reportText = takeReport(reportPath);
		if (reportText === null) return { ok: false, reason: 'Gitleaks reported findings but wrote no report' };
		const parsed = parseGitleaksReport(reportText);
		if (!parsed.ok) return { ok: false, reason: parsed.reason };
		if (parsed.findings.length === 0)
			return { ok: false, reason: 'Gitleaks reported findings but wrote an empty report' };
		return { ok: true, findings: parsed.findings };
	}
	return { ok: false, reason: `Gitleaks exited with ${describeExit(result)} instead of a clean or findings result` };
}

/** Read and remove a scan report, so a later scan can never read a stale one. */
function takeReport(reportPath) {
	if (!fs.existsSync(reportPath)) return null;
	const text = fs.readFileSync(reportPath, 'utf8');
	fs.rmSync(reportPath, { force: true });
	return text;
}

/** Run the executable and confirm it answers with the pinned version, without echoing its output. */
function checkVersion(executable, source, timeoutMs) {
	const result = runCommand(executable, ['version'], source, timeoutMs, true);
	if (!result.ok) return result;
	if (result.status !== 0) return { ok: false, reason: 'Gitleaks did not answer its version check' };
	const reported = result.stdout.trim();
	if (!/^\d+\.\d+\.\d+$/.test(reported))
		return { ok: false, reason: 'Gitleaks answered its version check with output that is not a version' };
	if (reported !== PINNED_GITLEAKS_VERSION)
		return { ok: false, reason: `Gitleaks ${reported} is not the pinned ${PINNED_GITLEAKS_VERSION}` };
	return { ok: true, version: reported };
}

/** Run a child process with no shell, a timeout, and the `GITLEAKS_*` environment removed. */
function runCommand(command, args, cwd, timeoutMs, captureStdout = false) {
	const result = spawnSync(command, args, {
		cwd,
		timeout: timeoutMs,
		encoding: 'utf8',
		stdio: captureStdout ? ['ignore', 'pipe', 'ignore'] : 'ignore',
		env: childEnvironment(),
		windowsHide: true,
	});
	if (result.error) return { ok: false, reason: commandFailure(result.error, timeoutMs) };
	if (result.signal) return { ok: false, reason: `Gitleaks was stopped before it finished (${result.signal})` };
	return { ok: true, status: result.status, stdout: captureStdout ? (result.stdout ?? '') : '' };
}

/** A fixed reason for a child-process failure; the child's own message is never used. */
function commandFailure(error, timeoutMs) {
	if (error.code === 'ENOENT') return 'the Gitleaks executable was not found';
	if (error.code === 'ETIMEDOUT') return `Gitleaks did not finish within ${timeoutMs / 1000}s`;
	return 'Gitleaks could not be executed';
}

/** The inherited environment without any `GITLEAKS_*` entry the branch could have set. */
function childEnvironment() {
	const environment = {};
	for (const [key, value] of Object.entries(process.env)) {
		if (!key.startsWith('GITLEAKS_')) environment[key] = value;
	}
	return environment;
}

/** Resolve `--base`, else origin/HEAD, else origin/main, to a commit the branch can be compared with. */
function resolveBase(source, requested) {
	if (requested !== undefined) {
		const sha = resolveCommit(source, requested);
		return sha
			? { ok: true, sha, label: requested }
			: { ok: false, reason: `--base ${requested} does not resolve to a commit` };
	}
	for (const candidate of ['origin/HEAD', 'origin/main']) {
		const sha = resolveCommit(source, candidate);
		if (sha) return { ok: true, sha, label: candidate };
	}
	return { ok: false, reason: 'no base to compare with: pass --base, or fetch origin/HEAD or origin/main' };
}

/** `git rev-parse` as a literal revision: option parsing ends before the ref, so a ref cannot inject. */
function resolveCommit(source, ref) {
	const resolved = gitText(source, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${ref}^{commit}`]);
	return resolved && isCommitSha(resolved) ? resolved : null;
}

/** Run git in `source` and return its raw stdout, or null when git fails. */
function gitRaw(source, args) {
	const result = spawnSync('git', args, {
		cwd: source,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'ignore'],
		windowsHide: true,
	});
	if (result.error || result.status !== 0) return null;
	return result.stdout ?? '';
}

/** Run git in `source` and return trimmed stdout, or null when git fails. */
function gitText(source, args) {
	const output = gitRaw(source, args);
	return output === null ? null : output.trim();
}

/** A findings line: allowlisted metadata only, never a matched value. */
function findingLine(label, finding) {
	const location = `${normalizePath(finding.file)}:${finding.startLine}`;
	const commit = finding.commit ? ` commit ${short(finding.commit)}` : '';
	return `gitleaks-check: ${label} ${finding.ruleId} ${location}${commit}`;
}

/** A path from a report, with any separator this platform used written as `/`. */
function normalizePath(file) {
	return file.replace(/\\/g, '/');
}

/** Drop repeats of the same location, so a committed secret is listed once. */
function dedupe(findings) {
	const seen = new Set();
	const unique = [];
	for (const finding of findings) {
		const key = `${finding.ruleId}|${finding.file}|${finding.startLine}`;
		if (seen.has(key)) continue;
		seen.add(key);
		unique.push(finding);
	}
	return unique;
}

function writeEmptyIgnoreFile(temp) {
	const ignorePath = path.join(temp, 'gitleaks-ignore');
	fs.writeFileSync(ignorePath, '');
	return ignorePath;
}

function parseArguments(argv) {
	const options = { mode: 'branch' };
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === '--help' || argument === '-h') return { ok: true, options: { ...options, help: true } };
		const equals = argument.indexOf('=');
		const name = equals === -1 ? argument : argument.slice(0, equals);
		const inline = equals === -1 ? undefined : argument.slice(equals + 1);
		if (!['--mode', '--base', '--source', '--config', '--gitleaks', '--timeout'].includes(name))
			return { ok: false, reason: `unsupported option ${name}` };
		const value = inline ?? argv[(index += 1)];
		if (value === undefined || value === '') return { ok: false, reason: `${name} needs a value` };
		if (name === '--mode' && value !== 'branch' && value !== 'history')
			return { ok: false, reason: 'unsupported mode; use branch or history' };
		if (name === '--timeout') {
			const seconds = Number(value);
			if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > 2_147_483)
				return { ok: false, reason: 'unsupported timeout; use a whole number of seconds from 1 to 2147483' };
			options.timeout = seconds;
			continue;
		}
		options[name.slice(2)] = value;
	}
	return { ok: true, options };
}

function cannotCheck(reason) {
	process.stderr.write(`gitleaks-check: cannot check: ${reason}\n`);
	return EXIT_CANNOT_CHECK;
}

function describeExit(result) {
	return result.status === null ? 'no exit code' : `exit ${result.status}`;
}

function isDirectory(candidate) {
	try {
		return fs.statSync(candidate).isDirectory();
	} catch {
		return false;
	}
}

function isFile(candidate) {
	try {
		return fs.statSync(candidate).isFile();
	} catch {
		return false;
	}
}

function isCommitSha(value) {
	return /^[0-9a-f]{40}$/.test(value);
}

function short(sha) {
	return sha.slice(0, 7);
}

try {
	process.exitCode = main(process.argv.slice(2));
} catch {
	// Filesystem/report failures cannot become clean, or expose raw exception/report content.
	process.exitCode = cannotCheck('the check could not complete; no scanner or report content is forwarded');
}
