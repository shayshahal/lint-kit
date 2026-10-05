/**
 * untranslated-text/no-untranslated-text: every word a user reads comes from the app's message
 * catalogue (Paraglide's `m.key()`, or any i18n call), so each language's UI is in that language.
 * It reports:
 *   - text in Svelte markup (two letters in a row, any script),
 *   - aria-label / placeholder / title / alt / label written as a literal,
 *   - with `bannedInCode`, a string in script code containing that script (a label built in code
 *     shows in the source language in every UI). E.g. '[\\u0590-\\u05FF]' for Hebrew.
 * Not text, so allowed: emails, URLs, paths, social network names, format hints (03-XXXXXXX,
 * SAVE20, a file-type list like JPG, PNG), AM / PM, and whatever `allow` adds (brand names).
 * Already translated, so allowed (with `locales`): a { he: '…', en: '…' } pair in data.
 *
 * Components without a catalogue may pick the language themselves (`lang === 'en' ? 'X' : 'Y'`):
 * with `inlineLocales`, a string that is a branch of a conditional passes.
 */

/** Files the rule applies to by default; tests, specs and stories assert or demo what users see. */
export const DEFAULT_FILES = ['src/**/*.svelte', 'src/**/*.ts', 'src/**/*.js'];
export const DEFAULT_IGNORES = ['src/tests/**', '**/*.test.ts', '**/*.spec.ts', '**/*.stories.*'];

/**
 * @typedef {object} UntranslatedTextOptions
 * @property {boolean} [inlineLocales] - a string that is a branch of a conditional passes.
 * @property {string[]} [allow] - regex sources of whole strings that are not text (brand names).
 * @property {string} [bannedInCode] - regex source of a script no string in code may contain.
 * @property {string[]} [locales] - keys of an inline translation pair, e.g. ['he', 'en'].
 * @property {{ text?: string, code?: string }} [messages] - replace the report messages (say where
 *   the catalogue lives).
 */

/**
 * Flat-config entries with the rule at error.
 * @param {UntranslatedTextOptions & { files?: string[], ignores?: string[] }} [options] - ignores
 *   are added to the defaults: files whose text is deliberately one language (say why there).
 */
export function config({ files = DEFAULT_FILES, ignores = [], ...options } = {}) {
	return [
		{
			files,
			ignores: [...DEFAULT_IGNORES, ...ignores],
			plugins: { 'untranslated-text': plugin },
			rules: { 'untranslated-text/no-untranslated-text': ['error', options] },
		},
	];
}

const LETTERS = /\p{L}{2}/u;
// Whole-string exceptions: social networks and SMS, a file-type list (JPG, PNG), email, URL,
// path, format hints (03-XXXXXXX, SAVE20) and the AM / PM clock markers.
const NOT_TEXT = String.raw`Facebook|Instagram|LinkedIn|WhatsApp|SMS|[A-Z]{3,4}(, [A-Z]{3,4})+|[\w.+-]+@[\w.-]+\.\w+|https?:\/\/\S*|\/[\w/-]*|[\d-]*X{2,}|[A-Z]+\d+|AM|PM`;
const TEXT_ATTRIBUTES = new Set(['aria-label', 'placeholder', 'title', 'alt', 'label']);

const MESSAGE =
	'Words the user reads come from the message catalogue (m.key()); literal text shows untranslated in the other languages.';
const CODE_MESSAGE =
	'This script in code shows in every language of the UI. Move the string to the message catalogue and call m.key().';

export const rule = {
	meta: {
		type: 'problem',
		docs: {
			description: 'Text the user reads must come from the message catalogue.',
			url: new URL('./untranslated-text.md#no-untranslated-text', import.meta.url).href,
		},
		schema: [
			{
				type: 'object',
				properties: {
					inlineLocales: { type: 'boolean' },
					allow: { type: 'array', items: { type: 'string' } },
					bannedInCode: { type: 'string' },
					locales: { type: 'array', items: { type: 'string' } },
					messages: {
						type: 'object',
						properties: { text: { type: 'string' }, code: { type: 'string' } },
						additionalProperties: false,
					},
				},
				additionalProperties: false,
			},
		],
		messages: { text: '{{message}}', code: '{{message}}' },
	},
	create(context) {
		const {
			inlineLocales = false,
			allow = [],
			bannedInCode,
			locales = [],
			messages = {},
		} = context.options[0] ?? {};
		const notText = new RegExp(String.raw`^\s*(${[NOT_TEXT, ...allow].join('|')})\s*$`);
		const banned = bannedInCode ? new RegExp(bannedInCode, 'u') : null;
		const text = { messageId: 'text', data: { message: messages.text ?? MESSAGE } };
		const code = { messageId: 'code', data: { message: messages.code ?? CODE_MESSAGE } };

		const isText = (s) => LETTERS.test(s) && !notText.test(s);
		const inLocaleBranch = (node) => inlineLocales && node.parent?.type === 'ConditionalExpression';
		const keyName = (p) => p.key?.name ?? p.key?.value;
		const inLocalePair = (node) =>
			locales.length > 1 &&
			node.parent?.type === 'Property' &&
			locales.includes(keyName(node.parent)) &&
			node.parent.parent.properties.some(
				(p) => p !== node.parent && locales.includes(keyName(p)),
			);
		return {
			SvelteText(node) {
				if (
					node.parent?.type === 'SvelteStyleElement' ||
					node.parent?.type === 'SvelteScriptElement'
				)
					return;
				if (isText(node.value)) context.report({ node, ...text });
			},
			SvelteAttribute(node) {
				if (!TEXT_ATTRIBUTES.has(node.key.name)) return;
				for (const part of node.value)
					if (part.type === 'SvelteLiteral' && isText(part.value))
						context.report({ node: part, ...text });
			},
			Literal(node) {
				if (
					banned &&
					typeof node.value === 'string' &&
					banned.test(node.value) &&
					!inLocaleBranch(node) &&
					!inLocalePair(node)
				)
					context.report({ node, ...code });
			},
			TemplateLiteral(node) {
				if (
					banned &&
					node.quasis.some((q) => banned.test(q.value.cooked ?? q.value.raw)) &&
					!inLocaleBranch(node)
				)
					context.report({ node, ...code });
			},
		};
	},
};

export const plugin = {
	meta: { name: 'untranslated-text' },
	rules: { 'no-untranslated-text': rule },
};

export default { plugin, rule, config };
