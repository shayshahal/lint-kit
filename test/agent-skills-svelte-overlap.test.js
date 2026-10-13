/**
 * Real-config overlap fixtures for the four Svelte accessibility shapes named in
 * docs/agent-skills-lint-rule-proposals.md §2.4 ("Do not duplicate installed checks").
 *
 * Every assertion runs the *installed* configuration — `svelteSkills.config()` over the
 * repository's real parser setup (test/helpers.js) — not a candidate detector in isolation.
 * Ownership is part of the fixture: these shapes are already diagnosed by the Svelte compiler,
 * surfaced through eslint-plugin-svelte's `svelte/valid-compile` at error, so lint-kit adds no
 * `svelte-skills/*` rule for them. The unlabeled input is the documented gap, not a new rule.
 *
 * Verified against the devDependencies in this worktree: svelte 5.57.1, eslint-plugin-svelte
 * 3.23.0, svelte-eslint-parser 1.8.1, eslint 10.11.0.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { config, rules } from '../tools/eslint/svelte-skills.mjs';
import { lint } from './helpers.js';

const FILE = 'src/routes/overlap.svelte';
const DECLARATIONS = 'let name = $state(""); const url = "/cat.png"; function go() {}';
const component = (markup) => `<script lang="ts">\n${DECLARATIONS}\n</script>\n${markup}`;

/** Verify `markup` with the installed config over the repository's real parser setup. */
const diagnose = (markup) => lint(component(markup), FILE, config());

/** The Svelte compiler warning code a `svelte/valid-compile` message carries (its docs URL). */
const compilerCode = (message) => message.match(/svelte\.dev\/e\/([a-z0-9_]+)/)?.[1] ?? null;

/** Every compiler warning code reported for `markup`, sorted for a stable comparison. */
const warningCodes = (markup) =>
	diagnose(markup)
		.map((message) => compilerCode(message.message))
		.filter(Boolean)
		.sort();

/**
 * The four already-covered shapes: a failing fixture with the compiler warning codes it must
 * produce, and legitimate counterexamples that must pass.
 */
const COVERED_SHAPES = [
	{
		shape: 'missing image alt text',
		failing: [{ markup: '<img src={url} />', codes: ['a11y_missing_attribute'] }],
		passing: [
			'<img src={url} alt="A cat asleep on a mat" />',
			// alt="" is the correct decorative-image form, not a missing alt.
			'<img src={url} alt="" />',
		],
	},
	{
		shape: 'unnamed icon-only button',
		failing: [
			{
				markup: '<button><svg><path d="M0 0" /></svg></button>',
				codes: ['a11y_consider_explicit_label'],
			},
		],
		passing: [
			'<button aria-label="Close"><svg><path d="M0 0" /></svg></button>',
			'<button title="Close"><svg><path d="M0 0" /></svg></button>',
			'<button onclick={() => go()}>Save</button>',
		],
	},
	{
		shape: 'inaccessible non-interactive click handler',
		failing: [
			{
				markup: '<div onclick={() => go()}>x</div>',
				codes: ['a11y_click_events_have_key_events', 'a11y_no_static_element_interactions'],
			},
		],
		passing: [
			'<button onclick={() => go()}>Go</button>',
			'<div role="button" tabindex="0" onclick={() => go()} onkeydown={() => go()}>Go</div>',
		],
	},
	{
		shape: 'positive tabindex',
		failing: [
			// The isolated shape: a positive tabindex on an interactive element.
			{
				markup: '<button tabindex="1" onclick={() => go()}>Go</button>',
				codes: ['a11y_positive_tabindex'],
			},
			// On a non-interactive element the compiler adds its own tabindex warning too.
			{
				markup: '<div tabindex="1">x</div>',
				codes: ['a11y_no_noninteractive_tabindex', 'a11y_positive_tabindex'],
			},
		],
		passing: [
			// Zero is the correct form; only values above zero are the violation.
			'<a href="/x" tabindex="0">Go</a>',
			'<button tabindex="0" onclick={() => go()}>Go</button>',
		],
	},
];

test('the overlap is the installed config entry, not a hand-picked rule', () => {
	const [entry] = config();
	assert.deepEqual(entry.rules['svelte/valid-compile'], ['error', { ignoreWarnings: false }]);
});

test('lint-kit ships no custom rule for these accessibility shapes', () => {
	const custom = Object.keys(rules).filter((name) => /a11y|alt|label|tabindex|click/i.test(name));
	assert.deepEqual(custom, []);
});

for (const { shape, failing, passing } of COVERED_SHAPES) {
	test(`installed config rejects ${shape} through the Svelte compiler`, () => {
		for (const { markup, codes } of failing) {
			const messages = diagnose(markup);
			assert.ok(messages.length > 0, `${shape}: expected a diagnostic for ${markup}`);
			for (const message of messages) {
				assert.equal(
					message.ruleId,
					'svelte/valid-compile',
					`${shape}: ${markup} was diagnosed by ${message.ruleId}, not the compiler`,
				);
				assert.equal(message.severity, 2, `${shape}: ${message.ruleId} must be an error`);
			}
			assert.deepEqual(warningCodes(markup), [...codes].sort(), `${shape}: compiler codes`);
		}
	});

	test(`installed config accepts the legitimate ${shape} counterexamples`, () => {
		for (const markup of passing) assert.deepEqual(diagnose(markup), [], `${shape}: ${markup}`);
	});
}

test('unlabeled input is the documented gap, not a duplicate rule', () => {
	// The review probe that opened the question: a text input with no label, no aria-label /
	// aria-labelledby and no wrapping <label> passes the installed config. No rule is added.
	const unlabeled = [
		'<input type="text" bind:value={name} />',
		'<input type="text" />',
		'<input type="text" placeholder="Name" bind:value={name} />',
	];
	for (const markup of unlabeled)
		assert.deepEqual(diagnose(markup), [], `must stay undiagnosed: ${markup}`);

	// A genuinely labelled input must not be caught either.
	assert.deepEqual(diagnose('<label>Name <input type="text" bind:value={name} /></label>'), []);

	// Upstream checks the inverse only — a <label> with no control. Svelte 5.57.1 has no
	// input-label warning, and eslint-plugin-svelte 3.23.0 ships no a11y rules to adopt.
	const inverse = diagnose('<label>Name</label>');
	assert.deepEqual(warningCodes('<label>Name</label>'), ['a11y_label_has_associated_control']);
	assert.deepEqual([...new Set(inverse.map((message) => message.ruleId))], ['svelte/valid-compile']);
});

test('composed UI and spreads are outside what the compiler can decide', () => {
	// A spread may supply the missing attribute, and a child component renders its own markup:
	// the markup the linter sees carries no association, so these are clean here. Rendered-page
	// verification is the mechanism for them — this is not a claim of complete a11y coverage.
	assert.deepEqual(diagnose('<img {...rest} />'), []);
	assert.deepEqual(diagnose('<input type="text" {...rest} />'), []);
	assert.deepEqual(diagnose('<Field label="Name" bind:value={name} />'), []);
});
