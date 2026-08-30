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
import { readRecord } from './record';
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
export {
	readRecord,
	hasMet,
	isTaughtOnly,
	UNMET,
	type RecordFacts,
	type RecordLike
} from './record';
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
	/**
	 * Word ids this session must ask, ahead of anything the scheduler would have chosen.
	 *
	 * For a caller that has already *named* a set of words to the learner. The summary's
	 * primary button says "Practise these 10" over a list of ten hanzi; before this existed
	 * the only thing behind it was `buildSession(level)` again, which is a scheduler being
	 * asked a different question, and it answered with nine of the ten plus a stranger.
	 *
	 * Ids the level does not contain are ignored, duplicates collapse, and more ids than
	 * `size` are truncated to the first `size` — so a caller can hand over whatever it just
	 * displayed without pre-filtering. Anything left over after the required set is filled by
	 * the ordinary review/explore split, so `require` narrows a session rather than replacing
	 * the model. Passing an empty list is the same as passing nothing.
	 */
	require?: readonly string[];
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
 * How many sessions of review backlog it takes to stop the flow of new words entirely.
 *
 * The explore quota was a flat 40% of every session. That was defensible while a "new word"
 * cost one *question* — it is not, once a new word costs a card that teaches and asks nothing.
 * A learner who meets four words a session and answers six accumulates introductions faster
 * than the review slots can retire them, and every unanswered introduction is a word the app
 * taught and then dropped.
 *
 * So the quota bends: for every word that has been shown and not yet asked, the session takes
 * one fewer new word, reaching zero new words at two sessions' worth of outstanding review.
 * A learner who is keeping up sees the full 40%; one with a backlog spends the session
 * clearing it. `MIN_FRESH` is the floor — discovery slows to a trickle and never stops.
 */
const OWED_SESSIONS = 2;

/** New words a session offers however deep the backlog, as long as any new word exists. */
const MIN_FRESH = 1;

/**
 * Split the session between words never shown and words already met.
 *
 * Review takes its quota first; whatever is left goes to new words; if either pool is too
 * small the other backfills. A first session is therefore all-new, an exhausted level is
 * all-review, and everything in between holds the 60/40 line — less whatever the backlog
 * brake above takes off the explore side.
 */
function splitQuota(size: number, reviewAvailable: number, freshAvailable: number, owed: number) {
	// A caller that named a whole session's worth of words in `require` leaves nothing to split.
	// Falling through would compute a negative review quota and then *backfill* it with a fresh
	// word, handing back one more question than was asked for.
	if (size <= 0) return { review: 0, fresh: 0 };
	const exploreShare = size - Math.round(size * (1 - EXPLORE_SHARE));
	const capacity = Math.max(1, OWED_SESSIONS * (size - exploreShare));
	const brake = Math.max(0, 1 - Math.max(0, owed) / capacity);
	// The brake bends the explore quota; it does not close it. After a first run that taught ten
	// words and asked nothing, owed = 10 and it still let one new word through — `round(4 ×
	// 0.1667) = 1`, and `MIN_FRESH` would have insisted on the same thing anyway. So session 2
	// drilled nine of the ten and introduced an eleventh, deterministically, in 25 of 25 seeds,
	// and that is what stood behind a button reading "Practise these 10".
	//
	// One new word is discovery when the learner is keeping up. It is not discovery when every
	// word they have ever met is still owed its first question — it is a bigger debt, sold as a
	// feature. So when the backlog alone can fill the session, it does, and neither the brake's
	// rounding nor the floor gets a say. The threshold is a whole session's worth precisely so
	// this is rare and self-clearing: one run pays the debt off, `owed` drops under `size`, and
	// the next run is back to the full 40%. Discovery is deferred by exactly one session and
	// never switched off.
	const explore =
		Math.max(0, owed) >= size ? 0 : Math.max(MIN_FRESH, Math.round(exploreShare * brake));

	const reviewQuota = size - explore;
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
	// The held list is the overflow, not a free pass: a candidate is only worth taking on the
	// second pass because a *near*-duplicate beats a short session. An outright duplicate does
	// not — `isAmbiguousWith` returns true for `candidate.id === answer.id`, so a pool carrying
	// the same word twice put it in `held` and this loop pushed it straight back in. Driven on a
	// duplicated list that produced a session asking four words twice. `loadLevel` cannot reach
	// it (all 500 L1 ids are unique), which is exactly why the guard belongs here rather than in
	// a caller that happens to be careful today.
	for (const word of held) {
		if (taken >= want) break;
		if (into.some((other) => other.id === word.id)) continue;
		into.push(word);
		taken++;
	}
}

/**
 * The subset of `pool` a caller named in `options.require`, in the order they named it.
 *
 * Unknown ids, duplicates and a caller that named more words than the session holds are all
 * ordinary — a summary hands over the list it just rendered, and it should not have to know
 * which of those words this level actually carries. Every one of them narrows silently rather
 * than throwing, because the fallback (the scheduler's own choice) is always a valid session.
 */
