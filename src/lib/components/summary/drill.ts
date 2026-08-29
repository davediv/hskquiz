/**
 * The re-test the summary screen owes you.
 *
 * WHY THIS EXISTS
 * The summary is headed "3 words to review" and, until this file, contained no way to review
 * anything: the only primary was "Practise 10 more", which is `buildSession` drawing a fresh
 * weighted run — six review slots shared across every word you have ever met plus four brand
 * new ones. The three words just missed are *likely* to come back and guaranteed to be diluted
 * when they do. Du Chinese's equivalent card offers Forgot / Almost / Got it on the word in
 * front of you; Pleco's row pushes into the entry. Ours printed a receipt.
 *
 * So the missed words get their own run, right here, of exactly them and nothing else — no
 * quota, no weighting, no fresh pool. `buildSession` cannot express that: it takes a level's
 * vocabulary and decides for itself which words earn a slot, and handing it only three words
 * would leave `makePool` with three words to draw distractors from, so every card would carry
 * the other two misses as its wrong answers. This builds the cards directly instead, and takes
 * its distractors from the run that just finished.
 *
 * WHERE THE WRONG ANSWERS COME FROM
 * The finished session is itself a distractor pool: ten questions × four choices is up to forty
 * level-appropriate words the learner has just read, already filtered by `buildSession`'s
 * ambiguity rules. Drawing from it needs no second data fetch and no second copy of the
 * distractor model — and it means the drill can run the instant the summary paints, including
 * offline.
 *
 * THE ONE HAND-PLACED CHOICE
 * The word they picked instead is seeded into its own card's choices first, whenever it is
 * still eligible. Breaking that specific confusion — 那儿 against the 有的 that got picked for
 * it — is the entire point of a re-test, and leaving it to chance means two thirds of drills
 * quietly drop the thing being drilled.
 */

import type { Direction, Question, Word } from '$lib/types';
import { CHOICE_COUNT, sharesSense, shuffle, type Rng } from '$lib/session';

/**
 * One card of a drill.
 *
 * Deliberately a `Question` and nothing more, so `choiceStatus`, `isCorrect` and
 * `verdictAnnouncement` read a drill card and a quiz card identically — the drill cannot drift
 * away from the quiz's idea of what "right" means.
 */
export type DrillCard = Question;

/** What the summary knows about one missed question, and all the drill needs from it. */
export interface DrillSeed {
	word: Word;
	direction: Direction;
	/** What was chosen instead. `null` for a question that ran out of run. */
	picked: Word | null;
}

/**
 * Every distinct word the finished run put on screen — answers and wrong answers alike.
 *
 * Insertion order is the run's order, which is already a shuffle, so callers that take a prefix
 * of it are not taking an alphabetical slice of the level.
 */
export function drillPool(questions: readonly Question[]): Word[] {
	const byId = new Map<string, Word>();
	for (const question of questions) {
		byId.set(question.word.id, question.word);
		for (const choice of question.choices) byId.set(choice.id, choice);
	}
	return [...byId.values()];
}

/**
 * Whether `candidate` can be a wrong answer to a question about `word`.
 *
 * Two words that share a sense make a card with two right answers on it, and a homograph makes
 * a card the learner cannot answer at all. `sharesSense` is the session engine's own test, so
 * a drill card is wrong in exactly the ways a quiz card is wrong.
 */
function usableAgainst(word: Word, candidate: Word): boolean {
	if (candidate.id === word.id) return false;
	if (candidate.hanzi === word.hanzi) return false;
	return !sharesSense(candidate, word);
}

function takeUpTo(into: Word[], taken: Set<string>, candidates: readonly Word[], want: number) {
	for (const candidate of candidates) {
		if (into.length >= want) return;
		if (taken.has(candidate.id)) continue;
		taken.add(candidate.id);
		into.push(candidate);
	}
}

/**
 * Build one card per seed, in the order the seeds arrive — which is the order the cards are
 * already stacked on the screen above, so the drill walks down the page rather than reshuffling
 * the three words the learner has just been reading.
 *
 * A second drill of the same words is a *different* set of wrong answers, because `rng` defaults
 * to `Math.random`: re-answering by elimination stops working on the second pass.
 */
export function buildDrill(
	seeds: readonly DrillSeed[],
	pool: readonly Word[],
	rng: Rng = Math.random
): DrillCard[] {
	// No card may carry another card's answer: it would either hint at a question still to come
	// or contradict one already answered.
	const answerIds = new Set(seeds.map((seed) => seed.word.id));
	const wanted = CHOICE_COUNT - 1;

	return seeds.map((seed) => {
		const word = seed.word;
		const eligible = pool.filter(
			(candidate) => !answerIds.has(candidate.id) && usableAgainst(word, candidate)
		);

		const distractors: Word[] = [];
		const taken = new Set<string>();

		// The confusion being drilled goes in first, if it survived the filters above.
		if (seed.picked && eligible.some((candidate) => candidate.id === seed.picked?.id)) {
			takeUpTo(distractors, taken, [seed.picked], wanted);
		}
		takeUpTo(distractors, taken, shuffle(eligible, rng), wanted);

		// A level small enough to leave the card short would rather show a near-synonym than
		// three buttons: a two-choice card is a coin toss the learner can win by accident.
		if (distractors.length < wanted) {
			const relaxed = pool.filter(
				(candidate) => candidate.id !== word.id && !answerIds.has(candidate.id)
			);
			takeUpTo(distractors, taken, shuffle(relaxed, rng), wanted);
		}

		return { word, direction: seed.direction, choices: shuffle([word, ...distractors], rng) };
	});
}

/** How a finished drill reads in one line: `2 of 3 right`, and whether it cleared the list. */
export interface DrillTally {
	right: number;
	total: number;
	cleared: boolean;
}

export function tallyDrill(outcomes: ReadonlyMap<string, boolean>): DrillTally {
	let right = 0;
	for (const correct of outcomes.values()) if (correct) right++;
	return { right, total: outcomes.size, cleared: outcomes.size > 0 && right === outcomes.size };
}
