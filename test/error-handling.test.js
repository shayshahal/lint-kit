import assert from 'node:assert/strict';
import { test } from 'node:test';
import { config, noDefaultPromiseCatch, noStringifiedError, noSwallowedCatch } from '../tools/eslint/error-handling.mjs';
import { lint, svelteTester, tsTester } from './helpers.js';

tsTester.run('no-swallowed-catch', noSwallowedCatch, {
	valid: [
		'try { a(); } catch (e) { throw new Error("a failed", { cause: e }); }',
		'try { a(); } catch (e) { console.error(e); throw e; }',
		'try { a(); } catch (e) { logger.error(e); return fail(500, { message: m.saveFailed() }); }',
		'try { a(); } catch (e) { status = "error"; }',
		// a comment is the reason
		'try { a(); } catch { /* the cache is optional */ }',
		'try { a(); } catch (e) {\n\t// a stale tab: the next load refetches\n\tconsole.warn(e);\n}',
		// a predicate: failing is the answer
		'function isUrl(s) { try { new URL(s); return true; } catch { return false; } }',
		// a status after the error is reported
		'function run() { try { a(); } catch (e) { log.error(e.message); return 2; } }',
		// not a logger
		'try { a(); } catch (e) { toast.error(m.failed()); }',
	],
	invalid: [
		{ code: 'try { a(); } catch (e) {}', errors: [{ messageId: 'empty' }] },
		{ code: 'try { a(); } catch (e) { console.error(e); }', errors: [{ messageId: 'log' }] },
		{ code: 'try { a(); } catch (e) { this.logger.warn("a", e); log.info(e); }', errors: [{ messageId: 'log' }] },
		{ code: 'function f() { try { return a(); } catch (e) { console.error(e); return null; } }', errors: [{ messageId: 'default' }] },
		{ code: 'function f() { try { return a(); } catch { return []; } }', errors: [{ messageId: 'default' }] },
		{ code: 'function f() { try { return a(); } catch { return; } }', errors: [{ messageId: 'default' }] },
		{ code: "function f() { try { return a(); } catch { return ''; } }", errors: [{ messageId: 'default' }] },
	],
});

tsTester.run('no-default-promise-catch', noDefaultPromiseCatch, {
	valid: [
		'load().catch((e) => { throw new Error("load failed", { cause: e }); });',
		'load().catch(handleError);',
		'load().catch((e) => { status = "error"; console.error(e); });',
		'load().catch(() => { /* prefetch: the page loads it again */ });',
		'load().then(ok);',
		// marks a promise handled; whoever awaits it still gets the error
		'promise.catch(() => {}); results.push(promise);',
		'this.pending.catch(() => {}).finally(done);',
	],
	invalid: [
		{ code: 'load().catch(() => null);', errors: [{ messageId: 'default' }] },
		{ code: 'load().catch(() => []);', errors: [{ messageId: 'default' }] },
		{ code: 'load().catch(() => {});', errors: [{ messageId: 'empty' }] },
		// a held promise's handler that returns a default still hides the error from this chain
		{ code: 'const items = await pending.catch(() => null);', errors: [{ messageId: 'default' }] },
		{ code: 'load().catch(console.error);', errors: [{ messageId: 'log' }] },
		{ code: 'load().catch((e) => console.warn(e));', errors: [{ messageId: 'log' }] },
		{ code: 'load().catch(function (e) { logger.error(e); return undefined; });', errors: [{ messageId: 'default' }] },
	],
});

tsTester.run('no-stringified-error', noStringifiedError, {
	valid: [
		'try { a(); } catch (e) { throw new Error("a failed", { cause: e }); }',
		'try { a(); } catch (e) { message = e instanceof Error ? e.message : String(e); }',
		'try { a(); } catch (e) { if (!(e instanceof Error)) throw e; message = e.message; }',
		'try { a(); } catch (e) { if (e instanceof Error) report(e); else report(new Error(String(e))); }',
		// not the caught error
		'const e = 1; String(e);',
		'try { a(); } catch { String(x); }',
	],
	invalid: [
		{ code: 'try { a(); } catch (e) { message = String(e); }', errors: 1 },
		{ code: 'try { a(); } catch (err) { log(`failed: ${err}`); }', errors: 1 },
		{ code: 'try { a(); } catch (e) { log("failed: " + e); }', errors: 1 },
		{ code: 'try { a(); } catch (e) { log(e.toString()); }', errors: 1 },
		{ code: 'load().catch((e) => setError(String(e)));', errors: 1 },
	],
});

svelteTester.run('error-handling in a component', noSwallowedCatch, {
	valid: [],
	invalid: [
		{
			code: '<script lang="ts">\n\tasync function save() {\n\t\ttry { await post(); } catch (e) { console.error(e); }\n\t}\n</script>\n',
			filename: 'src/routes/x.svelte',
			errors: [{ messageId: 'log' }],
		},
	],
});

test('config() applies the rules to src/ and skips tests and stories', () => {
	const code = 'try { a(); } catch (e) {}';
	const ids = (file) => lint(code, file, config()).map((m) => m.ruleId);
	assert.deepEqual(ids('src/lib/x.ts'), ['error-handling/no-swallowed-catch']);
	assert.deepEqual(ids('src/lib/x.test.ts'), []);
	assert.deepEqual(ids('scripts/x.ts'), []);
});
