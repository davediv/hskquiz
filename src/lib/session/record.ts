/**
 * How the scheduler reads one saved record.
 *
 * Every other module in this directory used to reach into `WordProgress` and interpret the
 * fields for itself: `weighting.ts` computed `(seen - correct) / seen`, `direction.ts` looked
 * at `seen` and `streak`, `index.ts` split the pool on `seen > 0`. Three readings of the same
 * five numbers, and they did not agree, which is how the app came to tell a brand-new learner
 * "3 of 10 correct · 7 words to review" about ten words it had never taught.
 *
 * There is one reading now, here, and it draws one distinction the persisted shape does not:
 *
 *   **an exposure is not an answer.**
 *
 * An introduction shows a word — hanzi, pinyin, glosses, part of speech — and asks nothing.
 * Nobody can be wrong about a word they have not been taught, so an introduction must never
 * reach `correct`, `streak`, `lastMissed`, an error rate, or a lapse count. But it must reach
 * *something*, or the word is introduced again on the next draw, and again forever.
 *
 * ## Reading an exposure out of a record that was never designed to hold one
 *
 * `WordProgress` (owned by `src/lib/types.ts`) carries no exposure counter, and the store that
 * writes it is another builder's. So this module recognises an exposure in all three shapes it
 * can plausibly arrive in, and every one of them lands on the same facts:
 *
 *   a. **An `exposures` field.** The shape the loop-2 verdict prescribes: `noteSeen` bumps
 *      `exposures` and `lastSeen`, `seen`/`correct` stay answers. Read when present.
 *   b. **A timestamp with no answers.** `seen === 0 && lastSeen > 0` is unreachable through
 *      `applyAnswer`, which always bumps `seen` and `lastSeen` together — so it can only mean
 *      that something stamped the word without answering it. That is an exposure. This is the
 *      shape a `noteSeen` needs no schema change at all to write.
 *   c. **`seen` bumped with no miss to show for it.** `answers > correct` says the learner got
 *      it wrong that many times, and `applyAnswer` stamps `lastMissed` on every miss — so
 *      `misses > 0 && lastMissed === 0` is not a miss record, it is `seen` being used as an
 *      exposure counter. Those "misses" are re-read as exposures rather than as a 100% error
 *      rate. This is the shape the *first* prescription ("gate recordAnswer, add noteSeen")
 *      would have written, and reading it wrong is worth 5.7× on a word's weight.
 *
 * Shape (c) is a repair, not a contract: an ordinary miss whose `lastMissed` was zeroed
 * (a clock so wrong the decoder's epoch floor rejected the stamp) reads here as an exposure
 * and loses its urgency. That degrades a hard word to a neutral one, which is the safe
 * direction — the opposite mistake invents misses.
 *
 * ## Everything else is sanitising
 *
 * The values come from `localStorage`, so they can be anything. Each is coerced to a
 * non-negative integer, `correct` is clamped to `answers` (you cannot be right more often than
 * you answered), and `streak` is clamped to `correct` — `{seen: 1, correct: 0, streak: 99}`
 * used to promote a word the learner had never once got right straight to production.
 */

import type { WordProgress } from '../types';

/**
 * Anything that might be a saved record: the real thing, a half-corrupt object off
 * `localStorage`, or a record carrying the `exposures` counter `WordProgress` does not
 * declare yet. Typed loosely on purpose — this module's whole job is to be the place where
 * an untrustworthy shape becomes trustworthy facts.
 */
export type RecordLike =
	(Partial<WordProgress> & { readonly exposures?: number }) | null | undefined;

/** What the scheduler is allowed to know about a word. Nothing else reads `WordProgress`. */
export interface RecordFacts {
	/** Scored answers given. Never includes an introduction. */
	readonly answers: number;
	/** Of those answers, how many were right. `0 ≤ correct ≤ answers`. */
	readonly correct: number;
	/** `answers - correct`: the lapse count, and the only thing a leech is counted by. */
	readonly misses: number;
	/** Consecutive correct answers, never more than `correct`. */
	readonly streak: number;
	/** Times the word was *shown* without being asked. */
	readonly exposures: number;
	/** Shown at all — answered or merely taught. The opposite of "never met". */
	readonly met: boolean;
	/** Met, and never once answered: taught, and still owed its first question. */
	readonly taughtOnly: boolean;
	/** Epoch ms of the last contact of any kind, or 0. */
	readonly lastSeen: number;
	/** Epoch ms of the last wrong answer, or 0. */
	readonly lastMissed: number;
}

/** The facts about a word nothing has ever touched. */
export const UNMET: RecordFacts = {
	answers: 0,
	correct: 0,
	misses: 0,
	streak: 0,
	exposures: 0,
	met: false,
	taughtOnly: false,
	lastSeen: 0,
	lastMissed: 0
};

/** Any persisted field, coerced to a non-negative integer. `NaN` / `-3` / `'x'` / `∞` → 0. */
function counted(value: unknown): number {
	const n = typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(n) || n <= 0) return 0;
	return Math.floor(n);
}

/** A timestamp, or 0 for "never". Anything non-finite or negative is "never". */
function stamp(value: unknown): number {
	const n = typeof value === 'number' ? value : Number(value);
	return Number.isFinite(n) && n > 0 ? n : 0;
}

function clamp(value: number, min: number, max: number): number {
	return value < min ? min : value > max ? max : value;
}

/**
 * Read a saved record the one way this app reads records.
 *
 * Total: every input, including `null`, a bare string, and an object of `NaN`s, produces a
 * coherent set of facts rather than throwing or leaking a `NaN` into a sort key.
 */
export function readRecord(record: RecordLike): RecordFacts {
	if (!record || typeof record !== 'object') return UNMET;

	const lastSeen = stamp(record.lastSeen);
	const lastMissed = stamp(record.lastMissed);

	let answers = counted(record.seen);
	const correct = clamp(counted(record.correct), 0, answers);
	let exposures = counted(record.exposures);

	// (c) Misses that never stamped a miss were never answers. See the header.
	const unstamped = answers - correct;
	if (unstamped > 0 && lastMissed === 0) {
		exposures += unstamped;
		answers = correct;
	}

	// (b) A record touched by something other than an answer.
	if (answers === 0 && exposures === 0 && lastSeen > 0) exposures = 1;

	const streak = clamp(counted(record.streak), 0, correct);
	const met = answers > 0 || exposures > 0;

	return {
		answers,
		correct,
		misses: answers - correct,
		streak,
		exposures,
		met,
		taughtOnly: met && answers === 0,
		lastSeen,
		lastMissed
	};
}
