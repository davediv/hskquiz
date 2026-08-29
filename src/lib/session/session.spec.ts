import { describe, expect, it } from 'vitest';
import type { Direction, Session, Word } from '../types';
import { CHOICE_COUNT, SESSION_SIZE, buildSession, isCorrect, mulberry32 } from './index';
import { sharesSense } from './distractors';
import { HOUR, makeLevel, mastered, progressState, record, shaky } from './test-fixtures';

const NOW = 1_700_000_000_000;
const LEVEL_1 = makeLevel(1, 220);

function build(
	words: readonly Word[],
	progress: Parameters<typeof buildSession>[2],
	seed = 1,
	size = SESSION_SIZE
) {
	return buildSession(words, 1, progress, size, { rng: mulberry32(seed), now: NOW });
}

function ids(session: Session): string[] {
	return session.questions.map((q) => q.word.id);
}

describe('buildSession — shape', () => {
	const session = build(LEVEL_1, null);

	it('returns a fresh, unanswered session for the requested level', () => {
		expect(session.level).toBe(1);
		expect(session.index).toBe(0);
		expect(session.answers).toHaveLength(session.questions.length);
		expect(session.answers.every((a) => a === null)).toBe(true);
	});

	it('asks ten questions by default', () => {
		expect(session.questions).toHaveLength(SESSION_SIZE);
	});

	it('offers four choices, one of which is the answer', () => {
		for (const question of session.questions) {
			expect(question.choices).toHaveLength(CHOICE_COUNT);
			expect(question.choices.filter((c) => c.id === question.word.id)).toHaveLength(1);
		}
	});

	it('does not put the answer in the same slot every time', () => {
		const slots = new Set(
			session.questions.map((q) => q.choices.findIndex((c) => c.id === q.word.id))
		);
		expect(slots.size).toBeGreaterThan(1);
	});

	it('never repeats a word inside one session', () => {
		expect(new Set(ids(session)).size).toBe(session.questions.length);
	});

	it("never reuses a session answer as another question's wrong answer", () => {
		const answers = new Set(ids(session));
		for (const question of session.questions) {
			for (const choice of question.choices) {
				if (choice.id === question.word.id) continue;
				expect(answers.has(choice.id)).toBe(false);
			}
		}
	});

	it('mixes both directions, evenly', () => {
		const counts = new Map<Direction, number>();
		for (const q of session.questions) counts.set(q.direction, (counts.get(q.direction) ?? 0) + 1);
		expect(counts.get('hanzi-to-meaning')).toBe(5);
		expect(counts.get('meaning-to-hanzi')).toBe(5);
	});

	it('only draws from the requested level', () => {
		const mixed = [...LEVEL_1, ...makeLevel(2, 120)];
		const session2 = build(mixed, null, 9);
		for (const question of session2.questions) {
			expect(question.word.level).toBe(1);
			for (const choice of question.choices) expect(choice.level).toBe(1);
		}
	});

	it('never shows an entry that has no gloss to display', () => {
		for (let seed = 0; seed < 30; seed++) {
			for (const question of build(LEVEL_1, null, seed).questions) {
				for (const choice of question.choices) {
					expect(choice.meanings.length).toBeGreaterThan(0);
				}
			}
		}
	});

	it('leaves no question with two defensible answers', () => {
		for (let seed = 0; seed < 30; seed++) {
			for (const question of build(LEVEL_1, null, seed).questions) {
				for (let i = 0; i < question.choices.length; i++) {
					for (let j = i + 1; j < question.choices.length; j++) {
						expect(question.choices[i].hanzi).not.toBe(question.choices[j].hanzi);
						expect(sharesSense(question.choices[i], question.choices[j])).toBe(false);
					}
				}
			}
		}
	});
});

describe('buildSession — determinism', () => {
	it('is reproducible from a seed', () => {
		const a = build(LEVEL_1, null, 77);
		const b = build(LEVEL_1, null, 77);
		expect(ids(a)).toEqual(ids(b));
		expect(a.questions.map((q) => q.direction)).toEqual(b.questions.map((q) => q.direction));
		expect(a.questions.map((q) => q.choices.map((c) => c.id))).toEqual(
			b.questions.map((q) => q.choices.map((c) => c.id))
		);
	});

	it('produces a different session from a different seed', () => {
		expect(ids(build(LEVEL_1, null, 1))).not.toEqual(ids(build(LEVEL_1, null, 2)));
	});
});

describe('buildSession — explore / exploit', () => {
	const seen = LEVEL_1.slice(0, 120);
	const history = progressState(seen.map((w) => mastered(w.id, NOW, 5 * HOUR)));

	it('keeps introducing new words to a learner with plenty of history', () => {
		const session = build(LEVEL_1, history, 5);
		const fresh = ids(session).filter((id) => !(id in history.byWord));
		// 40% of ten, held as a quota rather than left to chance.
		expect(fresh).toHaveLength(4);
	});

	it('holds that split across many seeds', () => {
		for (let seed = 0; seed < 40; seed++) {
			const session = build(LEVEL_1, history, seed);
			const fresh = ids(session).filter((id) => !(id in history.byWord));
			expect(fresh).toHaveLength(4);
		}
	});

	it('fills a first session entirely with new words', () => {
		const session = build(LEVEL_1, progressState([]), 3);
		expect(session.questions).toHaveLength(SESSION_SIZE);
	});

	it('falls back to pure review once the level is exhausted', () => {
		const everything = progressState(LEVEL_1.map((w) => mastered(w.id, NOW)));
		const session = build(LEVEL_1, everything, 3);
		expect(session.questions).toHaveLength(SESSION_SIZE);
		expect(ids(session).every((id) => id in everything.byWord)).toBe(true);
	});

	it('introduces new words as recognition rather than testing them cold', () => {
		const session = build(LEVEL_1, history, 11);
		for (const question of session.questions) {
			if (question.word.id in history.byWord) continue;
			expect(question.direction).toBe('hanzi-to-meaning');
		}
	});
});

