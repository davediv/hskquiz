/**
 * Session construction.
 *
 * Builds a ~10-question practice run for one level: which words, in which direction, with
 * which wrong answers. Everything random goes through an injected `Rng`, so the app gets
 * variety and tests get reproducibility.
 *
 * The scheduling model lives in `weighting.ts`; the direction ladder in `direction.ts`; the
 * distractor model in `distractors.ts`.
 */

import type { Level, ProgressState, Question, Session, Word, WordProgress } from '../types';
import { EXPLORE_SHARE, wordWeight } from './weighting';
import { cardKindFor, directionOf, kindIsScored, type CardKind } from './direction';
import {
	CHOICE_COUNT,
	isAmbiguousWith,
	makePool,
	pickDistractors,
	sharesSense,
	type DistractorPool
} from './distractors';
import { mulberry32, orderWeighted, shuffle, type Rng } from './rng';

export { CHOICE_COUNT, senseSet, sharesSense, isUsable } from './distractors';
export { EXPLORE_SHARE, WEIGHTS, wordWeight, leechBrake } from './weighting';
export {
	PRODUCTION_STREAK,
	REFRESH_EVERY,
	cardKindFor,
	directionOf,
	type CardKind
} from './direction';
export { mulberry32, shuffle, sampleWeighted, orderWeighted, type Rng } from './rng';

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

/**
 * A question plus the kind of card it is.
 *
 * `Question.direction` stays exactly what `src/lib/types.ts` says it is — one of the two ways
 * a *question* can run — and `kind` says whether this card is a question at all. A screen that
 * has never heard of `kind` reads `direction` and draws a normal recognition card, so the
 * extra field can only ever add behaviour, never remove any.
 */
export interface SessionQuestion extends Question {
	readonly kind: CardKind;
}

/** What `buildSession` returns: a plain `Session` whose questions carry their `kind`. */
export interface BuiltSession extends Session {
	questions: SessionQuestion[];
}

function resolveProgress(source: ProgressSource | null | undefined): Record<string, WordProgress> {
	if (!source) return {};
	const state = 'byWord' in source ? source : source.state;
	return state?.byWord ?? {};
}

/**
 * How many questions the caller actually asked for.
 *
 * `NaN`, `-5` and `0` are caller mistakes, not requests for an empty run: `Math.floor(NaN)` is
 * `NaN`, and `NaN` survives `Math.max(0, Math.min(…))` untouched, so the old clamp turned a
 * typo into a session with no questions in it and the quiz screen rendered "HSK 1 has no
 * questions to build from" over a level with 500 words in it. A dead end is the worst possible
 * answer to a bad number, and throwing from the render path is the second worst, so anything
 * that is not a positive finite count falls back to the default length.
 */
