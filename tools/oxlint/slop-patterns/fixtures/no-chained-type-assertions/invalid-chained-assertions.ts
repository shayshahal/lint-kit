declare const input: unknown;
declare const config: unknown;

// The shape generated code reaches for: the first assertion throws the type away, the second
// claims one no one checked.
export const user = input as unknown as { id: string };

// The same chain with angle brackets.
export const settings = <Settings><unknown>config;
interface Settings {
	theme: string;
}

// Three deep, and only the outermost is reported.
export const order = input as unknown as Record<string, unknown> as { id: string };

// A chain inside a call, not only at a declaration.
declare function save(value: { id: string }): void;
save(input as unknown as { id: string });
