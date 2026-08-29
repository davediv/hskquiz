/**
 * The browse screen's two load-bearing pure modules, exercised against the real shipped word
 * list rather than a fixture.
 *
 * Windowing and search are the parts that only break at scale: a window that is correct for
 * twelve words can still strand a row at index 1,069, and a search index that is correct for a
 * hand-written fixture can still miss the one word a learner actually types. So HSK 5 — the
 * longest list — is read off disk and both are walked end to end over it.
 *
 * The file is read with `readFileSync` for the reason `data/vocab.spec.ts` gives: a static
 * `import './hsk5.json'` would drag thousands of entries into the TypeScript program.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Word } from '$lib/types';
import { stripTone } from '$lib/design/tone';
import { searchWords } from './search';
import { windowFor } from './virtual';

const words = JSON.parse(readFileSync('src/lib/data/hsk5.json', 'utf8')) as Word[];

/** A phone: one column of 76px rows under a 148px sticky block, 812px tall. */
const PHONE = { cols: 1, rowHeight: 76, listTop: 148, viewportHeight: 812 };

describe('windowFor over the real HSK 5 list', () => {
	it('has a list to window', () => {
		expect(words.length).toBeGreaterThan(1000);
	});

	it('renders a bounded slice at every scroll position from top to bottom', () => {
		const count = words.length;
		const totalHeight = Math.ceil(count / PHONE.cols) * PHONE.rowHeight;
		const maxScroll = PHONE.listTop + totalHeight;
		let widest = 0;

		for (let scrollTop = 0; scrollTop <= maxScroll; scrollTop += 137) {
			const win = windowFor({ count, scrollTop, ...PHONE });

			expect(win.startIndex).toBeGreaterThanOrEqual(0);
			expect(win.endIndex).toBeLessThanOrEqual(count);
			expect(win.endIndex).toBeGreaterThan(win.startIndex);
			expect(win.totalHeight).toBe(totalHeight);
			// The rendered block must sit inside the spacer that is holding the scrollbar open.
			expect(win.offsetTop).toBe(win.startIndex * PHONE.rowHeight);
			expect(win.offsetTop + (win.endIndex - win.startIndex) * PHONE.rowHeight).toBeLessThanOrEqual(
				win.totalHeight
			);

			widest = Math.max(widest, win.endIndex - win.startIndex);
		}

		// Windowing is only worth its complexity if the DOM stays small: ~11 screens of rows
		// would be 1,070 buttons.
		expect(widest).toBeLessThan(30);
	});

	it('covers every word exactly once as the page scrolls past it', () => {
		const count = words.length;
		const seen = new Set<number>();

		for (let scrollTop = 0; scrollTop <= PHONE.listTop + count * PHONE.rowHeight; scrollTop += 76) {
			const win = windowFor({ count, scrollTop, ...PHONE });
			for (let i = win.startIndex; i < win.endIndex; i++) seen.add(i);
		}

		expect(seen.size).toBe(count);
		// Both ends specifically: the first word and the last are the two that get stranded.
		expect(seen.has(0)).toBe(true);
		expect(seen.has(count - 1)).toBe(true);
	});

	it('keeps a row fully on screen once it is in the window', () => {
		const count = words.length;
		// Somewhere deep in the list, where a rounding error would have accumulated.
		const scrollTop = PHONE.listTop + 800 * PHONE.rowHeight + 31;
		const win = windowFor({ count, scrollTop, ...PHONE });
		const viewTop = scrollTop - PHONE.listTop;
		const viewBottom = viewTop + PHONE.viewportHeight;

		// Everything visible is rendered.
		expect(win.startIndex * PHONE.rowHeight).toBeLessThanOrEqual(viewTop);
		expect(win.endIndex * PHONE.rowHeight).toBeGreaterThanOrEqual(viewBottom);
	});

	it('lays a two-column grid out on whole rows', () => {
		const win = windowFor({ count: words.length, scrollTop: 9000, ...PHONE, cols: 2 });
		expect(win.startIndex % 2).toBe(0);
		expect(win.rowCount).toBe(Math.ceil(words.length / 2));
	});

	it('reaches further in the direction a fling is travelling, then lets go', () => {
		const still = windowFor({ count: words.length, scrollTop: 20000, ...PHONE });
		const flung = windowFor({ count: words.length, scrollTop: 20000, ...PHONE, travel: 2400 });

		// A frame that moved 2,400px must already hold the rows it is about to land on.
		expect(flung.endIndex - still.endIndex).toBeGreaterThanOrEqual(12);
		expect(flung.startIndex).toBe(still.startIndex);

		// ...and only in the direction of travel.
		const up = windowFor({ count: words.length, scrollTop: 20000, ...PHONE, travel: -2400 });
		expect(up.startIndex).toBeLessThan(still.startIndex);
		expect(up.endIndex).toBe(still.endIndex);

		// The reach is capped, so a fling cannot put the whole level in the DOM.
		const absurd = windowFor({ count: words.length, scrollTop: 20000, ...PHONE, travel: 9e5 });
		expect(absurd.endIndex - absurd.startIndex).toBeLessThan(60);
	});

	it('survives an empty list and an unmeasured row height', () => {
		expect(windowFor({ count: 0, scrollTop: 0, ...PHONE })).toEqual({
			startIndex: 0,
			endIndex: 0,
			offsetTop: 0,
			totalHeight: 0,
			rowCount: 0
		});
		const unmeasured = windowFor({ count: words.length, scrollTop: 0, ...PHONE, rowHeight: 0 });
		expect(unmeasured.endIndex).toBeGreaterThan(0);
	});
});