describe('buildSession — weighting', () => {
	// Half the level is shaky, half is mastered, nothing is new: the only thing separating
	// the two groups is the answer history, so the draw is a direct read on the weights.
	const usable = LEVEL_1.filter((w) => w.meanings.length > 0);
	const half = Math.floor(usable.length / 2);
	const shakyWords = usable.slice(0, half);
	const masteredWords = usable.slice(half);
	const history = progressState([
		...shakyWords.map((w) => shaky(w.id, NOW)),
		...masteredWords.map((w) => mastered(w.id, NOW))
	]);

	function drawRates(runs: number) {
		const counts = { shaky: 0, mastered: 0 };
		const shakyIds = new Set(shakyWords.map((w) => w.id));
		for (let seed = 0; seed < runs; seed++) {
			for (const id of ids(build(LEVEL_1, history, seed))) {
				if (shakyIds.has(id)) counts.shaky++;
				else counts.mastered++;
			}
		}
		return counts;
	}

	it('overwhelmingly draws the words the learner keeps missing', () => {
		const counts = drawRates(200);
		const total = counts.shaky + counts.mastered;
		expect(total).toBe(200 * SESSION_SIZE);
		expect(counts.shaky / total).toBeGreaterThan(0.9);
	});

	it('still lets a mastered word through occasionally', () => {
		const counts = drawRates(200);
		expect(counts.mastered).toBeGreaterThan(0);
	});

	it('prefers the word missed today over the one missed months ago', () => {
		const fresh = usable.slice(0, 60);
		const stale = usable.slice(60, 120);
		const history2 = progressState([
			...fresh.map((w) => shaky(w.id, NOW, HOUR)),
			...stale.map((w) => shaky(w.id, NOW, 200 * 24 * HOUR)),
			// Everything else is mastered so the two groups compete for the review slots.
			...usable.slice(120).map((w) => mastered(w.id, NOW))
		]);
		const freshIds = new Set(fresh.map((w) => w.id));
		const staleIds = new Set(stale.map((w) => w.id));
		let freshCount = 0;
		let staleCount = 0;
		for (let seed = 0; seed < 200; seed++) {
			for (const id of ids(build(LEVEL_1, history2, seed))) {
				if (freshIds.has(id)) freshCount++;
				else if (staleIds.has(id)) staleCount++;
			}
		}
		expect(staleCount).toBeGreaterThan(0);
		expect(freshCount).toBeGreaterThan(staleCount);
	});
});

describe('buildSession — inputs it has to survive', () => {
	it('accepts the progress store as well as the raw state', () => {
		const state = progressState(LEVEL_1.slice(0, 20).map((w) => shaky(w.id, NOW)));
		const viaStore = buildSession(LEVEL_1, 1, { state }, SESSION_SIZE, {
			rng: mulberry32(8),
			now: NOW
		});
		const viaState = build(LEVEL_1, state, 8);
		expect(ids(viaStore)).toEqual(ids(viaState));
	});

	it('accepts a missing progress state', () => {
		expect(build(LEVEL_1, undefined).questions).toHaveLength(SESSION_SIZE);
	});

	it('clamps a session larger than the level', () => {
		const small = makeLevel(1, 6).filter((w) => w.meanings.length > 0);
		const session = build(small, null, 1, 50);
		expect(session.questions).toHaveLength(small.length);
		expect(new Set(ids(session)).size).toBe(small.length);
		// Too small to spare its own answers, so the picker reuses them rather than
		// serving a card with one button on it.
		for (const question of session.questions) {
			expect(question.choices.length).toBeGreaterThan(1);
		}
	});

	it('returns an empty session for a level with nothing in it', () => {
		const session = build([], null);
		expect(session.questions).toHaveLength(0);
		expect(session.answers).toHaveLength(0);
	});

	it('honours a custom size', () => {
		expect(build(LEVEL_1, null, 1, 4).questions).toHaveLength(4);
	});

	it('ignores progress records for words that are not in the level', () => {
		const strays = progressState([record('L9-9999', { seen: 5, correct: 0, streak: 0 })]);
		expect(build(LEVEL_1, strays).questions).toHaveLength(SESSION_SIZE);
	});
});

describe('isCorrect', () => {
	const session = build(LEVEL_1, null, 21);
	const question = session.questions[0];

	it('is false when the learner skipped', () => {
		expect(isCorrect(question, null)).toBe(false);
	});

	it('is true for the answer and false for every distractor', () => {
		expect(isCorrect(question, question.word)).toBe(true);
		for (const choice of question.choices) {
			if (choice.id === question.word.id) continue;
			expect(isCorrect(question, choice)).toBe(false);
		}
	});

	it('credits a homograph that renders identically to the answer', () => {
		const twin: Word = { ...question.word, id: 'other-entry' };
		expect(isCorrect(question, twin)).toBe(true);
	});

	it('does not credit a different entry that merely shares the hanzi', () => {
		const homograph: Word = {
			...question.word,
			id: 'other-entry',
			meanings: ['a completely unrelated sense']
		};
		expect(isCorrect(question, homograph)).toBe(false);
	});
});
