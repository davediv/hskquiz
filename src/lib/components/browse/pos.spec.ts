/**
 * POS pairing: the chip next to a gloss has to describe that gloss, not `pos[0]`.
 *
 * The 16 cards loop 6 listed are the regression — each one printed a label that contradicted
 * the meaning beside it because the row read `posPrimary(word.pos)` and the sheet joined
 * every code into one banner. `sensesOf` is the thing that has to get them right, whether
 * or not the corpus has shipped `Word.senses` yet.
 */
import { describe, expect, it } from 'vitest';
import type { Sense, Syllable, Word } from '$lib/types';
import { groupSenses, posAbbrev, sensesOf } from './pos';

const SYL: Syllable = { py: 'x', tone: 1 };

function word(over: { pos: string[]; meanings: string[]; senses?: Sense[]; hanzi?: string }): Word {
	return {
		id: 'L0-0000',
		hanzi: over.hanzi ?? 'x',
		pinyin: 'x',
		syllables: [SYL],
		meanings: over.meanings,
		pos: over.pos,
		level: 1,
		...(over.senses ? { senses: over.senses } : {})
	};
}

function labels(entry: Word): { pos: string; gloss: string }[] {
	return sensesOf(entry).map((sense) => ({
		pos: sense.pos ? posAbbrev(sense.pos) : '',
		gloss: sense.gloss
	}));
}

function chip(entry: Word): string {
	return labels(entry)[0]?.pos ?? '';
}

describe('sensesOf prefers shipped pairing', () => {
	it('uses word.senses when the corpus has it, even if pos[] would pair differently', () => {
		const entry = word({
			pos: ['Adj', 'V'],
			meanings: ['to shock', 'to astonish'],
			senses: [
				{ pos: 'Adj', gloss: 'shocked, astonished' },
				{ pos: 'V', gloss: 'to shock, to astonish' }
			]
		});
		expect(labels(entry)).toEqual([
			{ pos: 'adj.', gloss: 'shocked, astonished' },
			{ pos: 'v.', gloss: 'to shock, to astonish' }
		]);
		expect(chip(entry)).toBe('adj.');
	});

	it('falls back to pos[] + meanings[] when senses is missing or empty', () => {
		expect(labels(word({ pos: ['V'], meanings: ['to love'] }))).toEqual([
			{ pos: 'v.', gloss: 'to love' }
		]);
		expect(labels(word({ pos: ['V'], meanings: ['to love'], senses: [] }))).toEqual([
			{ pos: 'v.', gloss: 'to love' }
		]);
	});
});

describe('best-effort pairing for the 16 cards that contradicted themselves', () => {
	it('记录 — verb gloss under an N-first card', () => {
		const entry = word({
			hanzi: '记录',
			pos: ['N', 'V'],
			meanings: ['to write down', 'a written record']
		});
		expect(labels(entry)).toEqual([
			{ pos: 'v.', gloss: 'to write down' },
			{ pos: 'n.', gloss: 'a written record' }
		]);
		expect(chip(entry)).toBe('v.');
	});

	it('震惊 — both shipped glosses are verbs; Adj is not printed over them', () => {
		const entry = word({
			hanzi: '震惊',
			pos: ['Adj', 'V'],
			meanings: ['to shock', 'to astonish']
		});
		expect(labels(entry)).toEqual([
			{ pos: 'v.', gloss: 'to shock' },
			{ pos: 'v.', gloss: 'to astonish' }
		]);
		expect(chip(entry)).toBe('v.');
	});

	it('面 — two nouns then the measure word, not M on "side"', () => {
		const entry = word({
			hanzi: '面',
			pos: ['N', 'M'],
			meanings: ['side', 'face', 'measure word: flat things']
		});
		expect(labels(entry)).toEqual([
			{ pos: 'n.', gloss: 'side' },
			{ pos: 'n.', gloss: 'face' },
			{ pos: 'mw.', gloss: 'measure word: flat things' }
		]);
		expect(chip(entry)).toBe('n.');
	});

	it('the other fourteen, chip versus first gloss', () => {
		const rows: [string, string[], string[], string][] = [
			['明白', ['Adj', 'V'], ['to understand clearly', 'clear and obvious'], 'v.'],
			['感动', ['Adj', 'V'], ['to be moved', 'touching'], 'v.'],
			['好像', ['Adv', 'V'], ['to seem like', 'as if'], 'v.'],
			['节', ['N', 'M'], ['measure word: class periods', 'a section or joint'], 'mw.'],
			['瓶', ['N', 'M'], ['measure word: bottles'], 'mw.'],
			['午睡', ['N', 'V'], ['to take a nap in the afternoon'], 'v.'],
			['小心', ['Adj', 'V'], ['to be careful', 'to take care'], 'v.'],
			['所', ['N', 'M'], ['measure word: schools or houses', 'an institute or office'], 'mw.'],
			['批', ['V', 'M'], ['measure word: batches', 'to approve in writing'], 'mw.'],
			['想象', ['N', 'V'], ["to picture in one's mind", 'imagination'], 'v.'],
			['害', ['N', 'V'], ['to do harm to', 'harm or damage'], 'v.'],
			['盒', ['N', 'M'], ['measure word: boxes of something', 'a box'], 'mw.'],
			['为难', ['Adj', 'V'], ['to feel awkward', 'to make things hard for someone'], 'v.'],
			['指示', ['N', 'V'], ['to instruct', 'an instruction'], 'v.']
		];
		for (const [hanzi, pos, meanings, want] of rows) {
			expect(chip(word({ hanzi, pos, meanings })), hanzi).toBe(want);
		}
	});

	it('leaves untagged cards chip-less', () => {
		const entry = word({ pos: [], meanings: ['softens a suggestion or guess'] });
		expect(labels(entry)).toEqual([{ pos: '', gloss: 'softens a suggestion or guess' }]);
		expect(chip(entry)).toBe('');
	});
});

describe('groupSenses', () => {
	it('heads consecutive same-POS glosses as one Pleco-style block', () => {
		expect(
			groupSenses([
				{ pos: 'N', gloss: 'side' },
				{ pos: 'N', gloss: 'face' },
				{ pos: 'M', gloss: 'measure word: flat things' }
			])
		).toEqual([
			{
				pos: 'N',
				items: [
					{ n: 1, gloss: 'side' },
					{ n: 2, gloss: 'face' }
				]
			},
			{ pos: 'M', items: [{ n: 3, gloss: 'measure word: flat things' }] }
		]);
	});
});
