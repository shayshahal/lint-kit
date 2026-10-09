declare const input: unknown;
declare const raw: string;

// One assertion is a claim about the value, and it is the one the rule leaves to review.
export const user = input as { id: string };

// `as const` widens a literal and asserts nothing about what it was, however often it is written.
export const tuple = [1, "two"] as const;
export const frozen = { a: 1 } as const as const;

// Narrowing first, then one assertion: the type is evidence, not a claim.
declare function isUser(value: unknown): value is { id: string };
export const checked = isUser(input) ? (input as { id: string }) : null;

// Not assertions at all.
export const parsed: unknown = JSON.parse(raw) satisfies unknown;
export const text = raw!;
