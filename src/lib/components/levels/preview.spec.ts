/**
 * `LEVEL_PREVIEW` is vocabulary copied out of the shipped JSON by hand so the landing page
 * can show real words without loading 640KB of it. That copy is exactly the kind of constant
 * that rots silently — a rebuild renumbers an id, a gloss gets rewritten, and the first screen
 * of the app starts teaching something the rest of it no longer says.
 *
 * `readFileSync` rather than `import`: a static JSON import would drag 4,308 entries into the
 * TypeScript program, which is the thing `src/lib/data/index.ts` exists to avoid.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Level, ProgressState, Word, WordProgress } from '$lib/types';
import { LEVELS } from '$lib/types';
import { LEVEL_META } from './levelMeta';
import { LEVEL_PREVIEW, PREVIEW_COUNT, toPreview, weakestIds } from './preview';

function readShipped(level: Level): Word[] {
	return JSON.parse(readFileSync(`src/lib/data/hsk${level}.json`, 'utf8')) as Word[];
}

const shipped = new Map<string, Word>();
for (const level of LEVELS) {
	for (const word of readShipped(level)) shipped.set(word.id, word);
}

describe('level card previews', () => {
	it.each([...LEVELS])('HSK %i previews three words', (level) => {
		expect(LEVEL_PREVIEW[level]).toHaveLength(3);
	});

	it('quotes the shipped word list verbatim', () => {
		for (const level of LEVELS) {
			for (const preview of LEVEL_PREVIEW[level]) {
				const word = shipped.get(preview.id);
				expect(word, `${preview.id} (${preview.hanzi}) is not a shipped word`).toBeDefined();
				expect(word?.level).toBe(level);
				expect(word?.hanzi).toBe(preview.hanzi);
				expect(word?.pinyin).toBe(preview.pinyin);
				// A gloss the word does not claim is a gloss this screen invented.
				expect(word?.meanings, `gloss for ${preview.hanzi}`).toContain(preview.gloss);
			}
		}
	});

	it('shows a different word on every card', () => {
		const ids = LEVELS.flatMap((level) => LEVEL_PREVIEW[level].map((word) => word.id));
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('keeps previews short enough for three columns on a phone', () => {
		for (const level of LEVELS) {
			for (const preview of LEVEL_PREVIEW[level]) {
				// Three 36px hanzi cells share ~93px each inside a 375px card, so a third
				// character would either overflow or force the hanzi below the scale's floor.
				expect([...preview.hanzi].length, `${preview.hanzi} is too wide`).toBeLessThanOrEqual(2);
			}
		}
	});

	/**
	 * A third of a 287px card at 1440 is ~82px, which is twelve characters of 12px gloss. The
	 * card truncates past that, and a static preview arriving with an ellipsis on it would be a
	 * self-inflicted one — `academic study` did exactly that until it was swapped out.
	 */
	it('keeps every gloss inside one line of a preview column', () => {
		for (const level of LEVELS) {
			for (const preview of LEVEL_PREVIEW[level]) {
				expect(preview.gloss.length, `${preview.hanzi}: "${preview.gloss}"`).toBeLessThanOrEqual(
					12
				);
			}
		}
	});

	it('covers every level the menu lists', () => {
		expect(Object.keys(LEVEL_PREVIEW).map(Number)).toEqual([...LEVELS]);
		expect(Object.keys(LEVEL_META).map(Number)).toEqual([...LEVELS]);
	});

	/**
	 * 八 is two strokes glossed "eight". It was a third of the Chinese on the card every
	 * first-time visitor lands on, and it taught nobody anything — the same objection that got
	 * the 一/二/三 numeral tiles deleted in loop 1.
	 */
	it('spends none of its five cards on a bare numeral', () => {
		for (const level of LEVELS) {
			for (const preview of LEVEL_PREVIEW[level]) {
				const word = shipped.get(preview.id);
				expect(word?.pos, `${preview.hanzi} is a numeral`).not.toContain('Num');
			}
		}
	});
});

function record(wordId: string, over: Partial<WordProgress> = {}): WordProgress {
	return { wordId, seen: 4, correct: 2, streak: 0, lastSeen: 900, lastMissed: 500, ...over };
}

