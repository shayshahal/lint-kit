import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { patchOxlint } from '../bin/lint-kit.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SET = path.join(ROOT, 'tools/oxlint/slop-patterns');
const FIXTURES = path.join(SET, 'fixtures/no-trivial-wrapper');
// oxlint's bin is a Node script, so it runs the same way on every platform.
const OXLINT = path.join(ROOT, 'node_modules/oxlint/bin/oxlint');
// Outside the repository: the rule skips files under a `test/` folder, and this repository has one.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-kit-oxlint-'));
// The TypeScript config has to sit inside the repository for `import { defineConfig } from "oxlint"`
// to resolve; the files it lints stay outside it, because the rule skips anything under `test/`.
const CONFIG_DIR = path.join(ROOT, 'test', '.tmp-oxlint-ts');
after(() => {
	fs.rmSync(TMP, { recursive: true, force: true });
	fs.rmSync(CONFIG_DIR, { recursive: true, force: true });
});

/** Run oxlint over `files` with the set loaded, and return this rule's findings. */
function lint(files) {
	const config = path.join(TMP, 'oxlintrc.json');
	// An absolute specifier, not one relative to the config: on the Windows runners the
	// checkout is on D: and the temp folder on C:, and path.relative across drives returns
	// the absolute path anyway, so `./` in front of it loaded nothing.
	const specifier = path.join(SET, 'index.ts').replace(/\\/g, '/');
	fs.writeFileSync(
		config,
		JSON.stringify({
			ignorePatterns: [],
			jsPlugins: [{ name: 'slop-patterns', specifier }],
			rules: { 'slop-patterns/no-trivial-wrapper': 'error' },
		}),
	);
	let out;
	try {
		out = execFileSync(process.execPath, [OXLINT, '--config', config, '--format', 'json', ...files], {
			cwd: ROOT,
			encoding: 'utf8',
		});
	} catch (e) {
		out = e.stdout;
	}
	assert.ok(out, 'oxlint produced no output');
	return JSON.parse(out).diagnostics.filter((d) => String(d.code ?? '').includes('no-trivial-wrapper'));
}

