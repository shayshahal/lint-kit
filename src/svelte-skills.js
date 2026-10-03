/**
 * svelte-skills: Svelte 5 / SvelteKit rules a linter can check, from the Svelte skills
 * (svelte-core-bestpractices, svelte-state-management, sveltekit-remote-functions, the
 * svelte-code-writer autofixer) and the official Svelte / SvelteKit docs: runes mode instead of
 * Svelte 4 syntax, throw-less error() / redirect(), no redirect in a command, deprecated svelte
 * and $app exports, no module state in server files, no set-cookie through setHeaders, and the
 * runtime errors the compiler cannot see (state_unsafe_mutation, flush_sync_in_effect,
 * each_key_volatile, a checkbox bound by value). Each message says what to write instead.
 *
 * config() also switches on three eslint-plugin-svelte rules: valid-compile with warnings (every
 * compiler warning is an error, as the autofixer treats them), require-each-key and
 * prefer-style-directive. They need the `svelte` plugin registered by an earlier config entry
 * (eslint-plugin-svelte's recommended config does).
 *
 * Not a lint rule, left to review: $state.raw for large replaced-only objects, $bindable chains
 * longer than two hops (they span files), context vs module state, remote-first pages,
 * serialisable remote return values, invalid() vs error() in form().
 *
 * Left out on purpose: the remote-functions skill says cookies set in a command() never reach the
 * browser. On SvelteKit 2.56 they do, so that is not a rule.
 */

/** Files the rules apply to by default; tests, specs and stories are out of scope. */
export const DEFAULT_FILES = ['src/**/*.svelte', 'src/**/*.ts', 'src/**/*.js'];
export const DEFAULT_IGNORES = ['src/tests/**', '**/*.test.ts', '**/*.spec.ts', '**/*.stories.*'];

/**
 * Flat-config entries: every svelte-skills rule at error, plus the three eslint-plugin-svelte
 * rules above.
 * @param {{ files?: string[], ignores?: string[] }} [options] - ignores are added to the defaults.
 */
export function config({ files = DEFAULT_FILES, ignores = [] } = {}) {
	return [
		{
			files,
			ignores: [...DEFAULT_IGNORES, ...ignores],
			plugins: { 'svelte-skills': plugin },
			rules: {
				...Object.fromEntries(Object.keys(rules).map((name) => [`svelte-skills/${name}`, 'error'])),
				'svelte/valid-compile': ['error', { ignoreWarnings: false }],
				'svelte/require-each-key': 'error',
				'svelte/prefer-style-directive': 'error',
			},
		},
	];
}

const problem = (description, create, fixable) => ({
	meta: {
		type: 'problem',
		docs: { description },
		schema: [],
		...(fixable ? { fixable: 'code' } : {}),
	},
	create,
});

const isSvelteFile = (context) => context.filename.endsWith('.svelte');
const isRemoteFile = (context) => /\.remote\.(ts|js)$/.test(context.filename);
const elementName = (element, sourceCode) =>
	element.name?.type === 'SvelteName' ? element.name.name : sourceCode.getText(element.name);

/** `$effect(fn)` / `$effect.pre(fn)`. */
const isEffectCall = (node) =>
	node?.type === 'CallExpression' &&
	(node.callee.name === '$effect' ||
		(node.callee.type === 'MemberExpression' &&
			node.callee.object.name === '$effect' &&
			node.callee.property.name === 'pre'));
const isEffectOrMountCall = (node) =>
	isEffectCall(node) || (node?.type === 'CallExpression' && node.callee.name === 'onMount');

/** True when `test` holds for some node under `root` (not following `parent`). */
function contains(root, test) {
	const stack = [root];
	while (stack.length) {
		const node = stack.pop();
		if (!node || typeof node !== 'object') continue;
		if (Array.isArray(node)) {
			stack.push(...node);
			continue;
		}
		if (node.type && test(node)) return true;
		for (const key in node) if (key !== 'parent') stack.push(node[key]);
	}
	return false;
}

