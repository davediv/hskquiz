/**
 * The chip counts, against the real HSK 5 list.
 *
 * There is one thing here worth a test and it is not the bucketing arithmetic: it is that a
 * chip is a promise. `Shaky 50` has to mean fifty rows appear when you tap it, and before this
 * loop it did not — `statusMap` filtered stored records on the `L5-` prefix alone, so ids for
 * words the level no longer contains were counted into the chip and then filtered out of the
 * list. The screen said `Shaky 50` on the chip, `0 shaky` in the header and `No shaky words in
 * HSK 5 yet` in the body, in one frame. Ids are position-derived, so any change to a level's
 * shape can reproduce it on a learner's real store; only checking against the shipped list
 * closes it for good.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { ProgressState, Word, WordProgress } from '$lib/types';
import {
	hasChips,
	statusCounts,
	statusFor,
	statusMap,
	statusOf,
	visibleFilters,
	type StatusCounts
} from './status';

const words = JSON.parse(readFileSync('src/lib/data/hsk5.json', 'utf8')) as Word[];

const NOW = Date.UTC(2026, 0, 1);

function record(wordId: string, over: Partial<WordProgress> = {}): WordProgress {
	return {
		wordId,
		seen: 1,
		correct: 0,
		streak: 0,
		lastSeen: NOW,
		lastMissed: NOW,
		...over
	};
}

function store(...records: WordProgress[]): ProgressState {
	const byWord: Record<string, WordProgress> = {};
	for (const entry of records) byWord[entry.wordId] = entry;
	return { version: 1, byWord, levels: {} };
}

describe('statusOf', () => {
	it('reads a record the way the level screen does', () => {
		expect(statusOf(undefined)).toBe('new');
		// Never met at all — no record was ever written for this word.
		expect(statusOf(record('L5-0001', { seen: 0, lastSeen: 0, lastMissed: 0 }))).toBe('new');
		// Met by a teach card and never answered. `seen` counts answers, so this used to read as
		// `new`, and ten words just taught showed as "500 New" on the browse chips.
		expect(statusOf(record('L5-0001', { seen: 0, lastMissed: 0 }))).toBe('seen');
		expect(statusOf(record('L5-0001'))).toBe('shaky');
		expect(statusOf(record('L5-0001', { correct: 1, streak: 1, lastMissed: 0 }))).toBe('learning');
		expect(statusOf(record('L5-0001', { seen: 9, correct: 9, streak: 9, lastMissed: 0 }))).toBe(
			'mastered'
		);
	});
});

describe('statusMap against the shipped list', () => {
	it('has a list to check against, with the ids the store would hold', () => {
		expect(words.length).toBeGreaterThan(1000);
		expect(words[0].id).toMatch(/^L5-\d{4}$/);
	});

	it('buckets a record for a word that is actually in the level', () => {
		const first = words[0];
		const map = statusMap(store(record(first.id)), 5, words);
		expect(map.get(first.id)).toBe('shaky');
		expect(statusFor(map, first.id)).toBe('shaky');
	});

	it('ignores a record whose id is not in this level at all', () => {
		// `L5-9001` is well past the end of the list; a real store reaches this state when a
		// level changes shape under position-derived ids, not only when it is corrupt.
		const map = statusMap(store(record('L5-9001'), record('L5-9002')), 5, words);
		expect(map.size).toBe(0);
		expect(statusCounts(map, words.length).shaky).toBe(0);
	});

	it('ignores another level entirely', () => {
		const map = statusMap(store(record('L1-0001')), 5, words);
		expect(map.size).toBe(0);
	});

	it('makes the chip count and the filtered list agree, which is the whole point', () => {
		const real = words.slice(0, 14).map((word) => record(word.id));
		const phantom = Array.from({ length: 50 }, (_, i) => record(`L5-${9000 + i}`));
		const map = statusMap(store(...real, ...phantom), 5, words);

		const counts = statusCounts(map, words.length);
		const rows = words.filter((word) => statusFor(map, word.id) === 'shaky');

		expect(counts.shaky).toBe(14);
		expect(rows.length).toBe(counts.shaky);
		expect(counts.new).toBe(words.length - 14);
		expect(counts.all).toBe(words.length);
	});

	it('costs nothing when there is no store yet', () => {
		expect(statusMap(null, 5, words).size).toBe(0);
		expect(statusMap(undefined, 5, words).size).toBe(0);
	});
});

/**
 * WHICH CHIPS EXIST, WHICH IS A LAYOUT FACT AS MUCH AS A LOGIC ONE.
 *
 * Six two-line chips measured 371px of scroll width against a 320px phone and put "40
 * Mastered" — the number a returning learner opens the screen for — 51px past the right edge,
 * while the strip's own header comment asserted that five fitted "with room to spare". The
 * comment was written when there were five and was never re-measured when a sixth arrived. So
 * the count of chips is asserted here, where it fails a run rather than reassuring a reader.
 */
describe('visibleFilters', () => {
	const counts = (over: Partial<StatusCounts> = {}): StatusCounts => ({
		all: 500,
		new: 500,
		seen: 0,
		learning: 0,
		shaky: 0,
		mastered: 0,
		...over
	});

	it('never offers an `all` chip — the strip has five slots at 320px and it was the widest', () => {
		const every = visibleFilters(counts({ seen: 1, learning: 1, shaky: 1, mastered: 1 }), 'all');
		expect(every).toEqual(['new', 'seen', 'learning', 'shaky', 'mastered']);
		expect(every.map(String)).not.toContain('all');
		expect(every.length).toBeLessThanOrEqual(5);
	});

	it('offers one chip on a level nobody has touched, so the row does not render', () => {
		const fresh = visibleFilters(counts(), 'all');
		expect(fresh).toEqual(['new']);
		expect(hasChips(fresh)).toBe(false);
	});

	it('renders the row as soon as a second bucket exists', () => {
		const started = visibleFilters(counts({ new: 499, learning: 1 }), 'all');
		expect(started).toEqual(['new', 'learning']);
		expect(hasChips(started)).toBe(true);
	});

	it('keeps the selected chip even once its bucket has emptied under it', () => {
		// The last shaky word was answered right: the bucket is 0, but a chip you are standing
		// on may not vanish — the empty state has to be able to name what it filtered by.
		expect(visibleFilters(counts({ new: 499, mastered: 1 }), 'shaky')).toEqual([
			'new',
			'shaky',
			'mastered'
		]);
	});

	it('orders chips the way progress runs, not the way the buckets filled', () => {
		expect(visibleFilters(counts({ mastered: 3, seen: 2 }), 'all')).toEqual([
			'new',
			'seen',
			'mastered'
		]);
	});
});
