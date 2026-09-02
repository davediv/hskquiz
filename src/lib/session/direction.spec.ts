import { describe, expect, it } from 'vitest';
import {
	PRODUCTION_STREAK,
	REFRESH_EVERY,
	cardKindFor,
	directionOf,
	kindAfterIntroduction
} from './direction';
import { makeLevel, mastered, record, shaky } from './test-fixtures';

const NOW = 1_700_000_000_000;
const LEVEL_1 = makeLevel(1, 220);

/** The record a word has after `n` correct answers in a row and nothing else. */
function afterCorrect(wordId: string, n: number) {
	return record(wordId, { seen: n, correct: n, streak: n, lastSeen: NOW });
}

describe('cardKindFor', () => {
	it('introduces a word nobody has been taught', () => {
		expect(cardKindFor(undefined)).toBe('introduce');
		expect(cardKindFor(null)).toBe('introduce');
		expect(cardKindFor(record('w', { seen: 0, correct: 0, streak: 0 }))).toBe('introduce');
	});

	it('asks a word being learned in the easier direction', () => {
		// Below the promotion streak, however many times it has come round.
		for (const seen of [1, 4, 30]) {
			const learning = record('L1-0001', { seen, correct: seen, streak: PRODUCTION_STREAK - 1 });
			expect(cardKindFor(learning)).toBe('hanzi-to-meaning');
		}
		expect(cardKindFor(shaky('L1-0001', NOW))).toBe('hanzi-to-meaning');
	});

	it('drops a word back to recognition when the learner lapses', () => {
		const lapsed = record('L1-0001', {
			seen: 9,
			correct: 8,
			streak: 0,
			lastSeen: NOW,
			lastMissed: NOW
		});
		expect(cardKindFor(lapsed)).toBe('hanzi-to-meaning');
	});

	it('promotes a word to production once it is known', () => {
		// Somewhere in a short run of mastered exposures it has to be asked the hard way.
		const kinds = new Set([4, 5, 6].map((n) => cardKindFor(afterCorrect('L1-0002', n))));
		expect(kinds.has('meaning-to-hanzi')).toBe(true);
	});

	it('brings every mastered word back to recognition inside one refresh cycle', () => {
		// "Quizzing in both directions" has to be true of a *word*, not merely of a session
		// that happens to contain one of each.
		const window = Array.from({ length: REFRESH_EVERY }, (_, i) => 4 + i);
		for (const word of LEVEL_1) {
			const kinds = new Set(window.map((n) => cardKindFor(afterCorrect(word.id, n))));
			expect(kinds.has('hanzi-to-meaning')).toBe(true);
			expect(kinds.has('meaning-to-hanzi')).toBe(true);
		}
	});

	it('does not flip the whole cohort on the same exposure', () => {
		// Identical records, different words: a rule keyed only on `seen` would put all 220 on
		// the same rung and hand a whole cohort 100% of one direction.
		const kinds = LEVEL_1.map((word) => cardKindFor(afterCorrect(word.id, 5)));
		const production = kinds.filter((k) => k === 'meaning-to-hanzi').length;
		expect(production).toBeGreaterThan(0);
		expect(production).toBeLessThan(kinds.length);
	});

	it('is stable: the same record always yields the same card', () => {
		const first = LEVEL_1.map((word) => cardKindFor(afterCorrect(word.id, 7)));
		const again = LEVEL_1.map((word) => cardKindFor(afterCorrect(word.id, 7)));
		expect(again).toEqual(first);
	});

	it('reads a corrupt record as a word never met, exactly as wordWeight does', () => {
		expect(cardKindFor(record('w', { seen: Number.NaN }))).toBe('introduce');
		expect(cardKindFor(record('w', { seen: -3 }))).toBe('introduce');
		expect(cardKindFor(record('w', { seen: 6, correct: 6, streak: Number.NaN }))).toBe(
			'hanzi-to-meaning'
		);
	});

	it('never returns anything a caller has to guess at', () => {
		const legal = ['introduce', 'hanzi-to-meaning', 'meaning-to-hanzi'];
		for (const word of LEVEL_1.slice(0, 40)) {
			for (const seen of [0, 1, 2, 3, 4, 5, 9, 40]) {
				expect(legal).toContain(cardKindFor(afterCorrect(word.id, seen)));
			}
		}
	});
});

describe('kindAfterIntroduction', () => {
	const NOW_ = 1_700_000_000_000;

	// The second half of a pair is built from a record that does not exist yet — the one the
	// introduction three cards back is about to write. This runs the ladder against exactly
	// that record rather than hard-coding "recognition" at the call site.
	it('is the rung a word reaches the instant its introduction is recorded', () => {
		expect(kindAfterIntroduction('L1-0001', NOW_)).toBe('hanzi-to-meaning');
		expect(kindAfterIntroduction('L1-0001', NOW_)).toBe(
			cardKindFor(record('L1-0001', { seen: 0, correct: 0, streak: 0, lastSeen: NOW_ }), 'L1-0001')
		);
	});

	it('is never an introduction — that is the card it follows', () => {
		for (const id of ['L1-0001', 'L1-0250', 'L5-1071', '']) {
			expect(kindAfterIntroduction(id, NOW_)).not.toBe('introduce');
		}
	});
});

describe('directionOf', () => {
	it('degrades an introduction to the direction it looks like', () => {
		expect(directionOf('introduce')).toBe('hanzi-to-meaning');
	});

	it('leaves a real direction alone', () => {
		expect(directionOf('hanzi-to-meaning')).toBe('hanzi-to-meaning');
		expect(directionOf('meaning-to-hanzi')).toBe('meaning-to-hanzi');
	});

	it('takes a word all the way up the ladder in order', () => {
		const seq = [0, 1, 2, 3].map((n) =>
			cardKindFor(n === 0 ? undefined : afterCorrect('L1-0003', n))
		);
		expect(seq[0]).toBe('introduce');
		expect(seq[1]).toBe('hanzi-to-meaning');
		expect(seq.slice(2)).toContain('meaning-to-hanzi');
	});

	it('gives a legal direction for every card the ladder can produce', () => {
		const legal = ['hanzi-to-meaning', 'meaning-to-hanzi'];
		expect(legal).toContain(directionOf(cardKindFor(undefined)));
		expect(legal).toContain(directionOf(cardKindFor(shaky('L1-0004', NOW))));
		expect(legal).toContain(directionOf(cardKindFor(mastered('L1-0004', NOW))));
	});
});
