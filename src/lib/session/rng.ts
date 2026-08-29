/**
 * Deterministic randomness primitives.
 *
 * Every random decision the session engine makes goes through an injected `Rng`, so a
 * session is reproducible from a seed in tests and in the `?state=summary` demo route,
 * while the app just hands it `Math.random`.
 */

/** Returns a float in `[0, 1)`. `Math.random` satisfies this. */
export type Rng = () => number;

/**
 * mulberry32 — a 32-bit seeded PRNG. Tiny, fast, and good enough for shuffling a word
 * list; it is not, and does not need to be, cryptographically secure.
 */
export function mulberry32(seed: number): Rng {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Fisher–Yates. Returns a new array; the input is untouched. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
	const out = items.slice();
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		const tmp = out[i];
		out[i] = out[j];
		out[j] = tmp;
	}
	return out;
}

/** What an unweighable item is worth: exactly as likely as an ordinary one, never a decision. */
const NEUTRAL_WEIGHT = 1;

/**
 * A weight the sort can actually order by.
 *
 * `Math.max(w, MIN_VALUE)` does not catch `NaN` — `Math.max(NaN, x)` is `NaN` — and a `NaN`
 * sort key is worse than a wrong one: the comparator returns `NaN` for every pair, V8 leaves
 * the array in whatever order the insertion sort happened to leave it, and the item's *position
 * in the input* decides whether it is always drawn or never drawn. Measured before this guard,
 * over 500 draws of 5 from 20: the `NaN`-weighted item at index 0 was picked 500/500 times, and
 * the same item at index 7 or 19, 0/500.
 *
 * The two failures are not the same, so they do not get the same answer. A weight of zero or
 * less is a *computed* "as unlikely as possible", floored rather than dropped. A weight that is
 * not a number at all is a corrupt record, and the honest reading of it is "no idea" — so it
 * falls back to the reference weight of an unseen word rather than to a value that would bury
 * the word forever, which is what `rng.ts` promises when it says nothing is unreachable.
 */
function usableWeight(value: number): number {
	if (typeof value !== 'number' || Number.isNaN(value)) return NEUTRAL_WEIGHT;
	if (value === Infinity) return NEUTRAL_WEIGHT;
	return value > Number.MIN_VALUE ? value : Number.MIN_VALUE;
}

/**
 * A **complete** weighted shuffle, via the Efraimidis–Spirakis A-Res key `u ** (1 / w)`: draw
 * one uniform per item and sort by the key descending. Every prefix of the result is
 * distributed exactly as a weighted draw without replacement of that length, which is what
 * lets a caller walk the order and skip candidates it turns out not to want without biasing
 * what it takes instead.
 */
export function orderWeighted<T>(
	items: readonly T[],
	weightOf: (item: T) => number,
	rng: Rng
): T[] {
	const keyed = items.map((item) => {
		const weight = usableWeight(weightOf(item));
		const u = Math.max(rng(), Number.MIN_VALUE);
		return { item, key: Math.pow(u, 1 / weight) };
	});
	keyed.sort((a, b) => b.key - a.key);
	return keyed.map((entry) => entry.item);
}

/**
 * Weighted sampling **without replacement**: the first `k` of the weighted shuffle above.
 * "Pick 6 review words, weighted by how shaky they are", exactly.
 *
 * Weights of zero or less are floored rather than dropped, so no word is ever permanently
 * unreachable.
 */
export function sampleWeighted<T>(
	items: readonly T[],
	weightOf: (item: T) => number,
	k: number,
	rng: Rng
): T[] {
	if (k <= 0 || items.length === 0) return [];
	return orderWeighted(items, weightOf, rng).slice(0, Math.min(k, items.length));
}