test('no-trivial-wrapper: every wrapper in the invalid fixture, nothing in the valid one', () => {
	const invalid = path.join(FIXTURES, 'invalid-forwards-arguments.ts');
	const found = lint([invalid, path.join(FIXTURES, 'valid-not-a-wrapper.ts')]);
	assert.deepEqual(
		found.map((d) => /`([^`]+)` adds nothing/.exec(d.message)[1]).sort(),
		['createAuctionWS', 'formatCurrency', 'loadUser', 'logIt', 'matchCategory', 'setValue'],
	);
	for (const d of found) {
		assert.ok(d.filename.replace(/\\/g, '/').endsWith('invalid-forwards-arguments.ts'), `${d.filename} should not report`);
	}
	assert.match(found[0].message, /only forwards its arguments/);
});

test('no-trivial-wrapper: a SvelteKit matcher in src/params/<name>.ts is left alone, elsewhere is not', () => {
	const source = 'const CATEGORIES = new Set(["rings"]);\nexport const match = (param: string) => CATEGORIES.has(param);\n';
	// `src/params/<name>.ts`, including a nested project; the rule normalizes `\` to `/`.
	const matcher = path.join(TMP, 'proj/src/params/category.ts');
	const nested = path.join(TMP, 'proj/packages/app/src/params/category.ts');
	// a file beside the folder is not a matcher, and neither is one anywhere else
	const beside = path.join(TMP, 'proj/src/params.ts');
	const elsewhere = path.join(TMP, 'proj/src/elsewhere.ts');
	const spec = path.join(TMP, 'proj/src/helpers.spec.ts');
	const inTests = path.join(TMP, 'proj/src/tests/helpers.ts');
	for (const file of [matcher, nested, beside, elsewhere, spec, inTests]) {
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, source);
	}
	assert.deepEqual(lint([matcher]), []);
	assert.deepEqual(lint([nested]), []);
	assert.deepEqual(lint([spec]), []);
	assert.deepEqual(lint([inTests]), []);
	assert.equal(lint([beside]).length, 1, 'src/params.ts is not a matcher file');
	assert.equal(lint([elsewhere]).length, 1);
});

test('a patched oxlint.config.ts is a config oxlint loads and lints through', () => {
	fs.mkdirSync(CONFIG_DIR, { recursive: true });
	const specifier = `./${path.relative(CONFIG_DIR, path.join(SET, 'index.ts')).replace(/\\/g, '/')}`;
	const config = path.join(CONFIG_DIR, 'oxlint.config.ts');
	fs.writeFileSync(
		config,
		patchOxlint(
			'import { defineConfig } from "oxlint";\n\nexport default defineConfig({\n\trules: {\n\t\t"no-console": "error"\n\t}\n});\n',
			specifier,
			true,
		),
	);
	const subject = path.join(TMP, 'subject.ts');
	fs.writeFileSync(
		subject,
		'export function formatCurrency(amount: number): string {\n\treturn formatMoney(amount);\n}\ndeclare function formatMoney(a: number): string;\n',
	);
	let out;
	try {
		out = execFileSync(process.execPath, [OXLINT, '--config', config, '--format', 'json', subject], {
			cwd: ROOT,
			encoding: 'utf8',
		});
	} catch (e) {
		out = e.stdout;
	}
	const found = JSON.parse(out).diagnostics.filter((d) => String(d.code ?? '').includes('no-trivial-wrapper'));
	assert.equal(found.length, 1, out);
	assert.match(found[0].message, /`formatCurrency` adds nothing to `formatMoney`/);
});

/** The two configs #17 reproduced the corruption with, as they were before the patch. */
const END_RULE_THEN_COMMENT = '{\n  "rules": {\n    "no-console": "error",\n    // existing explanation\n  }\n}\n';
const RULES_NOT_FIRST = '{ "ignorePatterns": ["generated/**"], "rules": { "no-console": "error" } }\n';

/** Run real oxlint over the invalid fixture with a patched config, and return our rule's findings. */
function patchedFindings(name, patched) {
	const config = path.join(TMP, `patched-${name}.json`);
	fs.writeFileSync(config, patched);
	let out;
	try {
		out = execFileSync(
			process.execPath,
			[OXLINT, '--config', config, '--format', 'json', path.join(FIXTURES, 'invalid-forwards-arguments.ts')],
			{ cwd: ROOT, encoding: 'utf8' },
		);
	} catch (e) {
		out = e.stdout;
	}
	return JSON.parse(out).diagnostics.filter((d) => String(d.code ?? '').includes('no-trivial-wrapper'));
}

test('the #17 configs patch into configurations real oxlint loads and lints through', () => {
	const specifier = path.join(SET, 'index.ts').replace(/\\/g, '/');
	for (const [name, before] of Object.entries({ comment: END_RULE_THEN_COMMENT, compact: RULES_NOT_FIRST })) {
		assert.ok(patchedFindings(name, patchOxlint(before, specifier)).length >= 1, `${name} did not load`);
	}
});

const NESTED_OVERRIDE =
	'{\n  "overrides": [\n    {\n      "files": ["**/*.test.ts"],\n      "rules": {\n        "no-console": "error"\n      }\n    }\n  ],\n  "rules": {\n    "no-debugger": "error"\n  }\n}\n';
const EMPTY_CONTAINERS = '{\n  "jsPlugins": [\n  ],\n  "ignorePatterns": [\n  ],\n  "rules": {}\n}\n';

test('a nested override is not the root rules, and empty containers still wire the rule (#18, #19)', () => {
	const specifier = path.join(SET, 'index.ts').replace(/\\/g, '/');
	const nested = patchOxlint(NESTED_OVERRIDE, specifier);
	// the rule lands in the root `rules`, after `no-debugger`, and the override is untouched
	assert.match(nested, /"no-debugger": "error",\n\s+"slop-patterns\/no-trivial-wrapper": "warn"/);
	assert.doesNotMatch(nested, /"no-console": "error",/, 'the override keeps its own policy');
	assert.ok(patchedFindings('nested', nested).length >= 1);

	const empty = patchOxlint(EMPTY_CONTAINERS, specifier);
	for (const key of ['jsPlugins', 'ignorePatterns', 'rules']) assert.match(empty, new RegExp(`"${key}"`));
	assert.ok(patchedFindings('empty', empty).length >= 1);
	assert.equal(patchOxlint(empty, specifier), empty, 'a re-run changes nothing');
});

test('a config that already ignores the plugin folder gains no second entry (#30)', () => {
	const before = '{\n\t"ignorePatterns": ["tools/oxlint/slop-patterns/**"],\n\t"rules": {}\n}\n';
	const after = patchOxlint(before, './tools/oxlint/slop-patterns/index.ts');
	assert.equal(after.match(/tools\/oxlint\/slop-patterns\/\*\*/g).length, 1);
});
