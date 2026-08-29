import { describe, expect, it } from 'vitest';
import { EXPLORE_SHARE, WEIGHTS, leechBrake, wordWeight } from './weighting';
import { DAY, HOUR, mastered, record, shaky } from './test-fixtures';

const NOW = 1_700_000_000_000;

describe('wordWeight', () => {
	it('gives an unseen word the reference weight of 1', () => {
		expect(wordWeight(undefined, NOW)).toBe(1);
		expect(wordWeight(record('w', { seen: 0, correct: 0, streak: 0 }), NOW)).toBe(1);
	});

	it('makes a recently and repeatedly missed word far likelier than a 3-streak word', () => {
		const shakyWeight = wordWeight(shaky('a', NOW), NOW);
		const masteredWeight = wordWeight(mastered('b', NOW), NOW);
		expect(shakyWeight / masteredWeight).toBeGreaterThan(50);
	});

	it('outranks an unseen word when shaky and is outranked by one when mastered', () => {
		expect(wordWeight(shaky('a', NOW), NOW)).toBeGreaterThan(1);
		expect(wordWeight(mastered('b', NOW), NOW)).toBeLessThan(1);
	});

	it('decays monotonically with each consecutive correct answer', () => {
		const weights = [0, 1, 2, 3, 4].map((streak) =>
			wordWeight(record('w', { seen: 5, correct: 5, streak, lastSeen: NOW - DAY }), NOW)
		);
		for (let i = 1; i < weights.length; i++) {
			expect(weights[i]).toBeLessThan(weights[i - 1]);
		}
	});

	it('stops decaying past the streak cap so nothing becomes unreachable', () => {
		const capped = wordWeight(
			record('w', { seen: 20, correct: 20, streak: WEIGHTS.streakCap, lastSeen: NOW - DAY }),
			NOW
		);
		const beyond = wordWeight(
			record('w', { seen: 40, correct: 40, streak: 40, lastSeen: NOW - DAY }),
			NOW
		);
		expect(beyond).toBeCloseTo(capped, 10);
		expect(beyond).toBeGreaterThan(0);
	});

	it('fades the boost from a miss as the miss ages', () => {
		const fresh = wordWeight(shaky('a', NOW, HOUR), NOW);
		const week = wordWeight(shaky('a', NOW, 7 * DAY), NOW);
		const season = wordWeight(shaky('a', NOW, 120 * DAY), NOW);
		expect(fresh).toBeGreaterThan(week);
		expect(week).toBeGreaterThan(season);
	});

	it('separates recency from raw miss count: a stale miss loses to a fresh one', () => {
		// Missed *more often*, but months ago.
		const oldAndOftenMissed = record('a', {
			seen: 20,
			correct: 5,
			streak: 0,
			lastSeen: NOW - 90 * DAY,
			lastMissed: NOW - 90 * DAY
		});
		// Missed once, a minute ago.
		const missedJustNow = record('b', {
			seen: 2,
			correct: 1,
			streak: 0,
			lastSeen: NOW - 60_000,
			lastMissed: NOW - 60_000
		});
		expect(wordWeight(missedJustNow, NOW)).toBeGreaterThan(
			wordWeight(oldAndOftenMissed, NOW) * 0.5
		);
		// …and with the same recency, the more-missed word wins — up to the point where being
		// missed *this* often stops meaning "drill me" and starts meaning "rest me": at 15
		// misses the leech brake pulls the same record back under the word missed once.
		const missedFiveOfSix = record('c', {
			seen: 6,
			correct: 1,
			streak: 0,
			lastSeen: NOW - 60_000,
			lastMissed: NOW - 60_000
		});
		expect(wordWeight(missedFiveOfSix, NOW)).toBeGreaterThan(wordWeight(missedJustNow, NOW));

		const leechToday = record('d', {
			...oldAndOftenMissed,
			lastSeen: NOW - 60_000,
			lastMissed: NOW - 60_000
		});
		expect(wordWeight(leechToday, NOW)).toBeLessThan(wordWeight(missedJustNow, NOW));
		expect(wordWeight(leechToday, NOW)).toBeGreaterThan(wordWeight(mastered('e', NOW, DAY), NOW));
	});

	it('rests a word answered correctly moments ago, but never one just missed', () => {
		const justRight = wordWeight(
			record('a', { seen: 3, correct: 3, streak: 3, lastSeen: NOW }),
			NOW
		);
		const rightYesterday = wordWeight(
			record('a', { seen: 3, correct: 3, streak: 3, lastSeen: NOW - DAY }),
			NOW
		);
		expect(justRight).toBeLessThan(rightYesterday);

		const justWrong = wordWeight(shaky('b', NOW, 0), NOW);
		const wrongYesterday = wordWeight(shaky('b', NOW, DAY), NOW);
		expect(justWrong).toBeGreaterThan(wrongYesterday);
	});

	it('revives a mastered word that has not been touched in weeks', () => {
		const recent = wordWeight(mastered('a', NOW, DAY), NOW);
		const stale = wordWeight(mastered('a', NOW, 30 * DAY), NOW);
		expect(stale).toBeGreaterThan(recent * 2);
	});

	it('never returns a non-positive weight', () => {
		const extreme = wordWeight(
			record('w', { seen: 999, correct: 999, streak: 999, lastSeen: NOW }),
			NOW
		);
		expect(extreme).toBeGreaterThanOrEqual(WEIGHTS.floor);
	});

	it('tolerates a corrupt record without going negative or NaN', () => {
		const weird = wordWeight(
			record('w', { seen: 2, correct: 9, streak: -4, lastSeen: NOW + DAY, lastMissed: NOW + DAY }),
			NOW
		);
		expect(Number.isFinite(weird)).toBe(true);
		expect(weird).toBeGreaterThan(0);
	});
});