/** The remote-function kind (query / command / form / prerender) whose handler holds `node`. */
function enclosingRemoteFunction(node, remoteImports) {
	for (let p = node.parent; p; p = p.parent) {
		if (p.type !== 'CallExpression') continue;
		const callee = p.callee;
		if (callee.type === 'Identifier' && remoteImports.has(callee.name))
			return remoteImports.get(callee.name);
		if (callee.type === 'MemberExpression' && remoteImports.get(callee.object.name) === 'query')
			return 'query';
	}
	return null;
}
const REMOTE_FUNCTIONS = new Set(['query', 'command', 'form', 'prerender']);
function trackRemoteImports(remoteImports) {
	return {
		'ImportDeclaration[source.value="$app/server"] > ImportSpecifier'(node) {
			if (REMOTE_FUNCTIONS.has(node.imported.name))
				remoteImports.set(node.local.name, node.imported.name);
		},
	};
}

// kit/$app-paths: base, assets and resolveRoute are deprecated.
const DEPRECATED_PATHS_EXPORTS = {
	base: "base is deprecated: resolve('/route') for a page or endpoint, asset('/file.png') for a static file.",
	assets: "assets is deprecated: asset('/file.png') for a static file.",
	resolveRoute: "resolveRoute is deprecated: resolve('/route/[id]', { id }).",
};

const DEPRECATED_SVELTE_EXPORTS = {
	createEventDispatcher: 'Take a callback prop (onchange={…}) instead of createEventDispatcher.',
	SvelteComponent: 'Components are functions in Svelte 5; type them as Component<Props>.',
	SvelteComponentTyped: 'Components are functions in Svelte 5; type them as Component<Props>.',
	ComponentType: 'Type a component as Component<Props> instead of ComponentType.',
	ComponentEvents: 'Events are callback props in Svelte 5; read their types from ComponentProps.',
};

/** Local names bound to `names` imported from `source`. */
function trackImports(source, names, into) {
	return {
		[`ImportDeclaration[source.value="${source}"] > ImportSpecifier`](node) {
			if (names.includes(node.imported.name)) into.set(node.local.name, node.imported.name);
		},
	};
}

/**
 * The function that runs `node` synchronously: walks up to the nearest enclosing function.
 * A callback defined further in (a listener, a timer, a .then) runs later, so it is not "inside".
 */
const nearestFunction = (node) => {
	for (let p = node.parent; p; p = p.parent) if (/Function/.test(p.type)) return p;
	return null;
};

/** `name(…)` or `name.member(…)`, e.g. $derived / $derived.by. */
const isRuneCall = (node, rune, member) =>
	node?.type === 'CallExpression' &&
	(member
		? node.callee.type === 'MemberExpression' &&
			node.callee.object.name === rune &&
			node.callee.property.name === member
		: node.callee.name === rune);

/** The identifier a written target is rooted at: `a`, `a.b`, `a[0].c` → a. */
function rootIdentifier(target) {
	while (target?.type === 'MemberExpression') target = target.object;
	return target?.type === 'Identifier' ? target : null;
}

const SERVER_ONLY_FILE = /(\.server|\.remote)\.(ts|js)$/;

const LEGACY = {
	slot: 'Pass a snippet and {@render …} it instead of <slot>.',
	'svelte:fragment': 'Pass a snippet instead of <svelte:fragment>.',
	'svelte:component':
		'Render the component variable directly (<Thing />) instead of <svelte:component this={Thing}>.',
	'svelte:self':
		"Import the component itself (import Self from './ThisComponent.svelte') instead of <svelte:self>.",
};

