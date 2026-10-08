declare function formatMoney(amount: number, currency?: string): string;
declare function fetchUser(id: string): Promise<unknown>;
declare const theme: { get(): string };

// Not a call: the body does something else.
export function double(value: number): number {
	return value * 2;
}

// The callee resolves a value before calling it, so the wrapper is doing work. This is the
// `new Intl.NumberFormat(...).format` shape and must not report.
export function formatCurrency(amount: number): string {
	return new Intl.NumberFormat("en-US").format(amount);
}

// A parameter is transformed on the way through.
export function loadUser(id: string): Promise<unknown> {
	return fetchUser(id.trim());
}

// An extra argument is supplied.
export function formatMoneyIls(amount: number): string {
	return formatMoney(amount, "ILS");
}

// The arguments are reordered.
export function formatSwapped(amount: number, currency: string): string {
	return formatMoney(currency, amount);
}

// A default value is behaviour, so the forwarding is not identity.
export function withDefault(amount: number = 0): string {
	return formatMoney(amount);
}

// Anonymous: a callback signature being reshaped has no name to remove.
export const values = ["a", "b"].map((value) => value.trim());
export const labels = ["a"].map((value) => fetchUser(value));

// More than one statement.
export function describe(id: string): string {
	const user = fetchUser(id);
	return `${user}`;
}

// Reading state is not forwarding a parameter.
export function currentTheme(): string {
	return theme.get();
}

// Anonymous, and membership on a set the function does not receive.
export const sorted = ["b", "a"].sort((a, b) => a.localeCompare(b));
