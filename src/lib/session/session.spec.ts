import { describe, expect, it } from 'vitest';
import type { Direction, Question, Session, Word } from '../types';
import {
	CHOICE_COUNT,
	INTRO_GAP,
	SESSION_SIZE,
	buildSession,
	cardKind,
	cardKindFor,
	isCorrect,
	isIntroduction,
	isScored,
	mulberry32,
	readRecord,
	recordOutcome,
	type CardKind,
	type ProgressWriter
} from './index';
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

	// A word appears twice on purpose now, and only in one shape: the card that teaches it and
	// the card that asks it. Anything else is the collision `takeDistinct` exists to close.
	it('shows a word at most twice, as an introduction and then its own first question', () => {
		const cards = new Map<string, CardKind[]>();
		for (const question of session.questions) {
			const kinds = cards.get(question.word.id) ?? [];
			kinds.push(cardKind(question));
			cards.set(question.word.id, kinds);
		}
		for (const kinds of cards.values()) {
			expect(kinds.length).toBeLessThanOrEqual(2);
			if (kinds.length === 2) expect(kinds).toEqual(['introduce', 'hanzi-to-meaning']);
		}
	});

	it('puts a first question at least INTRO_GAP cards after the card that taught it', () => {
		for (let seed = 0; seed < 60; seed++) {
			const questions = build(LEVEL_1, null, seed).questions;
			const taughtAt = new Map<string, number>();
			questions.forEach((question, i) => {
				if (isIntroduction(question)) {
					taughtAt.set(question.word.id, i);
					return;
				}
				const at = taughtAt.get(question.word.id);
				if (at === undefined) return;
				expect(i - at).toBeGreaterThanOrEqual(INTRO_GAP);
			});
		}
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

	it('gives every card a direction a renderer that ignores `kind` can still draw', () => {
		const legal: Direction[] = ['hanzi-to-meaning', 'meaning-to-hanzi'];
		for (const question of session.questions) {
			expect(legal).toContain(question.direction);
			// An introduction shows the hanzi and reads out its meaning, so it degrades to
			// recognition rather than to a card with nothing on it.
			if (isIntroduction(question)) expect(question.direction).toBe('hanzi-to-meaning');
		}
	});

	it('never asks two questions that answer each other', () => {
		// `answerIds` already keeps one question's answer off another's buttons; this is the
		// other half — two *answers* that normalise to the same sense, so the learner reads
		// "the middle / in the middle" on one card and "within / middle" on another.
		for (let seed = 0; seed < 60; seed++) {
			const questions = build(LEVEL_1, null, seed).questions;
			for (let i = 0; i < questions.length; i++) {
				for (let j = i + 1; j < questions.length; j++) {
					// A word answers its own first question; that pair is the point, not a clash.
					if (questions[i].word.id === questions[j].word.id) continue;
					expect(questions[i].word.hanzi).not.toBe(questions[j].word.hanzi);
					expect(sharesSense(questions[i].word, questions[j].word)).toBe(false);
				}
			}
		}
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

	// 40% of the session's *questions*, held as a quota rather than left to chance — and a new
	// word costs two cards, so three of them take six of the ten and leave four for review.
	it('keeps introducing new words to a learner with plenty of history', () => {
		const session = build(LEVEL_1, history, 5);
		const fresh = ids(session).filter((id) => !(id in history.byWord));
		expect(fresh).toHaveLength(6);
		expect(new Set(fresh).size).toBe(3);
	});

	it('holds that split across many seeds', () => {
		for (let seed = 0; seed < 40; seed++) {
			const session = build(LEVEL_1, history, seed);
			const fresh = ids(session).filter((id) => !(id in history.byWord));
			expect(fresh).toHaveLength(6);
			expect(new Set(fresh).size).toBe(3);
		}
	});

	it('fills a first session with five words taught and the same five asked', () => {
		for (let seed = 0; seed < 40; seed++) {
			const session = build(LEVEL_1, progressState([]), seed);
			expect(session.questions).toHaveLength(SESSION_SIZE);
			const taught = session.questions.filter((question) => isIntroduction(question));
			const asked = session.questions.filter((question) => !isIntroduction(question));
			expect(taught).toHaveLength(SESSION_SIZE / 2);
			expect(asked).toHaveLength(SESSION_SIZE / 2);
			expect(new Set(asked.map((question) => question.word.id))).toEqual(
				new Set(taught.map((question) => question.word.id))
			);
		}
	});

	it('falls back to pure review once the level is exhausted', () => {
		const everything = progressState(LEVEL_1.map((w) => mastered(w.id, NOW)));
		const session = build(LEVEL_1, everything, 3);
		expect(session.questions).toHaveLength(SESSION_SIZE);
		expect(ids(session).every((id) => id in everything.byWord)).toBe(true);
	});

	it('introduces a new word before it tests it, never the other way round', () => {
		for (let seed = 0; seed < 40; seed++) {
			const taught = new Set<string>();
			for (const question of build(LEVEL_1, history, seed).questions) {
				if (question.word.id in history.byWord) continue;
				if (isIntroduction(question)) taught.add(question.word.id);
				else expect(taught.has(question.word.id)).toBe(true);
			}
		}
	});
});

describe('buildSession — a word is taught and asked in the same run', () => {
	/** Shown once and never asked: `lastSeen` with no answers, which is what `noteSeen` writes. */
	const taught = (wordId: string) =>
		record(wordId, { seen: 0, correct: 0, streak: 0, lastSeen: NOW - HOUR });

	// The defect this closes was the first screen a new learner saw: `buildSession` returned ten
	// `introduce` cards, the rail called them "Question 1/10", and the first thing the app ever
	// asked came a session later — if the debt quota happened to pay it. Sixty simulated daily
	// sessions left three words taught and never asked at all.
	it('asks every word it teaches, in the run that taught it', () => {
		for (let seed = 0; seed < 50; seed++) {
			for (const saved of [
				progressState([]),
				progressState(LEVEL_1.slice(0, 120).map((w) => mastered(w.id, NOW, 5 * HOUR)))
			]) {
				const questions = build(LEVEL_1, saved, seed).questions;
				const taughtHere = questions.filter((q) => isIntroduction(q)).map((q) => q.word.id);
				const askedHere = questions.filter((q) => !isIntroduction(q)).map((q) => q.word.id);
				for (const id of taughtHere) expect(askedHere).toContain(id);
			}
		}
	});

	it('leaves nothing owed once a run is finished', () => {
		for (let seed = 0; seed < 50; seed++) {
			const questions = build(LEVEL_1, progressState([]), seed).questions;
			const answers = new Map<string, number>();
			for (const question of questions) {
				if (!isScored(question)) continue;
				answers.set(question.word.id, (answers.get(question.word.id) ?? 0) + 1);
			}
			for (const question of questions) {
				expect(answers.get(question.word.id)).toBe(1);
			}
		}
	});

	// A learner who walks out between the teach card and its question still leaves a word owed —
	// the one shape this model does not manufacture and does still have to handle. There is no
	// debt quota any more, so it rejoins the review pool and is asked on its own weight.
	it('asks a word left over from an abandoned run rather than teaching it again', () => {
		const abandoned = progressState(LEVEL_1.slice(0, 4).map((w) => taught(w.id)));
		const owedIds = new Set(Object.keys(abandoned.byWord));
		let asked = 0;
		for (let seed = 0; seed < 40; seed++) {
			for (const question of build(LEVEL_1, abandoned, seed).questions) {
				if (!owedIds.has(question.word.id)) continue;
				expect(cardKind(question)).toBe('hanzi-to-meaning');
				asked++;
			}
		}
		expect(asked).toBeGreaterThan(0);
	});

	// `buildSession` used to take a `require: string[]` so the summary could name its ten words
	// to the next run. Nothing imported it, it bypassed `takeDistinct`, and it was deleted. It
	// has nothing left to do either: the run that teaches a word is the run that asks it, so a
	// finished session leaves ten words the learner has already answered once.
	it('needs no `require`: a finished run has already answered everything it showed', () => {
		for (let seed = 0; seed < 50; seed++) {
			const first = build(LEVEL_1, progressState([]), seed);
			const shown = new Set(first.questions.map((question) => question.word.id));
			const scored = new Set(
				first.questions.filter((question) => isScored(question)).map((q) => q.word.id)
			);
			expect(scored).toEqual(shown);
		}
	});
});

describe('buildSession — the card a word gets comes from that word', () => {
	const shakyWords = LEVEL_1.slice(0, 5);
	const masteredWords = LEVEL_1.slice(5, 40);
	const midway = progressState([
		...shakyWords.map((w) => shaky(w.id, NOW)),
		...masteredWords.map((w) => mastered(w.id, NOW))
	]);

	function kinds(saved: Parameters<typeof build>[1], runs: number, of?: ReadonlySet<string>) {
		const counts = { introduce: 0, 'hanzi-to-meaning': 0, 'meaning-to-hanzi': 0, total: 0 };
		for (let seed = 0; seed < runs; seed++) {
			for (const question of build(LEVEL_1, saved, seed).questions) {
				if (of && !of.has(question.word.id)) continue;
				counts[cardKind(question)]++;
				counts.total++;
			}
		}
		return counts;
	}

	// The bug this replaces: `assignDirections` sorted the ten drawn words by familiarity and
	// gave recognition to the better half, so on a first session — where every word is equally
	// unknown — half the run came out as cold production. 1000 of 2000, measured.
	it('never asks a new word in the harder direction: a first session is halves', () => {
		const counts = kinds(progressState([]), 200);
		expect(counts.total).toBe(200 * SESSION_SIZE);
		expect(counts.introduce).toBe(counts.total / 2);
		expect(counts['hanzi-to-meaning']).toBe(counts.total / 2);
		expect(counts['meaning-to-hanzi']).toBe(0);
	});

	it('scores only what it has already taught, so no miss is manufactured about a new word', () => {
		for (let seed = 0; seed < 200; seed++) {
			const shown = new Set<string>();
			for (const question of build(LEVEL_1, progressState([]), seed).questions) {
				if (isScored(question)) expect(shown.has(question.word.id)).toBe(true);
				else shown.add(question.word.id);
			}
		}
	});

	it('keeps a word the learner keeps missing out of the harder direction', () => {
		const shakyIds = new Set(shakyWords.map((w) => w.id));
		const counts = kinds(midway, 200, shakyIds);
		expect(counts.total).toBeGreaterThan(100);
		// Was 79.6% — the four explore-quota words were the least familiar in the draw and
		// soaked up the recognition slots, which pushed the shaky ones into production.
		expect(counts['meaning-to-hanzi'] / counts.total).toBeLessThan(0.25);
	});

	it('asks a mastered word both ways rather than locking it to production', () => {
		const everything = progressState(LEVEL_1.map((w) => mastered(w.id, NOW)));
		const counts = kinds(everything, 200);
		expect(counts['meaning-to-hanzi']).toBeGreaterThan(0);
		expect(counts['hanzi-to-meaning']).toBeGreaterThan(0);
		expect(counts['meaning-to-hanzi'] / counts.total).toBeGreaterThan(0.5);
	});

	it('gives a word the learner has met the card its own record earned', () => {
		const saveds = [midway, progressState(LEVEL_1.map((w) => shaky(w.id, NOW)))];
		for (const saved of saveds) {
			for (let seed = 0; seed < 25; seed++) {
				for (const question of build(LEVEL_1, saved, seed).questions) {
					const saved_ = saved.byWord[question.word.id];
					// A word met *in* this run is the pair above, not a record lookup.
					if (!saved_) continue;
					expect(cardKind(question)).toBe(cardKindFor(saved_, question.word.id));
				}
			}
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

	it('clamps a session to what the level can fill', () => {
		const small = makeLevel(1, 6).filter((w) => w.meanings.length > 0);
		const session = build(small, null, 1, 50);
		// Six unmet words are twelve cards: one to teach each, one to ask it.
		expect(session.questions).toHaveLength(small.length * 2);
		expect(new Set(ids(session)).size).toBe(small.length);
		// Too small to spare its own answers, so the picker reuses them rather than
		// serving a card with one button on it.
		for (const question of session.questions) {
			expect(question.choices.length).toBeGreaterThan(1);
		}
	});

	// A pair needs two cards, so an odd size with a dry review pool leaves one card over. It
	// gets a teach card rather than being dropped: a nine-card run asked for at ten is a short
	// session, and this is the one place a word is still left owed its question — until the
	// next run, where it is an ordinary review candidate.
	it('fills an odd-sized run rather than leaving a card empty', () => {
		for (const size of [1, 2, 3, 7, 9]) {
			const session = build(LEVEL_1, null, 5, size);
			expect(session.questions).toHaveLength(size);
		}
		// One card and one unmet word: teaching it is the whole of what fits.
		expect(build(LEVEL_1, null, 5, 1).questions.map((q) => cardKind(q))).toEqual(['introduce']);
	});

	it('returns an empty session for a level with nothing in it', () => {
		const session = build([], null);
		expect(session.questions).toHaveLength(0);
		expect(session.answers).toHaveLength(0);
	});

	it('honours a custom size', () => {
		expect(build(LEVEL_1, null, 1, 4).questions).toHaveLength(4);
	});

	it('reads a nonsense size as a caller mistake, not as a request for no questions', () => {
		// `Math.floor(NaN)` is `NaN` and survives `Math.max(0, Math.min(…))`, so the old clamp
		// turned a typo into the quiz screen's "HSK 1 has no questions to build from".
		expect(build(LEVEL_1, null, 1, Number.NaN).questions).toHaveLength(SESSION_SIZE);
		expect(build(LEVEL_1, null, 1, -5).questions).toHaveLength(SESSION_SIZE);
		expect(build(LEVEL_1, null, 1, 0).questions).toHaveLength(SESSION_SIZE);
		expect(build(LEVEL_1, null, 1, 1e9).questions.length).toBeGreaterThan(SESSION_SIZE);
	});

	it('ignores progress records for words that are not in the level', () => {
		const strays = progressState([record('L9-9999', { seen: 5, correct: 0, streak: 0 })]);
		expect(build(LEVEL_1, strays).questions).toHaveLength(SESSION_SIZE);
	});
});

describe('cardKind, isIntroduction, isScored', () => {
	const session = build(LEVEL_1, null, 31);

	it('reads the kind off a built question', () => {
		const taught = session.questions.filter((question) => isIntroduction(question));
		const asked = session.questions.filter((question) => !isIntroduction(question));
		expect(taught).toHaveLength(SESSION_SIZE / 2);
		expect(asked).toHaveLength(SESSION_SIZE / 2);
		for (const question of taught) {
			expect(cardKind(question)).toBe('introduce');
			expect(isScored(question)).toBe(false);
		}
		for (const question of asked) {
			expect(cardKind(question)).toBe('hanzi-to-meaning');
			expect(isScored(question)).toBe(true);
		}
	});

	it('falls back to the direction for a question assembled by hand', () => {
		const plain: Question = {
			word: session.questions[0].word,
			direction: 'meaning-to-hanzi',
			choices: session.questions[0].choices
		};
		expect(cardKind(plain)).toBe('meaning-to-hanzi');
		expect(isIntroduction(plain)).toBe(false);
		expect(isScored(plain)).toBe(true);
	});

	it('scores every card that is a question', () => {
		const history = progressState(LEVEL_1.map((w) => mastered(w.id, NOW)));
		for (const question of build(LEVEL_1, history, 5).questions) {
			expect(isScored(question)).toBe(true);
		}
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

/**
 * The whole point of the piece, played end to end.
 *
 * Everything above tests one session in isolation. This plays a learner: build a session,
 * fold each card into the record the way `recordOutcome` says it must be folded, build the
 * next one from what that left behind. It is the only place the ladder, the weights, the
 * quota and the record reader are all under load at once, and every defect this loop closed
 * was invisible to a single-session test.
 */
describe('a learner, over sessions', () => {
	/** The minimum honest progress store: `recordAnswer` plus a `noteSeen` that only stamps. */
	function store(now: () => number) {
		const byWord: Record<string, Record<string, number | string>> = {};
		const touch = (wordId: string) =>
			(byWord[wordId] ??= { wordId, seen: 0, correct: 0, streak: 0, lastSeen: 0, lastMissed: 0 });
		const writer: ProgressWriter = {
			recordAnswer(wordId, correct) {
				const r = touch(wordId);
				r.seen = (r.seen as number) + 1;
				r.lastSeen = now();
				if (correct) {
					r.correct = (r.correct as number) + 1;
					r.streak = (r.streak as number) + 1;
				} else {
					r.streak = 0;
					r.lastMissed = now();
				}
			},
			// No schema change: an exposure is a timestamp with no answer behind it.
			noteSeen(wordId) {
				touch(wordId).lastSeen = now();
			}
		};
		return { byWord, writer };
	}

	function play(sessions: number, seed: number, accuracy = 0.8) {
		const rng = mulberry32(seed);
		let at = NOW;
		const { byWord, writer } = store(() => at);
		const kinds: Record<string, number>[] = [];
		const drawn: string[][] = [];
		const outcomes = { answered: 0, introduced: 0, dropped: 0 };
		for (let s = 0; s < sessions; s++) {
			at = NOW + s * 24 * HOUR;
			const built = buildSession(
				LEVEL_1,
				1,
				{ version: 1, byWord, levels: {} } as never,
				SESSION_SIZE,
				{
					rng,
					now: at
				}
			);
			const here: Record<string, number> = {
				introduce: 0,
				'hanzi-to-meaning': 0,
				'meaning-to-hanzi': 0
			};
			drawn.push(built.questions.map((q) => q.word.id));
			for (const question of built.questions) {
				here[cardKind(question)]++;
				const picked = isScored(question)
					? rng() < accuracy
						? question.word
						: (question.choices.find((c) => c.id !== question.word.id) ?? null)
					: null;
				outcomes[recordOutcome(writer, question, picked)]++;
			}
			kinds.push(here);
		}
		return { byWord, kinds, drawn, outcomes };
	}

	it('teaches five words in the first session and asks all five, in that session', () => {
		const run = play(2, 11);
		expect(run.kinds[0].introduce).toBe(SESSION_SIZE / 2);
		expect(run.kinds[0]['hanzi-to-meaning']).toBe(SESSION_SIZE / 2);
		expect(run.kinds[0]['meaning-to-hanzi']).toBe(0);
		// Session 2 settles on the steady state: three new words, six cards, four for review.
		expect(run.kinds[1].introduce).toBe(3);
		// And it is not a re-run of session 1. The five words it taught have all been answered,
		// so they compete on weight like anything else rather than filling the next session.
		const taught = new Set(run.drawn[0]);
		expect(run.drawn[1].filter((id) => taught.has(id)).length).toBeLessThanOrEqual(4);
	});

	it('never writes a miss about a word it only ever showed', () => {
		for (const seed of [1, 2, 3, 4, 5]) {
			const run = play(12, seed);
			for (const raw of Object.values(run.byWord)) {
				const facts = readRecord(raw as never);
				// Every miss belongs to an answer. A record with a miss and no answers is one
				// the app manufactured about itself.
				if (facts.misses > 0) expect(facts.answers).toBeGreaterThan(0);
				if (facts.taughtOnly) expect(facts.lastMissed).toBe(0);
			}
			expect(run.outcomes.dropped).toBe(0);
			expect(run.outcomes.introduced).toBeGreaterThan(0);
		}
	});

	it('asks in both directions, as a share of the questions it actually asks', () => {
		// Measured at `PRODUCTION_STREAK = 2`: 0.2% of questions were production, because the
		// records that qualified were the records `0.45 ** streak` had already retired.
		let recognition = 0;
		let production = 0;
		for (const seed of [21, 22, 23, 24]) {
			for (const here of play(24, seed).kinds) {
				recognition += here['hanzi-to-meaning'];
				production += here['meaning-to-hanzi'];
			}
		}
		expect(production / (production + recognition)).toBeGreaterThan(0.15);
		expect(production / (production + recognition)).toBeLessThan(0.5);
	});

	it('finishes what it starts: nothing is ever left taught and never asked', () => {
		// It used to be a bounded *backlog* — the explore quota bent around it and half the
		// review slots were reserved to pay it off. There is no backlog now: the run that
		// teaches a word asks it, so 24 sessions of play leave exactly zero owed.
		for (const seed of [31, 32, 33]) {
			const run = play(24, seed);
			const owed = Object.values(run.byWord).filter((r) => readRecord(r as never).taughtOnly);
			expect(owed).toHaveLength(0);
		}
	});

	it('keeps meeting new words at a steady rate', () => {
		// Five in the first session, three in each of the nine after it. The old model settled
		// on a fixed point of 3.08 a session *and* left three of them never asked.
		const run = play(10, 41);
		expect(new Set(Object.keys(run.byWord)).size).toBe(32);
	});

	it('records nothing at all rather than a lie, when the store cannot note an exposure', () => {
		// An older progress store with no `noteSeen`. Writing `recordAnswer(id, false)` would
		// invent a miss; writing `recordAnswer(id, true)` would invent a success and promote
		// the word to production. Both are the same lie.
		const seen: string[] = [];
		const legacy: ProgressWriter = { recordAnswer: (id) => seen.push(id) };
		const built = build(LEVEL_1, null);
		const taught = built.questions.filter((question) => isIntroduction(question));
		expect(taught).toHaveLength(SESSION_SIZE / 2);
		const results = taught.map((question) => recordOutcome(legacy, question, null));
		expect(new Set(results)).toEqual(new Set(['dropped']));
		expect(seen).toEqual([]);
	});

	it('scores a real question exactly once, right or wrong', () => {
		const answered: [string, boolean][] = [];
		const writer: ProgressWriter = {
			recordAnswer: (id, correct) => answered.push([id, correct]),
			noteSeen: () => answered.push(['NOTED', false])
		};
		const saved = progressState(LEVEL_1.map((w) => mastered(w.id, NOW)));
		const built = build(LEVEL_1, saved);
		for (const question of built.questions) {
			expect(recordOutcome(writer, question, question.word)).toBe('answered');
		}
		expect(answered).toHaveLength(SESSION_SIZE);
		expect(answered.every(([, correct]) => correct)).toBe(true);
	});
});