function stateOf(...records: WordProgress[]): ProgressState {
	return {
		version: 1,
		byWord: Object.fromEntries(records.map((entry) => [entry.wordId, entry])),
		levels: {}
	};
}

describe('weakestIds', () => {
	it('is empty without a state, so a first visit loads no vocabulary', () => {
		expect(weakestIds(null, 1)).toEqual([]);
		expect(weakestIds(undefined, 1)).toEqual([]);
	});

	it('ranks the most recently missed word first', () => {
		const state = stateOf(
			record('L1-0001', { lastMissed: 100 }),
			record('L1-0002', { lastMissed: 300 }),
			record('L1-0003', { lastMissed: 200 })
		);
		expect(weakestIds(state, 1).slice(0, PREVIEW_COUNT)).toEqual(['L1-0002', 'L1-0003', 'L1-0001']);
	});

	it('breaks a tie on accuracy, worst first', () => {
		const state = stateOf(
			record('L2-0001', { lastMissed: 100, seen: 4, correct: 3 }),
			record('L2-0002', { lastMissed: 100, seen: 4, correct: 1 }),
			record('L2-0003', { lastMissed: 100, seen: 4, correct: 2 })
		);
		expect(weakestIds(state, 2).slice(0, PREVIEW_COUNT)).toEqual(['L2-0002', 'L2-0003', 'L2-0001']);
	});

	it('only counts words at the level asked for', () => {
		const state = stateOf(
			record('L1-0001'),
			record('L1-0002'),
			record('L1-0003'),
			record('L2-0001'),
			record('L2-0002')
		);
		expect(weakestIds(state, 2)).toEqual([]);
		expect(weakestIds(state, 1)).toHaveLength(PREVIEW_COUNT);
	});

	/** "You keep missing" over two misses and a word never seen is a claim the data cannot make. */
	it('gives up rather than half-fill the row', () => {
		const state = stateOf(record('L3-0001'), record('L3-0002'));
		expect(weakestIds(state, 3)).toEqual([]);
	});

	it('ignores words that have never been missed', () => {
		const state = stateOf(
			record('L4-0001', { lastMissed: 0, correct: 4 }),
			record('L4-0002', { lastMissed: 0, correct: 4 }),
			record('L4-0003', { lastMissed: 0, correct: 4 }),
			record('L4-0004', { lastMissed: 7 })
		);
		expect(weakestIds(state, 4)).toEqual([]);
	});

	it('ignores a record that was never actually answered', () => {
		const state = stateOf(
			record('L5-0001', { seen: 0, correct: 0 }),
			record('L5-0002'),
			record('L5-0003')
		);
		expect(weakestIds(state, 5)).toEqual([]);
	});

	/** Extra ids, so ids whose row no longer ships can be dropped and still fill three columns. */
	it('hands back more candidates than there are columns', () => {
		const records = Array.from({ length: 9 }, (_, i) =>
			record(`L1-01${String(i).padStart(2, '0')}`, { lastMissed: 100 + i })
		);
		expect(weakestIds(stateOf(...records), 1).length).toBeGreaterThan(PREVIEW_COUNT);
	});

	it('is stable across two reads of the same state', () => {
		const state = stateOf(record('L1-0001'), record('L1-0002'), record('L1-0003'));
		expect(weakestIds(state, 1)).toEqual(weakestIds(state, 1));
	});
});

describe('toPreview', () => {
	it('quotes the shipped row, best meaning first', () => {
		const word = shipped.get('L1-0410');
		expect(word).toBeDefined();
		expect(toPreview(word as Word)).toEqual({
			id: 'L1-0410',
			hanzi: word?.hanzi,
			pinyin: word?.pinyin,
			gloss: word?.meanings[0],
			syllables: word?.syllables
		});
	});

	it('produces the shape the card renders, tone data included', () => {
		for (const level of LEVELS) {
			for (const preview of LEVEL_PREVIEW[level]) {
				const word = shipped.get(preview.id) as Word;
				const converted = toPreview(word);
				expect(Object.keys(converted).sort()).toEqual([
					'gloss',
					'hanzi',
					'id',
					'pinyin',
					'syllables'
				]);
				expect(converted.gloss.length).toBeGreaterThan(0);
				// One syllable per character is what `<Pinyin>` needs to paint tone off.
				expect(converted.syllables).toHaveLength([...word.hanzi].length);
			}
		}
	});
});
