import { describe, expect, it } from 'vitest';
import { mulberry32, orderWeighted, sampleWeighted, shuffle } from './rng';

const ITEMS = Array.from({ length: 20 }, (_, i) => i);

describe('sampleWeighted', () => {
	it('returns exactly k items, all distinct', () => {
		const out = sampleWeighted(ITEMS, () => 1, 5, mulberry32(3));
		expect(out).toHaveLength(5);
		expect(new Set(out).size).toBe(5);
	});

	it('never returns more than it was given', () => {
		expect(sampleWeighted(ITEMS, () => 1, 999, mulberry32(3))).toHaveLength(ITEMS.length);
		expect(sampleWeighted(ITEMS, () => 1, 0, mulberry32(3))).toHaveLength(0);
		expect(sampleWeighted([], () => 1, 5, mulberry32(3))).toHaveLength(0);
	});

	it('draws heavy items far more often than light ones', () => {
		let heavy = 0;
		for (let seed = 0; seed < 400; seed++) {
			if (sampleWeighted(ITEMS, (i) => (i === 7 ? 50 : 1), 3, mulberry32(seed)).includes(7)) {
				heavy++;
			}
		}
		// 3 of 20 uniformly would be ~60 of 400.
		expect(heavy).toBeGreaterThan(250);
	});

	it('spreads a uniform draw evenly across the list', () => {
		const counts = new Array(ITEMS.length).fill(0);
		for (let seed = 0; seed < 2000; seed++) {
			for (const i of sampleWeighted(ITEMS, () => 1, 5, mulberry32(seed))) counts[i]++;
		}
		// 2000 draws of 5 from 20 is 500 apiece.
		expect(Math.min(...counts)).toBeGreaterThan(400);
		expect(Math.max(...counts)).toBeLessThan(600);
	});

	/**
	 * The bug: `Math.max(w, Number.MIN_VALUE)` does not catch `NaN`, so the A-Res key came out
	 * `NaN`, the comparator returned `NaN` for every pair, and V8 left the array in whatever
	 * order it started in. Measured before the fix, 500 draws of 5 from 20: the `NaN`-weighted
	 * item at index 0 was picked 500/500 and the same item at index 7 or 19, 0/500 — so where a
	 * word sat in the array decided whether it was always drawn or never drawn.
	 */
	it('does not let one unweighable item decide the draw from its position in the list', () => {
		for (const at of [0, 7, 19]) {
			let picked = 0;
			for (let seed = 0; seed < 500; seed++) {
				const draw = sampleWeighted(ITEMS, (i) => (i === at ? Number.NaN : 1), 5, mulberry32(seed));
				if (draw.includes(at)) picked++;
			}
			// 5 of 20 is 125 of 500, wherever in the array it happens to sit.
			expect(picked).toBeGreaterThan(60);
			expect(picked).toBeLessThan(190);
		}
	});

	it('still floors a computed zero rather than dropping the item', () => {
		const out = sampleWeighted([1, 2], (i) => (i === 1 ? 0 : 5), 2, mulberry32(1));
		expect(out).toHaveLength(2);
	});
});

describe('orderWeighted', () => {
	it('returns every item, once', () => {
		const out = orderWeighted(ITEMS, () => 1, mulberry32(9));
		expect(out).toHaveLength(ITEMS.length);
		expect(new Set(out).size).toBe(ITEMS.length);
	});

	it('agrees with sampleWeighted on its own prefix', () => {
		const full = orderWeighted(ITEMS, (i) => i + 1, mulberry32(12));
		const five = sampleWeighted(ITEMS, (i) => i + 1, 5, mulberry32(12));
		expect(full.slice(0, 5)).toEqual(five);
	});
});

describe('shuffle', () => {
	it('leaves the input untouched and keeps every item', () => {
		const input = [1, 2, 3, 4, 5];
		const out = shuffle(input, mulberry32(2));
		expect(input).toEqual([1, 2, 3, 4, 5]);
		expect([...out].sort((a, b) => a - b)).toEqual(input);
	});
});
