/**
 * tailwind-patterns: Tailwind / shadcn conventions no plugin checks, as no-restricted-syntax and
 * no-restricted-imports entries. Class patterns match markup (`class="…"`, needs
 * svelte-eslint-parser), script strings (cn(), tv(), arrays) and template literals.
 *
 *   lightOnly        bg-white / text-black, which stay light in dark mode (with `darkMode`)
 *   darkOverride     a dark: colour override outside the ui/ folder: the token should carry it
 *   transitionAll    transition-all, which animates layout too
 *   viewportVh       h-screen / [90vh]: vh runs under the mobile browser bar; dvh follows it
 *                    (a rule of its own, tailwind-patterns/viewport-vh, so --fix can swap in dvh)
 *   untitledOverlay  a Dialog / AlertDialog / Modal / Sheet / Drawer .Content without a .Title
 *   lucideBarrel     importing icons from the @lucide/svelte root, which loads every icon in dev
 *
 * ESLint keeps one option list per rule, so a project's own no-restricted-syntax patterns must go
 * through `extra` / `extraUi` (and imports through `restrictedImports`) rather than a later entry,
 * which would replace these.
 */

/** The ui/ folder: design-system components own their appearance there. */
export const DEFAULT_UI_FILES = ['src/lib/components/ui/**'];

/**
 * A class-token pattern as no-restricted-syntax entries for markup, script strings and template
 * literals. Patterns go into esquery, so they must not contain a `/` other than the delimiters.
 * @param {string} pattern - an esquery regex, `/…/`.
 * @param {string} message
 */
export function classRule(pattern, message) {
	return [
		{ selector: `SvelteLiteral[value=${pattern}]`, message },
		{ selector: `Literal[value=${pattern}]`, message },
		{ selector: `TemplateElement[value.raw=${pattern}]`, message },
	];
}

// bg-white / text-black ignore dark mode: the card, popover and background tokens follow .dark.
// Any prefix, ! and /opacity.
const LIGHT_ONLY = String.raw`/(^|\s)!?([^\s:]+:)*!?(bg-white|text-black)([^\s\w-]\d+)?!?(\s|$)/`;
// A dark: colour override outside ui/ means the token under it is wrong for dark mode. Sizes,
// widths and styles after the prefix (text-sm, border-2, border-t, ring-offset…) are not colours.
const DARK_OVERRIDE = String.raw`/(^|\s)!?([^\s:]+:)*dark:([^\s:]+:)*!?(bg|text|border|ring|fill|stroke|from|via|to|divide|outline|decoration|caret|accent|placeholder)-(?!((xs|sm|base|lg|xl|[0-9]|none|left|right|center|start|end|justify|wrap|nowrap|ellipsis|clip|offset|inset|solid|dashed|dotted|double|hidden|wavy|auto|[trblxyse]|[bi][se])(\b|$)))[a-z]/`;
// transition-all animates every property that changes, layout included, which is what janks.
const TRANSITION_ALL = String.raw`/(^|\s)!?([^\s:]+:)*!?transition-all!?(\s|$)/`;
// vh is the viewport with the mobile browser bar hidden; dvh follows the bar. svh / lvh pass.
const VIEWPORT_VH = String.raw`/(^|\s)!?([^\s:]+:)*!?((min|max)-)?h-screen!?(\s|$)|\[[^\s\]]*\dvh\b/`;
// Dialog-type overlays need a Title for screen readers (bits-ui labels the dialog with it).
const UNTITLED_OVERLAY =
	"SvelteElement[name.type='SvelteMemberExpressionName'][name.property.name='Content'][name.object.name=/^(Dialog|AlertDialog|Modal|Sheet|Drawer)$/]:not(:has(SvelteElement[name.type='SvelteMemberExpressionName'][name.property.name='Title']))";

export const PATTERNS = {
	lightOnly: LIGHT_ONLY,
	darkOverride: DARK_OVERRIDE,
	transitionAll: TRANSITION_ALL,
	viewportVh: VIEWPORT_VH,
	untitledOverlay: UNTITLED_OVERLAY,
};

export const MESSAGES = {
	lightOnly:
		'bg-white / text-black stay light in dark mode. Use a token: bg-card, bg-popover, bg-background, text-foreground.',
	darkOverride:
		'No dark: colour overrides outside ui/. The token should carry dark mode: use one that does, or fix its .dark value.',
	transitionAll:
		'No transition-all: list what changes. `transition` (colour, opacity, shadow, transform), transition-colors, transition-opacity, or a named utility for size.',
	viewportVh:
		'Use dvh, not vh: h-dvh / min-h-dvh instead of h-screen, and [90dvh] instead of [90vh]. vh ignores the mobile browser bar.',
	untitledOverlay:
		'A Dialog / AlertDialog / Modal / Sheet / Drawer .Content needs a .Title inside it (class="sr-only" if it should not show) — it is the dialog\'s accessible name.',
	lucideBarrel: "Import each icon from its own path: `import XIcon from '@lucide/svelte/icons/x'`.",
};

