/**
 * Session construction.
 *
 * Builds a ~10-question practice run for one level: which words, in which direction, with
 * which wrong answers. Everything random goes through an injected `Rng`, so the app gets
 * variety and tests get reproducibility.
 *
 * The scheduling model lives in `weighting.ts`; the distractor model in `distractors.ts`.
 */

import type {
	Direction,
	Level,
	ProgressState,
	Question,
	Session,
	Word,
	WordProgress
} from '../types';
import { EXPLORE_SHARE, familiarity, wordWeight } from './weighting';
import { CHOICE_COUNT, makePool, pickDistractors, sharesSense } from './distractors';
import { mulberry32, sampleWeighted, shuffle, type Rng } from './rng';

export { CHOICE_COUNT, senseSet, sharesSense, isUsable } from './distractors';
export { EXPLORE_SHARE, WEIGHTS, wordWeight, familiarity } from './weighting';
export { mulberry32, shuffle, sampleWeighted, type Rng } from './rng';

/** Questions per session, unless a caller asks for a different count. */
export const SESSION_SIZE = 10;

/**
 * `buildSession` accepts either the plain persisted state or the progress store that wraps
 * it, so a caller can pass `progress` or `progress.state` without thinking about it.
 */
export type ProgressSource = ProgressState | { readonly state: ProgressState };

export interface SessionOptions {
	/** Injected randomness. Defaults to `Math.random`. */
	rng?: Rng;
	/** Epoch ms used for every recency calculation. Defaults to `Date.now()`. */
	now?: number;
}

function resolveProgress(source: ProgressSource | null | undefined): Record<string, WordProgress> {
	if (!source) return {};
	const state = 'byWord' in source ? source : source.state;
	return state?.byWord ?? {};
}

/**
 * Split the session between words never seen and words already met.
 *
 * Review takes its quota first; whatever is left goes to new words; if either pool is too
 * small the other backfills. A first session is therefore all-new, an exhausted level is
 * all-review, and everything in between holds the 60/40 line.
 */
function splitQuota(size: number, reviewAvailable: number, freshAvailable: number) {
	const reviewQuota = size - Math.round(size * EXPLORE_SHARE);
	let review = Math.min(reviewQuota, reviewAvailable);
	let fresh = Math.min(size - review, freshAvailable);
	const short = size - review - fresh;
	if (short > 0) review = Math.min(reviewAvailable, review + short);
	if (review + fresh < size) fresh = Math.min(freshAvailable, size - review);
	return { review, fresh };
}

/**
 * Assign directions across the chosen words.
 *
 * Half recognition, half production — but not at random. Recognition (see the hanzi, pick
 * the meaning) is the easier task, so it goes to the words the learner knows least well,
 * which in practice means every brand-new word is *introduced* rather than tested cold.
 * Production goes to the words they have already got right. The overall split stays 50/50,
 * so a session is always mixed.
 */
function assignDirections(words: readonly Word[], byWord: Record<string, WordProgress>, rng: Rng) {
	const jitter = new Map(words.map((word) => [word.id, rng()]));
	const ordered = words
		.slice()
		.sort(
			(a, b) =>
				familiarity(byWord[a.id]) - familiarity(byWord[b.id]) ||
				(jitter.get(a.id) ?? 0) - (jitter.get(b.id) ?? 0)
		);
	const recognitionCount = Math.ceil(ordered.length / 2);
	const directions = new Map<string, Direction>();
	ordered.forEach((word, i) => {
		directions.set(word.id, i < recognitionCount ? 'hanzi-to-meaning' : 'meaning-to-hanzi');
	});
	return directions;
}

/**
 * Build a practice session for `level`.
 *
 * @param words    the level's vocabulary — entries from other levels are ignored, so a
 *                 caller may pass a combined list
 * @param level    the level being practised
 * @param progress the learner's saved progress, or the store holding it
 * @param size     how many questions to aim for; capped by how many usable words exist
 */
export function buildSession(
	words: readonly Word[],
	level: Level,
	progress: ProgressSource | null | undefined,
	size: number = SESSION_SIZE,
	options: SessionOptions = {}
): Session {
	const rng = options.rng ?? Math.random;
	const now = options.now ?? Date.now();
	const byWord = resolveProgress(progress);

	const pool = makePool(words.filter((word) => word.level === level));
	const target = Math.max(0, Math.min(Math.floor(size), pool.words.length));

	const fresh: Word[] = [];
	const review: Word[] = [];
	for (const word of pool.words) {
		const record = byWord[word.id];
		if (!record || record.seen <= 0) fresh.push(word);
		else review.push(word);
	}

	const quota = splitQuota(target, review.length, fresh.length);
	const picked = [
		...sampleWeighted(review, (word) => wordWeight(byWord[word.id], now), quota.review, rng),
		// Nothing distinguishes one unseen word from another, so this is a plain shuffle.
		...sampleWeighted(fresh, () => 1, quota.fresh, rng)
	];

	const directions = assignDirections(picked, byWord, rng);
	const order = shuffle(picked, rng);
	// A word that is the answer to one question must not turn up as a wrong answer in
	// another: it would either hint at the coming question or contradict the last one.
	const answerIds = new Set(order.map((word) => word.id));

	const wanted = CHOICE_COUNT - 1;
	const questions: Question[] = order.map((word) => {
		const direction = directions.get(word.id) ?? 'hanzi-to-meaning';
		let distractors = pickDistractors(pool, word, direction, wanted, rng, answerIds);
		// On a level too small to spare its own answers, a full card beats a pure one.
		if (distractors.length < wanted) {
			distractors = pickDistractors(pool, word, direction, wanted, rng);
		}
		return { word, direction, choices: shuffle([word, ...distractors], rng) };
	});

	return {
		level,
		questions,
		index: 0,
		answers: questions.map(() => null)
	};
}

/**
 * Whether `picked` answers `question`.
 *
 * Identity is the real test. The second clause is a safety net for homographs: the official
 * list carries 打 three times as three entries, and if some other caller ever built choices
 * without `buildSession`'s ambiguity filter, an entry that renders identically to the answer
 * should still be marked right rather than punishing the learner for the data's shape.
 */
export function isCorrect(question: Question, picked: Word | null): boolean {
	if (!picked) return false;
	if (picked.id === question.word.id) return true;
	return picked.hanzi === question.word.hanzi && sharesSense(picked, question.word);
}

/** Convenience for the demo session behind `?state=summary` and for tests. */
export function seededRng(seed: number): Rng {
	return mulberry32(seed);
}
