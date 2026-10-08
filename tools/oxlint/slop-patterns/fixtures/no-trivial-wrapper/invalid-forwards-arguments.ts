declare function formatMoney(amount: number, currency?: string): string;
declare const CATEGORIES: Set<string>;

// A function declaration that only calls another function.
export function formatCurrency(amount: number, currency?: string): string {
	return formatMoney(amount, currency);
}

// The same, as an arrow bound to a name.
export const matchCategory = (param: string): boolean => CATEGORIES.has(param);

// An object whose property reshapes a setter into a uniform interface.
export function setValueForStyle(store: { setStyle(v: string): void }) {
	return { setValue: (v: string) => store.setStyle(v) };
}

// `async`/`await` adds nothing to the forwarding.
export async function loadUser(id: string): Promise<unknown> {
	return await fetchUser(id);
}
declare function fetchUser(id: string): Promise<unknown>;

// A factory that only forwards to a constructor.
export const createAuctionWS = (url: string) => new AuctionWS(url);
declare class AuctionWS {
	constructor(url: string);
}

// The result is discarded, which is still delegation.
export function logIt(message: string): void {
	console.log(message);
}