describe('searchWords over the real HSK 5 list', () => {
	function ids(query: string): string[] {
		return searchWords(5, words, query).map((word) => word.hanzi);
	}

	it('returns the list itself, untouched, for an empty query', () => {
		expect(searchWords(5, words, '   ')).toBe(words);
	});

	it('finds a tone-marked word from tone-less pinyin', () => {
		// The whole point: nobody types hǎo.
		expect(ids('haoyun')).toContain('好运');
		expect(ids('hao')).toContain('好运');
	});

	it('ranks a syllable-aligned pinyin hit above a mid-syllable one', () => {
		const hits = ids('hao');
		expect(hits.indexOf('好运')).toBeLessThan(hits.indexOf('称号'));
	});

	it('never matches across a syllable seam', () => {
		// 超越 is `chao|yue`: the letters h-a-o do occur in it, spanning the end of one syllable
		// and the start of the next. A substring search puts it above 称号, which is the bug
		// this index exists to make impossible.
		const hits = ids('hao');
		expect(hits).not.toContain('超越');
		expect(hits).not.toContain('稍微');
		expect(hits).toContain('称号');
		expect(hits).toContain('口号');
		// Every survivor really does carry the syllable.
		for (const word of searchWords(5, words, 'hao')) {
			expect(word.syllables.some((syllable) => /^h[aāáǎà]o$/u.test(syllable.py))).toBe(true);
		}
	});

	it('does not answer a two-letter pinyin query with half the level', () => {
		// `bàifǎng`, `bǎn`, `bànyǎn` and `bàng` all contain the letters a-n; none of them is
		// what a learner reaching for 安 typed. Only syllables that *begin* with `an` count.
		const hits = searchWords(5, words, 'an');
		expect(hits.length).toBeLessThan(words.length * 0.02);
		for (const word of hits) {
			const folded = word.syllables.map((syllable) => stripTone(syllable.py).toLowerCase());
			expect(folded.some((syllable) => syllable.startsWith('an'))).toBe(true);
		}
	});

	it('does not let the articles in a gloss answer an English query', () => {
		// Meanings are learner copy — "an editor", "a fund of money" — so the words they are
		// built from appear in hundreds of entries and are never what was searched for.
		expect(ids('an')).not.toContain('编辑');
		expect(ids('to')).not.toContain('丢');
	});

	it('finds every word in the level by its own tone-less pinyin', () => {
		// The one property that must hold for all 1,070: whatever the official list prints,
		// typing it back without tone marks returns the word.
		for (const word of words) {
			const typed = word.syllables
				.map((syllable) => stripTone(syllable.py).toLowerCase())
				.join('')
				.replace(/[üv]/gu, 'u');
			expect(searchWords(5, words, typed)).toContain(word);
		}
	});

	it('finds a word by hanzi and by English', () => {
		expect(ids('安慰')[0]).toBe('安慰');
		expect(ids('comfort')).toContain('安慰');
	});

	it('returns nothing for a query that matches nothing', () => {
		expect(searchWords(5, words, 'zzzq')).toHaveLength(0);
	});

	it('never invents a result', () => {
		const hanzi = new Set(words.map((word) => word.hanzi));
		for (const hit of searchWords(5, words, 'shi')) expect(hanzi.has(hit.hanzi)).toBe(true);
	});
});
