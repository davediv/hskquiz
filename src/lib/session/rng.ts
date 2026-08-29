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

/**
 * Weighted sampling **without replacement**, via the Efraimidis–Spirakis A-Res key
 * `u ** (1 / w)`: draw one uniform per item, then keep the `k` largest keys. The
 * probability of a given ordering matches repeated weighted draws without replacement,
 * which is exactly what "pick 6 review words, weighted by how shaky they are" means.
 *
 * Weights of zero or less are floored rather than dropped, so no word is ever
 * permanently unreachable.
 */
export function sampleWeighted<T>(
	items: readonly T[],
	weightOf: (item: T) => number,
	k: number,
	rng: Rng
): T[] {
	if (k <= 0 || items.length === 0) return [];
	const keyed = items.map((item) => {
		const weight = Math.max(weightOf(item), Number.MIN_VALUE);
		const u = Math.max(rng(), Number.MIN_VALUE);
		return { item, key: Math.pow(u, 1 / weight) };
	});
	keyed.sort((a, b) => b.key - a.key);
	return keyed.slice(0, Math.min(k, keyed.length)).map((entry) => entry.item);
}