export const rules = {
	'no-legacy-syntax': problem('Svelte 4 syntax that runes mode replaces.', (context) => ({
		SvelteDirective(node) {
			if (node.kind === 'EventHandler')
				context.report({
					node,
					message: 'Use an onclick={…} attribute instead of the on:click directive.',
				});
		},
		SvelteElement(node) {
			const message = LEGACY[elementName(node, context.sourceCode)];
			if (message) context.report({ node: node.startTag ?? node, message });
		},
		Identifier(node) {
			if (/^\$\$(props|restProps|slots)$/.test(node.name))
				context.report({
					node,
					message: `Use $props() (with a ...rest element) instead of ${node.name}.`,
				});
		},
		'ExportNamedDeclaration > VariableDeclaration[kind="let"]'(node) {
			if (isSvelteFile(context))
				context.report({ node, message: 'Declare props with $props() instead of export let.' });
		},
		// svelte-eslint-parser gives `$:` in a component a node type of its own.
		'SvelteReactiveStatement, LabeledStatement[label.name="$"]'(node) {
			if (isSvelteFile(context))
				context.report({
					node,
					message:
						'Use $derived for a computed value (or $effect for a side effect) instead of $:.',
				});
		},
		ImportDeclaration(node) {
			if (node.source.value === 'svelte/store')
				context.report({
					node,
					message: 'Share state with a class that has $state fields, not a store.',
				});
			if (node.source.value === 'svelte/legacy')
				context.report({
					node,
					message: 'svelte/legacy is a migration shim; write the runes-mode equivalent.',
				});
			if (node.source.value === '$app/stores')
				context.report({
					node,
					message: '$app/stores is deprecated; import page / navigating / updated from $app/state.',
				});
			if (node.source.value === '$app/paths')
				for (const specifier of node.specifiers) {
					const message = DEPRECATED_PATHS_EXPORTS[specifier.imported?.name];
					if (message) context.report({ node: specifier, message });
				}
			if (node.source.value === 'svelte')
				for (const specifier of node.specifiers) {
					const message = DEPRECATED_SVELTE_EXPORTS[specifier.imported?.name];
					if (message) context.report({ node: specifier, message });
				}
		},
	})),

	'prefer-attachment': problem(
		'An action defined in this file should be an attachment.',
		(context) => {
			const local = new Set();
			return {
				':matches(Program, SvelteScriptElement) > FunctionDeclaration'(node) {
					if (node.id) local.add(node.id.name);
				},
				':matches(Program, SvelteScriptElement) > VariableDeclaration > VariableDeclarator'(node) {
					if (node.id.type === 'Identifier') local.add(node.id.name);
				},
				'SvelteDirective[kind="Action"]:exit'(node) {
					const name = node.key.name.type === 'Identifier' ? node.key.name.name : null;
					if (name && local.has(name))
						context.report({
							node,
							message: `Write ${name} as an attachment and use {@attach ${name}} instead of use:${name}. (Library actions such as use:enhance stay.)`,
						});
				},
			};
		},
	),

	'no-class-directive': problem(
		'class:name={…} directives; use an array / object in the class attribute.',
		(context) => ({ SvelteStartTag: (tag) => reportClassDirectives(context, tag) }),
		true,
	),

	'no-index-each-key': problem('An {#each} keyed by its index.', (context) => ({
		SvelteEachBlock(node) {
			// `{#each dots as _, i (i)}`: the item is unused, so the list is positions (dots, skeleton
			// rows) and the index is the only identity there is.
			const positional = node.context?.type === 'Identifier' && node.context.name.startsWith('_');
			if (positional) return;
			if (node.index && node.key?.type === 'Identifier' && node.key.name === node.index.name)
				context.report({
					node: node.key,
					message:
						'The index is not a key: it stays the same when items move, so Svelte updates the wrong DOM. Key by something that identifies the item (its id, or the value itself when values are unique).',
				});
		},
	})),

	'prefer-create-context': problem(
		'setContext / getContext / hasContext with a key.',
		(context) => ({
			'ImportDeclaration[source.value="svelte"] > ImportSpecifier'(node) {
				if (['setContext', 'getContext', 'hasContext'].includes(node.imported.name))
					context.report({
						node,
						message: `Use const [getX, setX] = createContext<T>() (type-safe, no key) instead of ${node.imported.name}.`,
					});
			},
		}),
	),

	'no-window-listener-in-effect': problem(
		'window / document listeners added in onMount or $effect.',
		(context) => ({
			'CallExpression > MemberExpression.callee[property.name="addEventListener"]'(node) {
				const target = node.object;
				if (target.type !== 'Identifier' || !['window', 'document'].includes(target.name)) return;
				for (let p = node.parent; p; p = p.parent)
					if (isEffectOrMountCall(p))
						return context.report({
							node,
							message: `Use <svelte:${target.name} on…={handler} /> instead of ${target.name}.addEventListener in onMount / $effect; Svelte adds and removes it for you.`,
						});
			},
		}),
	),

	'no-browser-check-in-effect': problem('if (browser) inside $effect.', (context) => ({
		CallExpression(node) {
			if (!isEffectCall(node)) return;
			const body = node.arguments[0]?.body;
			if (body?.type !== 'BlockStatement') return;
			for (const statement of body.body)
				if (
					statement.type === 'IfStatement' &&
					contains(
						statement.test,
						(n) =>
							(n.type === 'Identifier' && n.name === 'browser') ||
							(n.type === 'UnaryExpression' &&
								n.operator === 'typeof' &&
								['window', 'document'].includes(n.argument.name)),
					)
				)
					context.report({
						node: statement,
						message: 'Effects never run on the server; drop the browser check.',
					});
		},
	})),

	'derived-by-for-functions': problem(
		'$derived given a function.',
		(context) => ({
			'CallExpression[callee.name="$derived"]'(node) {
				if (/FunctionExpression$/.test(node.arguments[0]?.type ?? ''))
					context.report({
						node,
						message:
							'$derived takes an expression; given a function, the value IS the function. Use $derived.by(() => …).',
						fix: (fixer) => fixer.replaceText(node.callee, '$derived.by'),
					});
			},
		}),
		true,
	),

	'no-state-write-in-effect': problem(
		'$state / $derived assigned in the body of an $effect.',
		(context) => {
			const stateNames = new Set();
			const isRune = (init) =>
				init?.type === 'CallExpression' &&
				(/^\$(state|derived)$/.test(init.callee.name) ||
					(init.callee.type === 'MemberExpression' &&
						/^\$(state|derived)$/.test(init.callee.object.name)));
			return {
				VariableDeclarator(node) {
					if (node.id.type === 'Identifier' && isRune(node.init)) stateNames.add(node.id.name);
				},
				'AssignmentExpression, UpdateExpression'(node) {
					const target = node.type === 'UpdateExpression' ? node.argument : node.left;
					if (target.type !== 'Identifier' || !stateNames.has(target.name)) return;
					// The effect's own body only: a callback it registers (a listener, a timer) runs later.
					for (let p = node.parent; p; p = p.parent) {
						if (/Function/.test(p.type)) {
							if (isEffectCall(p.parent))
								context.report({
									node,
									message: `Compute "${target.name}" with $derived (writable, so it can still be set), or set it in the event handler that causes the change, not in an $effect.`,
								});
							return;
						}
					}
				},
			};
		},
	),

	'remote-error-not-throw': problem('throw new Error in a remote function handler.', (context) => {
		const remoteImports = new Map();
		return {
			...trackRemoteImports(remoteImports),
			'ThrowStatement > NewExpression.argument[callee.name="Error"]'(node) {
				if (enclosingRemoteFunction(node, remoteImports))
					context.report({
						node,
						message:
							"A thrown Error reaches the client as 'Internal Error'. Use error(status, message) from @sveltejs/kit (in form(), invalid() for a recoverable problem).",
					});
			},
		};
	}),

	'remote-functions-in-remote-files': problem(
		'query / command / form / prerender outside *.remote.ts.',
		(context) => ({
			'ImportDeclaration[source.value="$app/server"] > ImportSpecifier'(node) {
				if (REMOTE_FUNCTIONS.has(node.imported.name) && !isRemoteFile(context))
					context.report({
						node,
						message: `Remote functions live in *.remote.ts files; move this ${node.imported.name}() there.`,
					});
			},
		}),
	),

	'no-await-const-in-boundary': problem(
		'{@const x = await …} inside <svelte:boundary>.',
		(context) => ({
			':matches(SvelteConstTag, SvelteDeclarationTag) AwaitExpression'(node) {
				for (let p = node.parent; p; p = p.parent)
					if (
						p.type === 'SvelteElement' &&
						elementName(p, context.sourceCode) === 'svelte:boundary'
					)
						return context.report({
							node,
							message:
								'{@const … await} inside <svelte:boundary> loops forever on client navigation when pages share a query (sveltejs/svelte#17717). Use {#await} or the query properties.',
						});
			},
		}),
	),

	'track-remote-query-args': problem(
		'A remote query called with reactive arguments outside $derived.',
		(context) => {
			const remote = new Set();
			return {
				ImportDeclaration(node) {
					if (/\.remote(\.(ts|js))?$/.test(node.source.value))
						for (const specifier of node.specifiers) remote.add(specifier.local.name);
				},
				':matches(Program, SvelteScriptElement) > VariableDeclaration > VariableDeclarator'(node) {
					const init = node.init;
					if (
						!isSvelteFile(context) ||
						init?.type !== 'CallExpression' ||
						init.callee.type !== 'Identifier'
					)
						return;
					if (!remote.has(init.callee.name)) return;
					if (init.arguments.some((arg) => contains(arg, (n) => n.type === 'Identifier')))
						context.report({
							node,
							message: `Its arguments are read once, so the query never re-runs. Wrap the call: $derived(${init.callee.name}(…)).`,
						});
				},
			};
		},
	),

	// svelte/@const: «`{@const x = y}` is legacy syntax — use `{const x = $derived(y)}` instead».
	// $derived keeps it reactive, as {@const} was; a bare {const} is computed once. A function needs
	// no $derived: it reads its inputs when called.
	'no-const-tag': problem(
		'{@const …} (legacy) instead of a declaration tag.',
		(context) => ({
			SvelteConstTag(node) {
				const sourceCode = context.sourceCode;
				const declarators = node.declarations ?? [node.declaration];
				context.report({
					node,
					message: '{@const x = y} is legacy; write {const x = $derived(y)}.',
					fix: (fixer) =>
						fixer.replaceText(
							node,
							`{const ${declarators
								.map((d) =>
									/Function/.test(d.init.type)
										? sourceCode.getText(d)
										: `${sourceCode.getText(d.id)} = $derived(${sourceCode.getText(d.init)})`,
								)
								.join(', ')}}`,
						),
				});
			},
		}),
		true,
	),

	// kit/migrating-to-sveltekit-2: «calling the functions is sufficient».
	'no-throw-kit-error': problem(
		'throw error(…) / throw redirect(…) from @sveltejs/kit.',
		(context) => {
			const kit = new Map();
			return {
				...trackImports('@sveltejs/kit', ['error', 'redirect'], kit),
				'ThrowStatement[argument.type="CallExpression"]'(node) {
					const name = kit.get(node.argument.callee.name);
					if (!name) return;
					context.report({
						node,
						message: `${name}() throws by itself since SvelteKit 2; call it without throw.`,
						fix: (fixer) => fixer.removeRange([node.range[0], node.argument.range[0]]),
					});
				},
			};
		},
		true,
	),

	// kit/remote-functions: redirect «is *not* possible inside `command` functions».
	'no-redirect-in-command': problem('redirect() inside a command() handler.', (context) => {
		const remoteImports = new Map();
		const kit = new Map();
		return {
			...trackRemoteImports(remoteImports),
			...trackImports('@sveltejs/kit', ['redirect'], kit),
			CallExpression(node) {
				if (kit.has(node.callee.name) && enclosingRemoteFunction(node, remoteImports) === 'command')
					context.report({
						node,
						message:
							'A command cannot redirect. Return { redirect: location } and goto() it on the client.',
					});
			},
		};
	}),

	// Runtime error state_unsafe_mutation, which the compiler cannot see.
	'no-state-write-in-derived': problem(
		'$state written while a $derived is computed.',
		(context) => {
			const stateNames = new Set();
			return {
				VariableDeclarator(node) {
					const init = node.init;
					if (
						node.id.type === 'Identifier' &&
						(isRuneCall(init, '$state') || isRuneCall(init, '$state', 'raw'))
					)
						stateNames.add(node.id.name);
				},
				'AssignmentExpression, UpdateExpression'(node) {
					const root = rootIdentifier(node.type === 'UpdateExpression' ? node.argument : node.left);
					if (!root || !stateNames.has(root.name)) return;
					const fn = nearestFunction(node);
					const inDerived = fn
						? isRuneCall(fn.parent, '$derived', 'by') && fn.parent.arguments[0] === fn
						: false;
					let inDerivedExpression = false;
					for (let p = node.parent; p && p !== fn; p = p.parent)
						if (isRuneCall(p, '$derived')) inDerivedExpression = true;
					if (inDerived || inDerivedExpression)
						context.report({
							node,
							message: `Writing "${root.name}" while a $derived is computed throws (state_unsafe_mutation). Derive the value, or write it in the event that causes the change.`,
						});
				},
			};
		},
	),

	// Runtime error flush_sync_in_effect.
	'no-flush-sync-in-effect': problem('flushSync() in the body of an $effect.', (context) => {
		const svelte = new Map();
		return {
			...trackImports('svelte', ['flushSync'], svelte),
			CallExpression(node) {
				if (svelte.has(node.callee.name) && isEffectCall(nearestFunction(node)?.parent))
					context.report({
						node,
						message:
							'flushSync() inside an $effect throws (flush_sync_in_effect). Use await tick() instead.',
					});
			},
		};
	}),

	// kit/state-management: server module state is shared by every request, so every user.
	'no-server-module-state': problem('A module-level let / var in server-only code.', (context) => ({
		'Program > VariableDeclaration[kind!="const"], Program > ExportNamedDeclaration > VariableDeclaration[kind!="const"]'(
			node,
		) {
			if (SERVER_ONLY_FILE.test(context.filename))
				context.report({
					node,
					message:
						'Module state on the server is shared between all requests, so between users. Keep it in the request (event.locals, the load return value) instead.',
				});
		},
	})),

	// Runtime error each_key_volatile: a literal makes a new key on every run.
	'no-volatile-each-key': problem('An {#each} keyed by an object or array literal.', (context) => ({
		SvelteEachBlock(node) {
			if (/^(ObjectExpression|ArrayExpression)$/.test(node.key?.type ?? ''))
				context.report({
					node: node.key,
					message:
						'A literal key is new on every run (each_key_volatile). Key by a stable id, or join the parts into a string.',
				});
		},
	})),

	// A checkbox's value attribute is not its state.
	'no-checkbox-bind-value': problem('bind:value on <input type="checkbox">.', (context) => ({
		SvelteElement(node) {
			if (elementName(node, context.sourceCode) !== 'input') return;
			const attributes = node.startTag.attributes;
			const type = attributes.find((a) => a.type === 'SvelteAttribute' && a.key.name === 'type');
			if (type?.value.length !== 1 || type.value[0].value !== 'checkbox') return;
			const bind = attributes.find(
				(a) => a.type === 'SvelteDirective' && a.kind === 'Binding' && a.key.name.name === 'value',
			);
			if (bind)
				context.report({
					node: bind,
					message:
						'A checkbox holds its state in checked; use bind:checked (bind:group for a list).',
				});
		},
	})),

	// kit/load: «You cannot add a set-cookie header with setHeaders».
	'no-set-cookie-header': problem('set-cookie passed to setHeaders.', (context) => ({
		'CallExpression[callee.name="setHeaders"] > ObjectExpression > Property'(node) {
			const key = node.key.type === 'Identifier' ? node.key.name : node.key.value;
			if (typeof key === 'string' && key.toLowerCase() === 'set-cookie')
				context.report({
					node,
					message: 'setHeaders cannot set cookies; use cookies.set(name, value, { path }).',
				});
		},
	})),
};

