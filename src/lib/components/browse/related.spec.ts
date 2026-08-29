/**
 * The character graph and the gloss table behind it, checked against the whole shipped corpus.
 *
 * Two of these are invariants rather than examples, and they are the point of the file: every
 * character a sheet can render has to have something to say about itself, and the hand-written
 * half of that has to stay exactly as large as the gap the corpus leaves. Both rot silently as
 * the word list changes — a level gaining a word introduces new characters, a character
 * becoming a headword makes a hand-written entry redundant — and neither shows up on screen
 * until a learner opens the one word that exposes it.
 *
 * Read from disk with `readFileSync` for the reason `browse.spec.ts` gives: a static import of
 * five word lists would drag 4,308 entries into the TypeScript program.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { LEVELS, type Level, type Word } from '$lib/types';
import { CHARACTER_GLOSS } from './charGloss';
import { buildCharIndex, charCard, rowBudget } from './related';

const lists: Word[][] = LEVELS.map(
	(level) => JSON.parse(readFileSync(`src/lib/data/hsk${level}.json`, 'utf8')) as Word[]
);
const all = lists.flat();
const index = buildCharIndex(lists);

/** Every character that appears in a word of two or more characters — what the strip renders. */
const stripChars = new Set<string>();
for (const word of all) {
	const chars = [...word.hanzi];
	if (chars.length < 2) continue;
	for (const char of chars) stripChars.add(char);
}

function find(hanzi: string): Word {
	const word = all.find((entry) => entry.hanzi === hanzi);
	if (!word) throw new Error(`no shipped word ${hanzi}`);
	return word;
}

describe('buildCharIndex over the real corpus', () => {
	it('has a corpus to index', () => {
		expect(all.length).toBeGreaterThan(4000);
		expect(index.size).toBeGreaterThan(1000);
	});

	it('files a word under each of its characters, once', () => {
		// 爸爸 is two of the same character and must not appear twice under 爸.
		const cell = index.get('爸');
		expect(cell).toBeDefined();
		const ids = (cell?.words ?? []).map((word) => word.id);
		expect(new Set(ids).size).toBe(ids.length);
		expect(ids).toContain(find('爸爸').id);
	});

	it('keeps the single-character headword out of the word list and in `entry`', () => {
		const cell = index.get('安');
		expect(cell?.entry?.hanzi).toBe('安');
		expect((cell?.words ?? []).some((word) => word.hanzi === '安')).toBe(false);
	});

	it('takes the lowest level as the entry and leaves the homographs in the list', () => {
		// 好 ships three times as a one-character word: good (1), very (2), fond of (4).
		const cell = index.get('好');
		expect(cell?.entry?.level).toBe(1);
		const solo = (cell?.words ?? []).filter((word) => word.hanzi === '好');
		expect(solo.map((word) => word.level)).toEqual([2, 4]);
	});

	it('orders every character list by ascending level', () => {
		expect(index.size).toBeGreaterThan(0);
		for (const cell of index.values()) {
			let previous: Level = 1;
			for (const word of cell.words) {
				expect(word.level).toBeGreaterThanOrEqual(previous);
				previous = word.level;
			}
		}
	});

	it('lists nothing that does not contain the character', () => {
		expect(index.size).toBeGreaterThan(0);
		for (const [char, cell] of index) {
			for (const word of cell.words) expect(word.hanzi).toContain(char);
		}
	});
});

describe('charCard', () => {
	it('hands back the other words built on the character, minus the one that is open', () => {
		const open = find('安慰');
		const card = charCard(index, '安', open.id, 6);
		expect(card.gloss).toBeTruthy();
		expect(card.entry?.hanzi).toBe('安');
		expect(card.rows.length).toBe(6);
		expect(card.rows.some((word) => word.id === open.id)).toBe(false);
		expect(card.rows[0].level).toBeLessThanOrEqual(card.rows[card.rows.length - 1].level);
		expect(card.more).toBe(card.total - card.rows.length);
	});

	it('never offers the open word as its own way out', () => {
		const open = find('安');
		const card = charCard(index, '安', open.id, 8);
		expect(card.entry).toBeNull();
		expect(card.rows.some((word) => word.id === open.id)).toBe(false);
	});

	it('degrades to characters and glosses before the index has loaded', () => {
		const card = charCard(null, '慰', 'L5-0001', 6);
		expect(card.rows).toEqual([]);
		expect(card.total).toBe(0);
		expect(card.gloss).toBe(CHARACTER_GLOSS['慰']);
	});

	it('keeps a 成语 to a readable number of rows', () => {
		const word = find('酸甜苦辣');
		const budget = rowBudget([...word.hanzi].length);
		const rows = [...word.hanzi].reduce(
			(sum, char) => sum + charCard(index, char, word.id, budget).rows.length,
			0
		);
		expect(budget).toBe(3);
		expect(rows).toBeLessThanOrEqual(12);
	});
});

describe('character glosses cover every card the sheet can render', () => {
	it('gives every character in a compound something to say about itself', () => {
		const silent = [...stripChars].filter(
			(char) => index.get(char)?.entry === null && CHARACTER_GLOSS[char] === undefined
		);
		expect(silent).toEqual([]);
	});

	it('writes by hand only what the corpus cannot supply', () => {
		// A character that becomes a headword makes its hand-written line redundant, and two
		// glosses for one character is exactly how they drift apart.
		const redundant = Object.keys(CHARACTER_GLOSS).filter((char) => {
			const cell = index.get(char);
			return cell !== undefined && cell.entry !== null;
		});
		expect(redundant).toEqual([]);
	});

	it('lists no character that is not in the corpus at all', () => {
		const orphans = Object.keys(CHARACTER_GLOSS).filter((char) => !stripChars.has(char));
		expect(orphans).toEqual([]);
	});

	it('keeps every gloss short enough for one line of a card', () => {
		expect(Object.keys(CHARACTER_GLOSS).length).toBeGreaterThan(600);
		for (const [char, gloss] of Object.entries(CHARACTER_GLOSS)) {
			expect(gloss, char).not.toBe('');
			expect(gloss.length, char).toBeLessThanOrEqual(40);
		}
	});
});