function requiredWords(
	pool: DistractorPool,
	ids: readonly string[] | undefined,
	cap: number
): Word[] {
	if (!ids || ids.length === 0 || cap <= 0) return [];
	const byId = new Map(pool.words.map((word) => [word.id, word] as const));
	const out: Word[] = [];
	const taken = new Set<string>();
	for (const id of ids) {
		if (out.length >= cap) break;
		if (typeof id !== 'string' || taken.has(id)) continue;
		taken.add(id);
		const word = byId.get(id);
		if (word) out.push(word);
	}
	return out;
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

	// Named by the caller, so they are in before anything competes for a slot. See
	// `SessionOptions.require`.
	const demanded = requiredWords(pool, options.require, target);
	const demandedIds = new Set(demanded.map((word) => word.id));

	const fresh: Word[] = [];
	/** Met, and still owed its first question — the app's own debt. */
	const owed: Word[] = [];
	/** Met and answered at least once: ordinary review, ordered by `wordWeight`. */
	const due: Word[] = [];
	for (const word of pool.words) {
		if (demandedIds.has(word.id)) continue;
		const read = readRecord(byWord[word.id]);
		// `met`, not `seen > 0`: an introduction is a real meeting with a word even though it
		// is not an answer, and this is the same reading `cardKindFor` and `wordWeight` use, so
		// the three can never disagree about whether the learner has met a word.
		if (!read.met) fresh.push(word);
		else if (read.taughtOnly) owed.push(word);
		else due.push(word);
	}

	const weightOf = (word: Word) => wordWeight(byWord[word.id], now);
	const rest = target - demanded.length;
	const quota = splitQuota(rest, owed.length + due.length, fresh.length, owed.length);

	// A word that was taught and never asked is worth 1.0 — deliberately no more, because
	// inflating it is exactly the fabricated urgency this whole change exists to delete. So the
	// debt is paid out of a *quota* rather than a weight, the same way `EXPLORE_SHARE` is: up to
	// half the review slots go to first questions before anything competes on weight. Without
	// it the two rules deadlock — `splitQuota`'s backlog brake throttles new words until the
	// debt is paid, and the debt is never paid because a 1.0 word loses every draw to a 20.0 one,
	// so the session settles at 1.8 new words a session instead of 3.0 and discovery nearly
	// halves.
	const owedOrder = orderWeighted(owed, weightOf, rng);
	const debt = Math.min(owedOrder.length, Math.ceil(quota.review / 2));
	const reviewOrder = [
		...owedOrder.slice(0, debt),
		...orderWeighted([...owedOrder.slice(debt), ...due], weightOf, rng)
	];

	const picked: Word[] = [...demanded];
	takeDistinct(pool, picked, reviewOrder, quota.review);
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
 * The ids of the words a finished run *taught* — introduced whole, asked nothing.
 *
 * The set a summary means when it says "10 new words" and offers to practise them. It is
 * derived here rather than at the call site so the thing counted on the screen and the thing
 * handed to `SessionOptions.require` can never be two different readings of `kind`:
 *
 * ```ts
 * buildSession(words, level, progress, 10, { require: taughtWordIds(session) });
 * ```
 *
 * Order is the order the learner met them in, and duplicates cannot occur because a session
 * never asks one word twice.
 */
export function taughtWordIds(session: Session | null | undefined): string[] {
	const questions = session?.questions ?? [];
	return questions
		.filter((question) => isIntroduction(question))
		.map((question) => question.word.id);
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

/**
 * The one place a card turns into a change to the learner's record.
 *
 * `isScored` says what must happen; this makes it happen, so a screen cannot get it half
 * right. The whole failure this closes was a screen that read the session's questions and
 * never read the decision attached to them: `progress.recordAnswer(...)` ran for all ten
 * cards, introductions included, and a brand-new learner's very first run wrote seven
 * `lastMissed` stamps about words the app had shown once and never asked. The scheduler then
 * ate its own fabricated misses, the home screen reported "accuracy 0", and the browse chips
 * called ten untouched words "Missed last time".
 *
 * Three outcomes, and the caller is told which happened so a summary can count the same way:
 *
 *   `answered`     a real question, folded in as right or wrong.
 *   `introduced`   an introduction: the exposure is noted, and nothing that reads as an
 *                  answer is written.
 *   `dropped`      an introduction, and the store has no way to note an exposure. Nothing is
 *                  written *at all* — a fabricated miss and a fabricated success are the same
 *                  lie pointing in different directions, and the honest answer to "I cannot
 *                  record this" is to record nothing.
 *
 * `dropped` is worse than it sounds and the caller should know it. Nothing written means
 * `readRecord` still says `met: false` next session, so the word is introduced *again* — and
 * again, forever. Driven for real against a writer with no `noteSeen`, five consecutive
 * sessions produced 50 cards, all of them introductions, all dropped, with zero records
 * written: the app teaches and never tests. It is not reachable through the shipped store,
 * which always provides `noteSeen`; it is the shape a learner whose `localStorage` is
 * unusable would get, and the honest name for it is a teach loop, not "a repeat". A caller
 * seeing `dropped` should tell the learner their progress is not being saved (`StorageNotice`
 * already exists for exactly that) rather than let the run look normal.
 */
export type Outcome = 'answered' | 'introduced' | 'dropped';

/**
 * The slice of the progress store this needs. Structural on purpose: the store is another
 * module's, and `noteSeen` may not exist there yet.
 */
export interface ProgressWriter {
	recordAnswer(wordId: string, correct: boolean): void;
	/** Note that the word was shown without being asked: `lastSeen`, and nothing else. */
	noteSeen?(wordId: string): void;
}

/** Fold one card's outcome into the record, honouring `isScored`. See `Outcome`. */
export function recordOutcome(
	writer: ProgressWriter,
	question: Question,
	picked: Word | null
): Outcome {
	const wordId = question.word?.id;
	if (typeof wordId !== 'string' || wordId === '') return 'dropped';
	if (!isScored(question)) {
		if (typeof writer.noteSeen !== 'function') return 'dropped';
		writer.noteSeen(wordId);
		return 'introduced';
	}
	writer.recordAnswer(wordId, isCorrect(question, picked));
	return 'answered';
}

/** Convenience for the demo session behind `?state=summary` and for tests. */
export function seededRng(seed: number): Rng {
	return mulberry32(seed);
}
