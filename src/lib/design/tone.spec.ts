/**
 * The tone layer's contract, checked against the vocabulary the app actually ships.
 *
 * The point of these tests is that tone colour is DATA, not a render-time hunch. Two things
 * have to hold for that claim to be true:
 *
 *   1. Every shipped word carries one syllable per character, each with a tone — so `<Hanzi>`
 *      and `<Pinyin>` can paint every glyph and every syllable of all 4,308 words.
 *   2. `segmentPinyin`, the path a caller lands on when it holds only the pinyin string,
 *      reproduces that build-time syllabification rather than approximating it.
 *
 * Loop 1 shipped a `toneOf` that refused to split unspaced compounds, and 71% of the corpus
 * rendered flat grey as a result. The counts below are the regression guard for that.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Level, Syllable, Word } from '$lib/types';
import { LEVEL_SIZES, LEVELS } from '$lib/types';
import { resolveSyllables, segmentPinyin, splitPinyin, stripTone, toneColor, toneOf } from './tone';

function level(n: Level): Word[] {
	return JSON.parse(readFileSync(`${process.cwd()}/src/lib/data/hsk${n}.json`, 'utf8')) as Word[];
}

const CORPUS: Word[] = LEVELS.flatMap(level);

/**
 * The two rows whose printed pinyin holds two readings of one character
 * (`谁 shéi/shuí`, `熟 shú/shóu`). Both readings segment and colour correctly; there are
 * simply two of them where the build recorded one, so they cannot match 1:1.
 */
const ALTERNATE_READINGS = CORPUS.filter((word) => word.pinyin.includes('/'));

describe('shipped tone data', () => {
	it('covers every character of every word', () => {
		const broken = CORPUS.filter((word) => word.syllables.length !== [...word.hanzi].length);
		expect(broken.map((word) => word.hanzi)).toEqual([]);
	});

	it('never exceeds the official size of a level', () => {
		// Deliberately one-sided: the shipped lists are still a few words short of
		// `LEVEL_SIZES` (that is the vocabulary layer's gap, not the design system's), and this
		// test must not go red on their behalf. What the design system needs is that no level
		// invents words it then has to colour.
		const counts = LEVELS.map((n) => CORPUS.filter((word) => word.level === n).length);
		expect(counts.every((count, i) => count <= LEVEL_SIZES[LEVELS[i]])).toBe(true);
	});

	it('gives every syllable a tone in range', () => {
		const tones = new Set(CORPUS.flatMap((word) => word.syllables.map((s) => s.tone)));
		expect([...tones].sort()).toEqual([0, 1, 2, 3, 4]);
	});

	it('paints every syllable — the loop-1 renderer left 71% of the corpus flat grey', () => {
		const palette = new Set(([0, 1, 2, 3, 4] as const).map(toneColor));
		const painted = CORPUS.flatMap((word) => word.syllables).filter((s) =>
			palette.has(toneColor(s.tone))
		);
		expect(painted.length).toBe(CORPUS.reduce((n, word) => n + word.syllables.length, 0));
		expect(painted.length).toBeGreaterThan(7000);
	});
});

describe('segmentPinyin', () => {
	it('reproduces the build-time syllabification of every single-reading word', () => {
		const wrong = CORPUS.filter((word) => {
			if (word.pinyin.includes('/')) return false;
			const got = segmentPinyin(word.pinyin);
			return (
				got.length !== word.syllables.length ||
				got.some((s, i) => s.py !== word.syllables[i].py || s.tone !== word.syllables[i].tone)
			);
		});
		expect(wrong.map((word) => `${word.hanzi} ${word.pinyin}`)).toEqual([]);
	});

	it('renders both readings of the alternate-reading rows', () => {
		expect(ALTERNATE_READINGS.map((word) => word.hanzi)).toEqual(['谁', '熟']);
		expect(segmentPinyin('shéi/shuí')).toEqual([
			{ py: 'shéi', tone: 2 },
			{ py: 'shuí', tone: 2 }
		]);
	});

	it('splits an unspaced compound — the case loop-1 refused', () => {
		expect(segmentPinyin('àihào')).toEqual([
			{ py: 'ài', tone: 4 },
			{ py: 'hào', tone: 4 }
		]);
		expect(segmentPinyin('báitiān')).toEqual([
			{ py: 'bái', tone: 2 },
			{ py: 'tiān', tone: 1 }
		]);
	});

	it('reads an unmarked syllable as the neutral tone, not as a failure', () => {
		expect(segmentPinyin('bàba')).toEqual([
			{ py: 'bà', tone: 4 },
			{ py: 'ba', tone: 0 }
		]);
	});

	it('cuts where pinyin orthography says to, not where greed says to', () => {
		// No apostrophe, so the second syllable cannot open on a bare vowel: fǎn·gǎn, not fǎng·ǎn.
		expect(splitPinyin('fǎngǎn')).toEqual(['fǎn', 'gǎn']);
		// With the apostrophe the source has said the opposite, and we follow it.
		expect(splitPinyin("fāng'àn")).toEqual(['fāng', 'àn']);
		// A standalone final is a legal syllable but a bad cut.
		expect(splitPinyin('nán')).toEqual(['nán']);
	});

	it('handles the separators the official list actually prints', () => {
		expect(splitPinyin('bàn nián')).toEqual(['bàn', 'nián']);
		expect(splitPinyin('wǔyán-liùsè')).toEqual(['wǔ', 'yán', 'liù', 'sè']);
	});

	it('keeps text it cannot parse rather than dropping it', () => {
		expect(segmentPinyin('xyz')).toEqual([{ py: 'xyz', tone: 0 }]);
		expect(segmentPinyin('')).toEqual([]);
	});
});

describe('toneOf', () => {
	it('reads the mark, and treats no mark as neutral', () => {
		expect([toneOf('bā'), toneOf('bá'), toneOf('bǎ'), toneOf('bà'), toneOf('ba')]).toEqual([
			1, 2, 3, 4, 0
		]);
	});

	it('covers the ü row, which is the one Latin UI faces drop', () => {
		expect([toneOf('nǖ'), toneOf('nǘ'), toneOf('nǚ'), toneOf('nǜ')]).toEqual([1, 2, 3, 4]);
	});
});

describe('stripTone', () => {
	it('leaves the letters and loses only the marks', () => {
		expect(stripTone('zhōngguó')).toBe('zhongguo');
		expect(stripTone('nǚ')).toBe('nü');
	});
});

describe('toneColor', () => {
	it('indexes the palette by the data value, with no off-by-one', () => {
		expect(([0, 1, 2, 3, 4] as const).map(toneColor)).toEqual([
			'var(--color-tone-0)',
			'var(--color-tone-1)',
			'var(--color-tone-2)',
			'var(--color-tone-3)',
			'var(--color-tone-4)'
		]);
	});
});

describe('resolveSyllables', () => {
	it('prefers the build data over the string', () => {
		const built: Syllable[] = [{ py: 'zhōng', tone: 1 }];
		expect(resolveSyllables(built, 'anything at all')).toEqual(built);
	});

	it('falls back to the string when there is no data', () => {
		expect(resolveSyllables(undefined, 'bàba')).toEqual(segmentPinyin('bàba'));
		expect(resolveSyllables([], 'bàba')).toEqual(segmentPinyin('bàba'));
	});
});
