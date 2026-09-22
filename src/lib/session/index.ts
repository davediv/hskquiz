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
import { wordWeight } from './weighting';
import { readRecord } from './record';
import {
	cardKindFor,
	directionOf,
	kindAfterIntroduction,
	kindIsScored,
	type CardKind
} from './direction';
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
	kindAfterIntroduction,
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
	 * Show this word as card 1. The rest of the run is the ordinary weighted draw — this does
	 * not change anyone's score, and an unknown id is ignored. For a `?word=` deep link that
	 * has not been wired yet; the route does not pass it.
	 */
	pin?: string;
}

/*
 * There is deliberately no `require: string[]` here, and there was one.
 *
 * It existed so the summary's "Practise these 10" button could name its ten words to the next
 * session instead of asking the scheduler a different question and getting nine of them plus a
 * stranger. It shipped, no screen ever imported it, and driving it directly showed why leaving
 * it in the tree was worse than not having it:
 *
 *   - it wrote its words straight into the picked list, ahead of `takeDistinct`, so
 *     `require: ['L1-0066','L1-0069']` produced one session with two cards whose prompt is the
 *     identical hanzi 地 and different answers marked correct — the exact collision
 *     `takeDistinct` exists to close;
 *   - it never read the record, so ten never-met ids came back as ten `introduce` cards: a
 *     "Practise these 10" that teaches ten and asks nothing.
 *
 * The button does not need it, and since the introduction and its question now ride in the same
 * run there is nothing left for it to name: every word a session teaches, that same session
 * asks. "Practise these 10" is a re-run of words the learner has already answered once, which
 * the ordinary weighted draw is exactly the right thing to choose.
 */

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
 * Cards between a word's introduction and the question it earns.
 *
 * The introduction and its first question ride in the *same* run now: teach 谢谢, deal with
 * three or four other cards, then ask 谢谢. Three is the smallest gap that makes the question
 * recall rather than a copy off the card the learner was looking at two seconds ago, and it is
 * the whole reason a first session is five teach cards and five real questions instead of ten
 * teach cards and nothing asked.
 */
export const INTRO_GAP = 3;

function clamp(value: number, min: number, max: number): number {
	return value < min ? min : value > max ? max : value;
}

/**
 * New-word pairs a session may spend, given how far behind the learner is.
 *
 * `due` is met words whose weight is at or above the unseen reference of 1.0 — the ones that
 * should come back before anything new does. The old `freshTarget` ignored that count and
 * returned 3 forever, so every session was 3 new + 4 review no matter the backlog.
 *
 *   pairs = clamp(round((size / 2) × (1 − due / size)), 0, 3)
 *
 * At `due = 0` this is 3, today's 3+4 run. At `due ≥ size` it is 0. Discovery still never
 * stops dead: while the level has unseen words the floor is 1, so a heavy backlog is one
 * pair (2 cards) + 8 review, and an exhausted level is 10 review.
 *
 * The floor steps up to 2 while the level has a deep unseen pool and fewer than a full
 * session of due reviews. Once the backlog reaches ten, one pair leaves eight review cards
 * so words already introduced can be asked again.
 */
function pairBudget(size: number, due: number, freshAvailable: number): number {
	if (size <= 0 || freshAvailable <= 0) return 0;
	const raw = Math.round((size / 2) * (1 - due / size));
	const floor = freshAvailable > size * 2 && due < size ? 2 : 1;
	return Math.min(freshAvailable, Math.max(clamp(raw, 0, 3), floor));
}

/** How a session's cards are divided. Counted in cards, not in words. */
interface Quota {
	/** Review cards: one card each, for words the learner has answered at least once. */
	readonly review: number;
	/** New words taught *and* asked in this run. Two cards each. */
	readonly pairs: number;
	/** New words with room to teach and none to ask. Only reachable at `size < 2`. */
	readonly teach: number;
}