// ---- no-class-directive: report once per element, fix all its class: directives together. ----

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

function reportClassDirectives(context, tag) {
	const directives = tag.attributes.filter(
		(a) => a.type === 'SvelteDirective' && a.kind === 'Class',
	);
	if (!directives.length) return;
	const sourceCode = context.sourceCode;
	const classAttributes = tag.attributes.filter(
		(a) =>
			(a.type === 'SvelteAttribute' || a.type === 'SvelteShorthandAttribute') &&
			a.key.name === 'class',
	);
	const hasSpread = tag.attributes.some((a) => a.type === 'SvelteSpreadAttribute');
	// Without a class attribute, a new one after a spread would override the spread's class.
	const fixable = classAttributes.length === 1 || (classAttributes.length === 0 && !hasSpread);
	context.report({
		node: directives[0],
		message:
			'Put conditional classes in the class attribute, class={[base, { name: condition }]}, not class:name={…}.',
		fix: fixable
			? (fixer) => fixClassDirectives(fixer, sourceCode, classAttributes[0], directives)
			: null,
	});
}

function fixClassDirectives(fixer, sourceCode, classAttribute, directives) {
	const entries = directives.map((directive) => {
		const text = sourceCode.getText(directive);
		const name = text.slice('class:'.length).split('=')[0].trim();
		const key = IDENTIFIER.test(name) ? name : `'${name}'`;
		if (!text.includes('=')) return name; // class:active → { active }
		const value = sourceCode.getText(directive.expression);
		return key === value ? key : `${key}: ${value}`;
	});
	const object = `{ ${entries.join(', ')} }`;
	const base = classAttribute ? classExpression(sourceCode, classAttribute) : null;
	const replacement = base ? `class={[${base}, ${object}]}` : `class={${object}}`;
	const removals = directives.map((directive) => {
		let start = directive.range[0];
		while (/\s/.test(sourceCode.text[start - 1])) start--;
		return [start, directive.range[1]];
	});
	const target = classAttribute ?? directives[0];
	return [
		fixer.replaceText(target, replacement),
		...removals.filter((_, i) => classAttribute || i > 0).map((range) => fixer.removeRange(range)),
	];
}

/** The class attribute's value as one JS expression. */
function classExpression(sourceCode, attribute) {
	if (attribute.type === 'SvelteShorthandAttribute') return 'class';
	const parts = attribute.value;
	if (parts.length === 1 && parts[0].type === 'SvelteMustacheTag')
		return sourceCode.getText(parts[0].expression);
	if (parts.every((p) => p.type === 'SvelteLiteral'))
		return `'${parts
			.map((p) => p.value)
			.join('')
			.replace(/\\/g, '\\\\')
			.replace(/'/g, "\\'")}'`;
	const template = parts
		.map((p) =>
			p.type === 'SvelteLiteral'
				? p.value.replace(/[`\\]|\$\{/g, (c) => '\\' + c)
				: '${' + sourceCode.getText(p.expression) + '}',
		)
		.join('');
	return '`' + template + '`';
}

for (const [name, rule] of Object.entries(rules))
	rule.meta.docs.url = `https://github.com/shayshahal/lint-kit/blob/main/docs/svelte-skills.md#${name}`;

export const plugin = { meta: { name: 'svelte-skills' }, rules };

export default { plugin, rules, config };
