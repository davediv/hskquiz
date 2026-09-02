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
import {
	fitPreview,
	LEVEL_PREVIEW,
	PREVIEW_COUNT,
	PREVIEW_GAP,
	previewWidth,
	toPreview,
	type PreviewWord,
	weakestIds
} from './preview';

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

	/**
	 * Each preview word is one full-width entry now, so what has to fit is one word's own first
	 * line — its characters, the gap, and its pinyin — against the narrowest card this layout
	 * builds: 246px, at 320px viewport width. The fifteen static words are the ones a
	 * first-time visitor meets on five cards at once, so none of them may be the word that
	 * pushes its pinyin onto a second line.
	 */
	it('sets every static word on one line at 320px', () => {
		for (const level of LEVELS) {
			for (const preview of LEVEL_PREVIEW[level]) {
				expect(previewWidth(preview), `${preview.hanzi} ${preview.pinyin}`).toBeLessThanOrEqual(
					246
				);
			}
		}
	});

	/**
	 * Each gloss belongs to one word and sits on that word's own entry — beside its pinyin
	 * where it fits, on a line of its own directly beneath its characters where it does not.
	 * Both readings are correct and neither can ever cut, so this is not a safety rule: it is
	 * what keeps five untouched cards the same height. 12px type sets ~6.1px a character, so a
	 * gloss stays on the first line while `previewWidth + gap + gloss` clears the 246px card,
	 * and every one of the fifteen static ones does.
	 *
	 * A learner's own weak words are held to no such rule — `measure word: general purpose` is
	 * 29 characters and takes a second line at 320px, whole — but the cards nobody has touched
	 * yet must all read alike.
	 */
	it('keeps every static gloss beside its own word at 320px', () => {
		for (const level of LEVELS) {
			for (const preview of LEVEL_PREVIEW[level]) {
				const line = previewWidth(preview) + PREVIEW_GAP + preview.gloss.length * 6.1;
				expect(line, `${preview.hanzi} "${preview.gloss}"`).toBeLessThanOrEqual(246);
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

/**
 * The entry a learner's own words land in.
 *
 * Loop 3 fed arbitrary words into a layout built for three short ones and cut what did not
 * fit — `dàxuéshē…`, `have no cho…`. Nothing is cut now, and since loop 6 nothing is even
 * three-abreast: each word is its own full-width entry, so the only width question is whether
 * ONE word's characters and pinyin share a line.
 *
 * Widths are the ones the app measures: 36.55px per hanzi at `--text-hanzi-md`, 8px of gap,
 * and a pinyin ceiling of 8.8px per character at `--text-pinyin-sm`. The budgets below are
 * real entry widths — 287px at 1440 (three cards abreast), 301px at 375, 246px at 320.
 */
describe('fitPreview', () => {
	const word = (hanzi: string, pinyin: string): PreviewWord => ({
		id: hanzi,
		hanzi,
		pinyin,
		gloss: 'x'
	});

	// The three the loop-3 verdict caught being clipped, at HSK 1 and HSK 3.
	const daxuesheng = word('大学生', 'dàxuéshēng');
	const didian = word('地点', 'dìdiǎn');
	const dian = word('电', 'diàn');
	const beihou = word('背后', 'bèihòu');
	const budebu = word('不得不', 'bùdébù');
	const chengshu = word('成熟', 'chéngshú');
	// The widest first line in the shipped list: four characters and fifteen of pinyin.
	const suantiankula = word('酸甜苦辣', 'suān-tián-kǔ-là');

	it('charges a word its characters, its gap and its pinyin', () => {
		expect(previewWidth(dian)).toBeCloseTo(36.55 + PREVIEW_GAP + 4 * 8.8, 2);
		expect(previewWidth(didian)).toBeCloseTo(2 * 36.55 + PREVIEW_GAP + 6 * 8.8, 2);
		expect(previewWidth(daxuesheng)).toBeCloseTo(3 * 36.55 + PREVIEW_GAP + 10 * 8.8, 2);
		// 谁 is one character and nine of pinyin, so the pinyin is the bigger half.
		expect(previewWidth(word('谁', 'shéi/shuí'))).toBeCloseTo(36.55 + PREVIEW_GAP + 9 * 8.8, 2);
	});

	/**
	 * The finding this shape exists to end: 大学生 / 教学楼 / 图书馆 needed 346px side by side
	 * against a 301px card, so loop 5 dropped the list to two words and left the third of the
	 * card empty. Stacked they are 205.65px each and all three fit at every width this layout
	 * builds, 320px included.
	 */
	it('keeps three long words that could never have shared a row', () => {
		const jiaoxuelou = word('教学楼', 'jiàoxuélóu');
		const tushuguan = word('图书馆', 'túshūguǎn');
		const three = [daxuesheng, jiaoxuelou, tushuguan];
		expect(fitPreview(three, 246)).toEqual(three);
		expect(fitPreview(three, 287)).toEqual(three);
		expect(fitPreview([daxuesheng, didian, dian], 287)).toEqual([daxuesheng, didian, dian]);
		expect(fitPreview([beihou, budebu, chengshu], 246)).toEqual([beihou, budebu, chengshu]);
	});

	it('skips the one word that will not set on a line and takes the next', () => {
		expect(fitPreview([suantiankula, daxuesheng, didian, dian], 246)).toEqual([
			daxuesheng,
			didian,
			dian
		]);
		// 286.2px fits a 301px card, so at 375 the same word is kept.
		expect(fitPreview([suantiankula, daxuesheng, didian, dian], 301)).toEqual([
			suantiankula,
			daxuesheng,
			didian
		]);
	});

	it('gives up rather than short-changing the list, and the card shows the worst three anyway', () => {
		expect(fitPreview([suantiankula, daxuesheng], 246)).toBeNull();
		expect(fitPreview([suantiankula, suantiankula, suantiankula], 246)).toBeNull();
		expect(fitPreview([daxuesheng, didian, dian], 0)).toBeNull();
	});

	it('never returns a list the card cannot fill', () => {
		const row = fitPreview([daxuesheng, didian, dian], 301);
		expect(row).toHaveLength(PREVIEW_COUNT);
	});
});