/**
 * Split the session between words never shown and words already met.
 *
 * The new-word side is a function of `due`, not a constant: review takes every card the pairs
 * do not claim. Either side still backfills the other, so a first session is all-new (five
 * taught, five asked) and an exhausted level is all-review.
 *
 * Words left taught-only by an abandoned run are *not* left to compete on a weight of 1.0
 * against a miss at 12. They are picked first out of the review quota in `buildSession`; the
 * quota itself is what this function sizes.
 */
function splitQuota(
	size: number,
	reviewAvailable: number,
	freshAvailable: number,
	due: number
): Quota {
	// A level with no usable words leaves nothing to split. Falling through would compute a
	// negative review quota and then *backfill* it, handing back a card from a pool the caller
	// was told was empty.
	if (size <= 0) return { review: 0, pairs: 0, teach: 0 };

	const maxPairs = Math.min(freshAvailable, Math.floor(size / 2));
	const filled = (pairs: number) => 2 * pairs + Math.min(reviewAvailable, size - 2 * pairs);
	let pairs = Math.min(maxPairs, pairBudget(size, due, freshAvailable));
	// The review side ran dry — a first session is the extreme case, where it is empty. Spend
	// the cards it cannot fill on more new words rather than handing back a short run. Each one
	// costs two cards, so this grows in pairs and can leave a single card over; the loop stops
	// as soon as another pair would not fit.
	while (pairs < maxPairs && filled(pairs) < size) pairs++;
	const review = Math.min(reviewAvailable, size - 2 * pairs);

	// A pair needs two cards and review has none left to give, so an odd `size` can leave one
	// card over — `size: 7` on a first run is 3 pairs and a spare, and `size: 1` is nothing but
	// a spare. A card is a card: teach a word with it. That word is `taughtOnly` until the next
	// run, where it is picked first out of the review quota rather than waiting on a weight of
	// 1.0. Zero at the default size of ten.
	const teach = Math.max(0, Math.min(freshAvailable - pairs, size - 2 * pairs - review));
	return { review, pairs, teach };
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

/** One card, before its distractors are drawn. */
interface Draft {
	readonly word: Word;
	readonly kind: CardKind;
}

/** A new word's two cards: the one that teaches it and the one that asks it. */
interface Pair {
	readonly intro: Draft;
	readonly ask: Draft;
}

/**
 * Interleave two ordered lists at random, keeping each list's own order.
 *
 * Draws from each side in proportion to what is left of it, so the result is a uniformly
 * random interleaving rather than one list front-loaded into the other.
 */
function weave<T>(a: readonly T[], b: readonly T[], rng: Rng): T[] {
	const out: T[] = [];
	let i = 0;
	let j = 0;
	while (i < a.length || j < b.length) {
		const left = a.length - i + (b.length - j);
		if (j >= b.length || (i < a.length && rng() * left < a.length - i)) out.push(a[i++]);
		else out.push(b[j++]);
	}
	return out;
}

/**
 * Pull `id` to the front of `items` without otherwise changing the order. No-op when it is
 * already first or not present — so a caller can pass this over a shuffled list and only
 * the pinned word moves.
 */
function preferId<T>(items: readonly T[], id: string, of: (item: T) => string): T[] {
	const list = items.slice();
	if (!id) return list;
	const at = list.findIndex((item) => of(item) === id);
	if (at <= 0) return list;
	const [hit] = list.splice(at, 1);
	list.unshift(hit);
	return list;
}

/**
 * Order the run so every introduction sits at least `INTRO_GAP` cards ahead of its question.
 *
 * Two halves. The first holds every introduction, the second holds every first question in the
 * same order, and the one-card entries — review, plus the odd teach-only card — are split at
 * random between them, with however many are needed to reach the gap parked in the seam.
 *
 * Matching the j-th introduction to the j-th question makes the guarantee arithmetic rather
 * than a check on the result. With `p` pairs, `e` singles woven into the head and `t` in the
 * seam, the j-th introduction lands at index `≤ e + j - 1` and the j-th question at
 * `≥ p + e + t + j - 1`, so every gap is at least `p + t` cards wide — and `t` is chosen as
 * `INTRO_GAP - p`, so that is at least `INTRO_GAP`. Nothing is repaired afterwards and no
 * ordering can slip through.
 *
 * A run too short to hold the gap — two cards, on a level with one word left in it — takes the
 * widest gap that fits rather than refusing to build.
 *
 * `pinId` puts that word on card 1 without touching the gap: a pinned pair is drawn first
 * and the head is intros-only, so its teach card is index 0 and every ask still sits `p + t`
 * behind its intro; a pinned single is parked in the tail and then moved to index 0, which
 * shifts every remaining card by one and leaves every gap as it was.
 */
function layout(pairs: readonly Pair[], singles: readonly Draft[], rng: Rng, pinId = ''): Draft[] {
	const drawn = preferId(shuffle(pairs, rng), pinId, (pair) => pair.intro.word.id);
	const rest = shuffle(singles, rng);
	const seam = Math.min(rest.length, Math.max(0, INTRO_GAP - drawn.length));
	const spare = rest.length - seam;
	// `rng()` is `[0, 1)`, so this cannot reach `spare + 1` — clamped anyway, because an
	// injected rng is somebody else's function and a single off-by-one here silently drops a
	// card out of the run.
	const pinnedPair = pinId !== '' && drawn.some((pair) => pair.intro.word.id === pinId);
	// Intros-only head so a pinned teach card is card 1; the seam still holds the gap.
	const early = pinnedPair ? 0 : Math.min(spare, Math.floor(rng() * (spare + 1)));
	const order = [
		...weave(
			drawn.map((pair) => pair.intro),
			rest.slice(0, early),
			rng
		),
		...rest.slice(early, early + seam),
		...weave(
			drawn.map((pair) => pair.ask),
			rest.slice(early + seam),
			rng
		)
	];
	return pinLeading(order, pinId);
}

/**
 * Put `pinId`'s first card at index 0.
 *
 * A pinned pair is already at the front after `layout` draws it first with an intros-only
 * head. A pinned single is moved here: splicing it out of the tail (after every intro) and
 * unshifting it shifts intros and asks by the same +1, so every intro→ask gap is unchanged.
 * Pulling a card from *between* intros is the one move that would shrink a neighbour's gap,
 * and it does not happen — a pinned pair is handled above, and a pinned single is a review
 * card, never an intro.
 */
function pinLeading(order: Draft[], pinId: string): Draft[] {
	if (!pinId) return order;
	const introAt = order.findIndex((draft) => draft.word.id === pinId && draft.kind === 'introduce');
	const at = introAt >= 0 ? introAt : order.findIndex((draft) => draft.word.id === pinId);
	if (at <= 0) return order;
	const next = order.slice();
	const [hit] = next.splice(at, 1);
	next.unshift(hit);
	return next;
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
	const pinId = typeof options.pin === 'string' ? options.pin : '';

	const pool = makePool(words.filter((word) => word.level === level));

	const fresh: Word[] = [];
	/** Met at least once — answered, or taught and then walked out on. */
	const review: Word[] = [];
	/** Taught and walked out on: the review draw takes these first, so they cannot starve. */
	const owed: Word[] = [];
	/** Met and already answered at least once. */
	const answeredReview: Word[] = [];
	/** Met words sitting at or above the unseen reference weight of 1.0. */
	let due = 0;
	for (const word of pool.words) {
		// `met`, not `seen > 0`: an introduction is a real meeting with a word even though it
		// is not an answer, and this is the same reading `cardKindFor` and `wordWeight` use, so
		// the three can never disagree about whether the learner has met a word.
		const facts = readRecord(byWord[word.id]);
		if (!facts.met) {
			fresh.push(word);
			continue;
		}
		review.push(word);
		if (facts.taughtOnly) owed.push(word);
		else answeredReview.push(word);
		if (wordWeight(byWord[word.id], now) >= 1) due++;
	}

	// Capacity is counted in cards, not words, because a new word now brings two of them: a
	// six-word level can still fill a ten-card run.
	const target = Math.min(requestedSize(size), review.length + 2 * fresh.length);
	const quota = splitQuota(target, review.length, fresh.length, due);
	const weightOf = (word: Word) => wordWeight(byWord[word.id], now);

	// Every word in a session goes through `takeDistinct`, with no side door: the one thing that
	// used to bypass it (`options.require`) put two 地 cards in one run. See the note above.
	// A pinned id is walked first so it is in the run; it still has to pass `takeDistinct`.
	const picked: Word[] = [];
	takeDistinct(
		pool,
		picked,
		preferId(orderWeighted(owed, weightOf, rng), pinId, (w) => w.id),
		quota.review
	);
	takeDistinct(
		pool,
		picked,
		preferId(orderWeighted(answeredReview, weightOf, rng), pinId, (w) => w.id),
		quota.review - picked.length
	);
	const reviewWords = picked.slice();
	// Nothing distinguishes one unseen word from another, so this is a plain shuffle — except
	// a pinned unseen word, which is walked first so the pair lands in this run.
	takeDistinct(
		pool,
		picked,
		preferId(
			orderWeighted(fresh, () => 1, rng),
			pinId,
			(w) => w.id
		),
		quota.pairs + quota.teach
	);
	const freshWords = picked.slice(reviewWords.length);

	// The card each word gets comes from that word's own record and nothing else — except the
	// second half of a pair, whose record is the one the introduction three cards back is about
	// to write. `kindAfterIntroduction` asks the same ladder what that record has earned rather
	// than hard-coding the answer here.
	const pairs: Pair[] = freshWords.slice(0, quota.pairs).map((word) => ({
		intro: { word, kind: cardKindFor(byWord[word.id], word.id) },
		ask: { word, kind: kindAfterIntroduction(word.id, now) }
	}));
	const singles: Draft[] = [
		...reviewWords.map((word) => ({ word, kind: cardKindFor(byWord[word.id], word.id) })),
		...freshWords
			.slice(quota.pairs)
			.map((word) => ({ word, kind: cardKindFor(byWord[word.id], word.id) }))
	];

	const order = layout(pairs, singles, rng, pinId);
	// Review answers stay off each other's buttons — a coming question must not hint, and a
	// just-answered one must not contradict. Just-taught words used to be in this set too, so
	// a first question's three wrong answers were never the glosses the learner had just read
	// and the right button was the only familiar one. They compete as distractors now.
	const answerIds = new Set(reviewWords.map((word) => word.id));

	const wantedDistractors = CHOICE_COUNT - 1;
	const questions: SessionQuestion[] = order.map(({ word, kind }) => {
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
 * Put `wordId` on card 1 of an already-built run.
 *
 * Introductions stay ahead of their own question. A word that is not in the run is ignored —
 * this does not change the draw or anyone's weight, so a `?word=` route that needs the word
 * *in* the session should pass `options.pin` to `buildSession` instead.
 */
export function pinFirst(session: BuiltSession, wordId: string): BuiltSession {
	if (!wordId) return session;
	const introAt = session.questions.findIndex(
		(question) => question.word.id === wordId && question.kind === 'introduce'
	);
	const at =
		introAt >= 0 ? introAt : session.questions.findIndex((question) => question.word.id === wordId);
	if (at <= 0) return session;
	const questions = session.questions.slice();
	const [hit] = questions.splice(at, 1);
	questions.unshift(hit);
	const answers = session.answers.slice();
	const [picked] = answers.splice(at, 1);
	answers.unshift(picked);
	return { ...session, questions, answers };
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
