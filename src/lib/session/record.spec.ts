import { describe, expect, it } from 'vitest';
import { readRecord, UNMET } from './record';
import { cardKindFor } from './direction';
import { wordWeight } from './weighting';
import { DAY, record } from './test-fixtures';

const NOW = 1_700_000_000_000;

describe('readRecord — an exposure is not an answer', () => {
	it('reads a word nothing has touched as never met', () => {
		expect(readRecord(undefined)).toEqual(UNMET);
		expect(readRecord(null)).toEqual(UNMET);
		// `wordId` is the one fact a record carries even when nothing has happened to it: the
		// ladder's refresh phase is keyed on it, and it used to be read off the raw field.
		expect(readRecord(record('w', { seen: 0, correct: 0, streak: 0 }))).toEqual({
			...UNMET,
			wordId: 'w'
		});
		expect(readRecord({ seen: 0, correct: 0, streak: 0 }).wordId).toBe('');
	});

	it('reads the `exposures` counter when the store writes one', () => {
		const facts = readRecord({ wordId: 'w', ...blank(), exposures: 1, lastSeen: NOW });
		expect(facts).toMatchObject({ answers: 0, correct: 0, misses: 0, exposures: 1 });
		expect(facts.met).toBe(true);
		expect(facts.taughtOnly).toBe(true);
	});

	it('reads a timestamp with no answers behind it as an exposure', () => {
		// `applyAnswer` always bumps `seen` and `lastSeen` together, so this shape can only mean
		// something stamped the word without asking it. A `noteSeen` needs no schema change to
		// write it.
		const facts = readRecord({ wordId: 'w', ...blank(), lastSeen: NOW });
		expect(facts.exposures).toBe(1);
		expect(facts.answers).toBe(0);
		expect(facts.taughtOnly).toBe(true);
	});

	it('reads a `seen` bump with no miss stamp as an exposure, not as a 100% error rate', () => {
		// The shape a `noteSeen` that bumps `seen` would write. Every miss stamps `lastMissed`,
		// so a miss without one was never an answer.
		const facts = readRecord({
			wordId: 'w',
			seen: 1,
			correct: 0,
			streak: 0,
			lastSeen: NOW,
			lastMissed: 0
		});
		expect(facts).toMatchObject({ answers: 0, correct: 0, misses: 0, exposures: 1 });
		expect(facts.taughtOnly).toBe(true);
	});

	it('leaves a real miss alone: it carries its stamp', () => {
		const facts = readRecord({
			wordId: 'w',
			seen: 1,
			correct: 0,
			streak: 0,
			lastSeen: NOW,
			lastMissed: NOW
		});
		expect(facts).toMatchObject({ answers: 1, correct: 0, misses: 1, exposures: 0 });
		expect(facts.taughtOnly).toBe(false);
	});

	it('separates the two counts on a word that was taught and then answered', () => {
		const facts = readRecord({
			wordId: 'w',
			seen: 3,
			correct: 2,
			streak: 0,
			exposures: 1,
			lastSeen: NOW,
			lastMissed: NOW - DAY
		});
		expect(facts).toMatchObject({ answers: 3, correct: 2, misses: 1, exposures: 1 });
		expect(facts.met).toBe(true);
		expect(facts.taughtOnly).toBe(false);
	});

	it('cannot report more right answers than answers, or a streak longer than either', () => {
		// `{seen: 1, correct: 0, streak: 99}` used to promote a word the learner had never once
		// got right straight to production.
		const facts = readRecord({
			wordId: 'w',
			seen: 1,
			correct: 5,
			streak: 99,
			lastSeen: NOW,
			lastMissed: NOW
		});
		expect(facts.correct).toBeLessThanOrEqual(facts.answers);
		expect(facts.streak).toBeLessThanOrEqual(facts.correct);
		expect(
			cardKindFor({ wordId: 'w', seen: 1, correct: 0, streak: 99, lastSeen: NOW, lastMissed: NOW })
		).toBe('hanzi-to-meaning');
	});

	it('turns any garbage into coherent facts rather than a NaN', () => {
		const hostile = [
			{ wordId: 'w', seen: NaN, correct: -4, streak: Infinity, lastSeen: -1, lastMissed: NaN },
			{ wordId: 'w', seen: '7', correct: {}, streak: [], lastSeen: '0', lastMissed: null },
			'not a record',
			42,
			{}
		];
		for (const input of hostile) {
			const facts = readRecord(input as never);
			for (const value of [
				facts.answers,
				facts.correct,
				facts.misses,
				facts.streak,
				facts.exposures
			]) {
				expect(Number.isFinite(value) && value >= 0).toBe(true);
			}
			expect(facts.misses).toBe(facts.answers - facts.correct);
		}
	});
});

describe('the taught-but-unanswered record', () => {
	// The exact record the loop-2 verdict names, in both shapes a store could write it.
	const taught = [
		{ wordId: 'w', seen: 0, correct: 0, streak: 0, lastSeen: NOW, lastMissed: 0, exposures: 1 },
		{ wordId: 'w', seen: 1, correct: 0, streak: 0, lastSeen: NOW, lastMissed: 0 }
	];

	it('is never more urgent than a word the app has never shown at all', () => {
		for (const shape of taught) {
			// At the moment it is taught. The old reading made it 5.714× an unseen word.
			expect(wordWeight(shape, NOW)).toBeCloseTo(1, 6);
			expect(wordWeight(shape, NOW)).toBeLessThanOrEqual(wordWeight(undefined, NOW));
		}
	});

	it('is nowhere near a word the learner actually got wrong', () => {
		const missed = { wordId: 'w', seen: 1, correct: 0, streak: 0, lastSeen: NOW, lastMissed: NOW };
		for (const shape of taught) {
			expect(wordWeight(shape, NOW + DAY) * 10).toBeLessThan(wordWeight(missed, NOW + DAY));
		}
	});

	it('climbs only on the forgetting curve every record shares, and stays bounded', () => {
		for (const shape of taught) {
			// Nothing but `stale`: 1.0 → 3.0 over a fortnight, and never above it.
			expect(wordWeight(shape, NOW + DAY)).toBeCloseTo(1 + 1 / 7, 4);
			expect(wordWeight(shape, NOW + 365 * DAY)).toBeCloseTo(3, 6);
		}
	});

	it('is owed a question, not another introduction', () => {
		// Without this the ladder never leaves `introduce`: every card of every session, forever.
		for (const shape of taught) expect(cardKindFor(shape)).toBe('hanzi-to-meaning');
	});
});

function blank() {
	return { seen: 0, correct: 0, streak: 0, lastSeen: 0, lastMissed: 0 };
}
