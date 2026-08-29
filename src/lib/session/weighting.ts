import type { WordProgress } from '../types';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/**
 * The scheduling model, in one place so it can be argued with.
 *
 * A word's weight is a product of five independent signals. Multiplying rather than adding
 * is deliberate: "shaky" and "seen ages ago" should compound, and "mastered" should be able
 * to suppress a word almost entirely on its own rather than being averaged away.
 *
 *   weight = accuracy × streak × missRecency × rest × stale
 *
 *   accuracy     1 → 5     lifetime error rate. Never right ⇒ 5×.
 *   streak       1 → 0.04  each consecutive correct answer multiplies by 0.45, capped at 4.
 *   missRecency  1 → 5     a miss adds up to 4×, halving every 3 days.
 *   rest         0.2 → 1   a word answered *correctly* in the last 30 min is held back, so
 *                          back-to-back sessions don't replay the same ten cards. A word
 *                          just *missed* is not held back — that is the one to drill.
 *   stale        1 → 3     untouched for a week or more, it climbs back up (forgetting curve).
 *
 * Worked example, the case the brief calls out. Missed 3 of 4, last missed an hour ago:
 * 4 × 1 × 4.96 × 1 × 1.01 ≈ 20. Answered correctly three times running, last seen an hour
 * ago: 1 × 0.091 × 1 × 1 × 1.01 ≈ 0.09. The shaky word is ~215× likelier. An unseen word
 * sits at 1.0 — but unseen words are drawn from their own quota (see EXPLORE_SHARE) rather
 * than competing on weight, so a first session is not a coin flip.
 */
export const WEIGHTS = {
	/** Multiplier added at a 100% error rate. */
	errorGain: 4,
	/** Per-consecutive-correct decay. */
	streakDecay: 0.45,
	/** Beyond this many correct in a row, further decay stops (a word is never unreachable). */
	streakCap: 4,
	/** Multiplier added by a miss that just happened. */
	missBoost: 4,
	/** The miss boost halves every this-many ms. */
	missHalfLifeMs: 3 * DAY,
	/** Window over which a just-answered-correctly word climbs back to full weight. */
	restMs: 30 * MINUTE,
	/** Floor of the rest multiplier — answered correctly seconds ago. */
	restFloor: 0.2,
	/** Time after which an untouched word has gained a full extra 1× of weight. */
	staleMs: 7 * DAY,
	/** Cap on the staleness bonus. */
	staleMax: 2,
	/** Nothing ever reaches zero. */
	floor: 0.02
} as const;

/**
 * Fraction of a session spent on words the learner has never seen.
 *
 * 40/60 explore/exploit, enforced as a quota rather than left to the weights. A learner with
 * 40 of 500 words behind them meets 4 new words every session no matter how much revision is
 * outstanding, and a learner on their very first session — zero misses, nothing to weight —
 * still gets a full session. Either pool backfills the other when it runs dry, so an
 * exhausted level degrades to pure review and a fresh one to pure discovery.
 */
export const EXPLORE_SHARE = 0.4;

function clamp(value: number, min: number, max: number): number {
	return value < min ? min : value > max ? max : value;
}

/** `1` at `dt = 0`, `0.5` at one half-life, asymptotically `0`. */
function halfLife(dt: number, halfLifeMs: number): number {
	if (dt <= 0) return 1;
	return Math.pow(2, -dt / halfLifeMs);
}

/**
 * Selection weight for one word. `undefined` or a zero-`seen` record means never studied.
 *
 * `now` is injected rather than read from the clock so tests — and the demo session behind
 * `?state=summary` — are reproducible.
 */
export function wordWeight(progress: WordProgress | undefined, now: number): number {
	if (!progress || progress.seen <= 0) return 1;

	const seen = progress.seen;
	const correct = clamp(progress.correct, 0, seen);
	const errorRate = (seen - correct) / seen;
	const accuracy = 1 + WEIGHTS.errorGain * errorRate;

	const streak = Math.pow(WEIGHTS.streakDecay, clamp(progress.streak, 0, WEIGHTS.streakCap));

	const missRecency =
		progress.lastMissed > 0
			? 1 + WEIGHTS.missBoost * halfLife(now - progress.lastMissed, WEIGHTS.missHalfLifeMs)
			: 1;

	const sinceSeen = Math.max(0, now - progress.lastSeen);
	// `streak > 0` is exactly "the last answer was correct".
	const rest = progress.streak > 0 ? clamp(sinceSeen / WEIGHTS.restMs, WEIGHTS.restFloor, 1) : 1;
	const stale = 1 + Math.min(sinceSeen / WEIGHTS.staleMs, WEIGHTS.staleMax);

	return Math.max(WEIGHTS.floor, accuracy * streak * missRecency * rest * stale);
}

/**
 * How well the learner knows a word, on an arbitrary ascending scale. Used only to decide
 * which half of a session runs as recognition and which as production.
 */
export function familiarity(progress: WordProgress | undefined): number {
	if (!progress || progress.seen <= 0) return -1;
	const accuracy = progress.correct / progress.seen;
	return progress.streak * 2 + accuracy;
}