// h-screen / min-h-screen / max-h-screen with any prefix, between quotes, spaces or ${ }.
const SCREEN_TOKEN = /(^|[\s'"`{}])(!?(?:[^\s'"`{}:]+:)*!?(?:(?:min|max)-)?h-)screen(?=!?(?:[\s'"`${}]|$))/g;
// A number followed by vh inside an arbitrary value: [90vh], [calc(100vh-2rem)].
const ARBITRARY_VALUE = /\[[^\s\]]*\]/g;

/** `text` (a literal's source) with h-screen → h-dvh and [..90vh..] → [..90dvh..]. */
export const toDvh = (text) =>
	text
		.replace(SCREEN_TOKEN, '$1$2dvh')
		.replace(ARBITRARY_VALUE, (value) => value.replace(/(\d)vh\b/g, '$1dvh'));

const viewportVh = {
	meta: {
		type: 'problem',
		docs: { description: 'h-screen / [90vh] where dvh follows the mobile browser bar.' },
		fixable: 'code',
		schema: [{ type: 'object', properties: { message: { type: 'string' } }, additionalProperties: false }],
	},
	create(context) {
		const pattern = new RegExp(VIEWPORT_VH.slice(1, -1));
		const message = context.options[0]?.message ?? MESSAGES.viewportVh;
		const check = (node, value) => {
			if (typeof value !== 'string' || !pattern.test(value)) return;
			const source = context.sourceCode.getText(node);
			const fixed = toDvh(source);
			context.report({
				node,
				message,
				fix: fixed === source ? null : (fixer) => fixer.replaceText(node, fixed),
			});
		};
		return {
			SvelteLiteral: (node) => check(node, node.value),
			Literal: (node) => check(node, node.value),
			TemplateElement: (node) => check(node, node.value.raw),
		};
	},
};

export const plugin = { meta: { name: 'tailwind-patterns' }, rules: { 'viewport-vh': viewportVh } };

/** @param {string} message */
export const lucideBarrel = (message = MESSAGES.lucideBarrel) => ({
	name: '@lucide/svelte',
	allowImportNames: ['LucideIcon', 'IconProps'],
	message,
});

/**
 * @typedef {{ selector: string, message: string }} RestrictedSyntax
 * @typedef {object} TailwindPatternsOptions
 * @property {string[]} [files] - where the patterns apply (default: .svelte, .ts, .js).
 * @property {string[]} [uiFiles] - the design-system folder, where dark: overrides and untitled
 *   overlay wrappers belong.
 * @property {boolean} [darkMode] - the app toggles .dark, so lightOnly is on.
 * @property {RestrictedSyntax[]} [extra] - the project's own no-restricted-syntax entries.
 * @property {RestrictedSyntax[]} [extraUi] - the project's own entries that also apply in uiFiles.
 * @property {object[]} [restrictedImports] - extra no-restricted-imports `paths` entries.
 * @property {Partial<typeof MESSAGES>} [messages] - replace a pattern's message.
 */

/** @param {TailwindPatternsOptions} [options] */
export function config({
	files = ['**/*.svelte', '**/*.ts', '**/*.js'],
	uiFiles = DEFAULT_UI_FILES,
	darkMode = false,
	extra = [],
	extraUi = [],
	restrictedImports = [],
	messages: overrides = {},
} = {}) {
	const m = { ...MESSAGES, ...overrides };
	const lightOnly = darkMode ? classRule(LIGHT_ONLY, m.lightOnly) : [];
	return [
		{
			files,
			plugins: { 'tailwind-patterns': plugin },
			rules: {
				'tailwind-patterns/viewport-vh': ['error', { message: m.viewportVh }],
				'no-restricted-imports': [
					'error',
					{ paths: [lucideBarrel(m.lucideBarrel), ...restrictedImports] },
				],
				'no-restricted-syntax': [
					'error',
					...lightOnly,
					...classRule(DARK_OVERRIDE, m.darkOverride),
					...classRule(TRANSITION_ALL, m.transitionAll),
					...extraUi,
					{ selector: UNTITLED_OVERLAY, message: m.untitledOverlay },
					...extra,
				],
			},
		},
		{
			// ui/ is where dark: overrides belong, and where the overlay wrappers (no title of their
			// own) live. lightOnly, transition-all and vh stay errors there too.
			files: uiFiles,
			plugins: { 'tailwind-patterns': plugin },
			rules: {
				'tailwind-patterns/viewport-vh': ['error', { message: m.viewportVh }],
				'no-restricted-syntax': [
					'error',
					...lightOnly,
					...classRule(TRANSITION_ALL, m.transitionAll),
					...extraUi,
				],
			},
		},
	];
}

export default { config, classRule, lucideBarrel, plugin, toDvh, PATTERNS, MESSAGES };
