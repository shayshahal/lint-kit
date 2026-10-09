/**
 * A test double stands in for a type it is not, and has to say so: `new FakeXHR() as unknown as
 * XMLHttpRequest` and a `Map`-backed `get`/`set` mirroring a real signature are both the shape a
 * test needs, not the shape either rule is looking for. Both rules stay out of test files.
 */
export const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$|[/\\](?:tests?|__tests__)[/\\]/u;