function requestedSize(size: number): number {
	if (typeof size !== 'number' || !Number.isFinite(size)) return SESSION_SIZE;
	const floored = Math.floor(size);
	return floored > 0 ? floored : SESSION_SIZE;
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
 * Walk a weighted order and take `want` words that do not answer each other's questions.
 *
 * `isAmbiguousWith` already stops a card carrying two right answers, and `answerIds` already
 * stops one question's answer turning up as another's distractor — but nothing compared the
 * ten *answers* to each other, so a session could ask "the middle / in the middle" (中间) and
 * four cards later "within / middle" (中), with different characters marked correct. Measured
 * over 2,000 L1 sessions: 38 contained a colliding pair and 8 had both halves in production,
 * where the learner reads two near-identical English prompts.
 *
 * Rejects are held rather than dropped: on a level too small to fill the quota without one,
 * a session with a near-duplicate in it still beats a session with nine questions in it.
 * Because the input is a full weighted shuffle, skipping a candidate does not bias what gets
 * taken in its place — every prefix of the order is a correct weighted draw.
 */
function takeDistinct(
	pool: DistractorPool,
	into: Word[],
	candidates: readonly Word[],
	want: number
) {
	let taken = 0;
	const held: Word[] = [];
	for (const word of candidates) {
		if (taken >= want) break;
		if (into.some((other) => isAmbiguousWith(pool, other, word))) {
			held.push(word);
			continue;
		}
		into.push(word);
		taken++;
	}
	for (const word of held) {
		if (taken >= want) break;
		into.push(word);
		taken++;
	}
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
): BuiltSession {
	const rng = options.rng ?? Math.random;
	const now = options.now ?? Date.now();
	const byWord = resolveProgress(progress);

	const pool = makePool(words.filter((word) => word.level === level));
	const target = Math.min(requestedSize(size), pool.words.length);

	const fresh: Word[] = [];
	const review: Word[] = [];
	for (const word of pool.words) {
		const record = byWord[word.id];
		// `> 0` rather than `<= 0`: a corrupt `NaN` seen count reads as never-studied, which is
		// also what `cardKindFor` makes of it, so the two never disagree about a word.
		if (record && record.seen > 0) review.push(word);
		else fresh.push(word);
	}

	const quota = splitQuota(target, review.length, fresh.length);
	const picked: Word[] = [];
	takeDistinct(
		pool,
		picked,
		orderWeighted(review, (word) => wordWeight(byWord[word.id], now), rng),
		quota.review
	);
	// Nothing distinguishes one unseen word from another, so this is a plain shuffle.
	takeDistinct(
		pool,
		picked,
		orderWeighted(fresh, () => 1, rng),
		quota.fresh
	);

	const order = shuffle(picked, rng);
	// A word that is the answer to one question must not turn up as a wrong answer in
	// another: it would either hint at the coming question or contradict the last one.
	const answerIds = new Set(order.map((word) => word.id));

	const wantedDistractors = CHOICE_COUNT - 1;
	const questions: SessionQuestion[] = order.map((word) => {
		// The word's own record decides this, and nothing else — not its rank in this draw.
		const kind = cardKindFor(byWord[word.id]);
		const direction = directionOf(kind);
		let distractors = pickDistractors(pool, word, direction, wantedDistractors, rng, answerIds);
		// On a level too small to spare its own answers, a full card beats a pure one.
		if (distractors.length < wantedDistractors) {
			distractors = pickDistractors(pool, word, direction, wantedDistractors, rng);
		}
		return { word, kind, direction, choices: shuffle([word, ...distractors], rng) };
	});

	return {
		level,
		questions,
		index: 0,
		answers: questions.map(() => null)
	};
}

/**
 * The kind of card `question` is, for a caller holding it as a plain `Question`.
 *
 * The quiz screen's `session` is typed `Session`, so the `kind` a `SessionQuestion` carries is
 * not visible through it. This reads the field when it is there and falls back to the
 * question's direction when it is not, so a `Question` built by hand — a test fixture, a
 * caller that assembled one itself — is simply the question it looks like.
 */
export function cardKind(question: Question): CardKind {
	const kind: unknown = (question as { kind?: unknown }).kind;
	if (kind === 'introduce' || kind === 'hanzi-to-meaning' || kind === 'meaning-to-hanzi') {
		return kind;
	}
	return question.direction;
}

/**
 * True for a word's very first exposure: teach it, do not test it.
 *
 * The card is the reveal shown up front — hanzi, tone-marked pinyin, every gloss, part of
 * speech — with one "Got it" to continue and no choices to get wrong.
 */
export function isIntroduction(question: Question): boolean {
	return cardKind(question) === 'introduce';
}

/**
 * Whether an answer to this card belongs in the learner's record.
 *
 * `false` only for an introduction, and it means exactly one thing to the caller: do not call
 * `progress.recordAnswer` for it. A word nobody has been taught cannot be got wrong, and the
 * `lastMissed` written for one is a miss the app manufactured about itself and then fed back
 * into its own scheduler. Marking it *correct* instead is the same lie pointing the other way:
 * it inflates `correct` and `streak`, and `streak` is what promotes a word to production.
 * The record should gain `seen` and `lastSeen` and nothing else.
 */
export function isScored(question: Question): boolean {
	return kindIsScored(cardKind(question));
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