describe('the leech brake', () => {
	const missedNDaysAgo = (seen: number, misses: number, days = 2) =>
		record('w', {
			seen,
			correct: seen - misses,
			streak: 0,
			lastSeen: NOW - days * DAY,
			lastMissed: NOW - days * DAY
		});

	it('leaves an ordinary run of misses completely alone', () => {
		for (let misses = 0; misses <= WEIGHTS.leechLapses; misses++) {
			expect(leechBrake(misses)).toBe(1);
		}
	});

	it('keeps pulling a word down the more the learner fails it', () => {
		const brakes = [7, 10, 20, 40].map(leechBrake);
		for (let i = 1; i < brakes.length; i++) expect(brakes[i]).toBeLessThan(brakes[i - 1]);
		expect(brakes[0]).toBeLessThan(1);
	});

	it('never brakes all the way to unreachable', () => {
		expect(leechBrake(1000)).toBe(WEIGHTS.leechFloor);
		expect(leechBrake(Number.POSITIVE_INFINITY)).toBe(1);
	});

	// The whole point: without this, `missed 1 of 1` and `missed 20 of 20` are the same number,
	// because the error rate saturates at 1.0 on the first miss.
	it('separates a word missed once from a word missed twenty times', () => {
		const once = wordWeight(missedNDaysAgo(1, 1), NOW);
		const twenty = wordWeight(missedNDaysAgo(20, 20), NOW);
		const sixty = wordWeight(missedNDaysAgo(60, 60), NOW);
		expect(twenty).toBeLessThan(once / 10);
		expect(sixty).toBeLessThan(twenty);
		expect(sixty).toBeGreaterThan(0);
	});

	it('still puts a leech ahead of a word the learner has mastered', () => {
		expect(wordWeight(missedNDaysAgo(20, 20), NOW)).toBeGreaterThan(
			wordWeight(mastered('b', NOW, DAY), NOW)
		);
	});

	it('lets a word climb back out as soon as the misses stop', () => {
		const stuck = wordWeight(missedNDaysAgo(20, 20), NOW);
		const recovering = wordWeight(
			record('w', {
				seen: 26,
				correct: 6,
				streak: 6,
				lastSeen: NOW - DAY,
				lastMissed: NOW - 7 * DAY
			}),
			NOW
		);
		expect(recovering).toBeLessThan(stuck);
	});
});

describe('wordWeight — corrupt records', () => {
	it('reads a non-finite field as no information rather than as a NaN weight', () => {
		const fields = ['seen', 'correct', 'streak', 'lastSeen', 'lastMissed'] as const;
		for (const field of fields) {
			for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
				const weight = wordWeight({ ...shaky('w', NOW, HOUR), [field]: value }, NOW);
				expect(Number.isFinite(weight)).toBe(true);
				expect(weight).toBeGreaterThan(0);
			}
		}
	});
});

describe('EXPLORE_SHARE', () => {
	it('reserves a real slice of every session for new words', () => {
		expect(EXPLORE_SHARE).toBeGreaterThan(0);
		expect(EXPLORE_SHARE).toBeLessThan(1);
	});
});
