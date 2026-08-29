/**
 * The re-test the summary offers is the one thing on that screen a screenshot cannot check:
 * "these 3 again" has to mean *those three*, with wrong answers that are wrong.
 *
 * Every case below is a claim the screen makes out loud. `buildSession` is not exercised here —
 * it is the thing this deliberately does not use, because handing it three words would leave it
 * drawing each card's distractors from the other two misses.
 */

import { describe, expect, it } from 'vitest';
import { mulberry32 } from '$lib/session';
import { makeLevel } from '$lib/session/test-fixtures';
import type { Question, Word } from '$lib/types';
import { buildDrill, drillPool, type DrillCard, type DrillSeed } from './drill';

const LEVEL = makeLevel(1, 60);

/** A finished run's worth of questions: ten answers, each with three other words on it. */
function runOf(words: readonly Word[], count = 10): Question[] {
	return Array.from({ length: count }, (_, i) => ({
		word: words[i],
		direction: (i % 2 === 0 ? 'hanzi-to-meaning' : 'meaning-to-hanzi') as Question['direction'],
		choices: [words[i], words[count + i * 3], words[count + i * 3 + 1], words[count + i * 3 + 2]]
	}));
}

function seedsFrom(questions: readonly Question[], at: readonly number[]): DrillSeed[] {
	return at.map((i) => ({
		word: questions[i].word,
		direction: questions[i].direction,
		picked: questions[i].choices.find((choice) => choice.id !== questions[i].word.id) ?? null
	}));
}

describe('drillPool', () => {
	it('collects every distinct word the run put on screen, answers included', () => {
		const questions = runOf(LEVEL);
		const pool = drillPool(questions);
		const ids = new Set(pool.map((word) => word.id));
		expect(ids.size).toBe(pool.length);
		for (const question of questions) {
			expect(ids.has(question.word.id)).toBe(true);
			for (const choice of question.choices) expect(ids.has(choice.id)).toBe(true);
		}
	});

	it('is a pool worth drawing from — a ten-question run yields far more than four words', () => {
		expect(drillPool(runOf(LEVEL)).length).toBeGreaterThan(20);
	});
});

describe('buildDrill', () => {
	const questions = runOf(LEVEL);
	const pool = drillPool(questions);

	it('asks exactly the seeded words, in the order they are stacked on the screen', () => {
		const seeds = seedsFrom(questions, [2, 5, 8]);
		const cards = buildDrill(seeds, pool, mulberry32(7));
		expect(cards.map((card) => card.word.id)).toEqual(seeds.map((seed) => seed.word.id));
	});

	it('keeps the direction each word was asked in', () => {
		const seeds = seedsFrom(questions, [2, 5, 8]);
		const cards = buildDrill(seeds, pool, mulberry32(7));
		expect(cards.map((card) => card.direction)).toEqual(seeds.map((seed) => seed.direction));
	});

	it('puts four distinct choices on every card, one of them the answer', () => {
		const cards = buildDrill(seedsFrom(questions, [0, 3, 6, 9]), pool, mulberry32(11));
		for (const card of cards) {
			expect(card.choices).toHaveLength(4);
			expect(new Set(card.choices.map((choice) => choice.id)).size).toBe(4);
			expect(card.choices.some((choice) => choice.id === card.word.id)).toBe(true);
		}
	});

	it('never puts one card’s answer on another card', () => {
		const seeds = seedsFrom(questions, [1, 4, 7]);
		const answers = new Set(seeds.map((seed) => seed.word.id));
		for (const card of buildDrill(seeds, pool, mulberry32(3))) {
			for (const choice of card.choices) {
				if (choice.id === card.word.id) continue;
				expect(answers.has(choice.id)).toBe(false);
			}
		}
	});

	it('offers the word that was picked instead, so the confusion is on the card', () => {
		const seeds = seedsFrom(questions, [2, 5, 8]);
		const cards = buildDrill(seeds, pool, mulberry32(23));
		for (const [i, card] of cards.entries()) {
			const wrong = seeds[i].picked;
			if (!wrong) continue;
			expect(card.choices.some((choice) => choice.id === wrong.id)).toBe(true);
		}
	});

	it('survives a seed with no answer at all — a question that ran out of run', () => {
		const seeds: DrillSeed[] = [
			{ word: questions[4].word, direction: questions[4].direction, picked: null }
		];
		const cards = buildDrill(seeds, pool, mulberry32(5));
		expect(cards).toHaveLength(1);
		expect(cards[0].choices).toHaveLength(4);
	});

	it('draws different wrong answers on a second pass, so elimination stops working', () => {
		const seeds = seedsFrom(questions, [0]);
		const first = buildDrill(seeds, pool, mulberry32(1))[0];
		const second = buildDrill(seeds, pool, mulberry32(999))[0];
		const wrongIds = (card: DrillCard) =>
			card.choices
				.filter((choice) => choice.id !== card.word.id)
				.map((choice) => choice.id)
				.sort();
		expect(wrongIds(first)).not.toEqual(wrongIds(second));
	});

	it('still fills the card when the pool is barely bigger than the drill', () => {
		const tiny = LEVEL.slice(0, 6);
		const seeds: DrillSeed[] = [{ word: tiny[0], direction: 'hanzi-to-meaning', picked: null }];
		const cards = buildDrill(seeds, tiny, mulberry32(2));
		expect(cards[0].choices).toHaveLength(4);
	});

	it('returns nothing for nothing, so a cleared list cannot start an empty drill', () => {
		expect(buildDrill([], pool, mulberry32(4))).toEqual([]);
	});
});
