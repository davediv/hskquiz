import { readRecord, type RecordLike } from './record';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/**
 * The scheduling model, in one place so it can be argued with.
 *
 * A word's weight is a product of six independent signals. Multiplying rather than adding
 * is deliberate: "shaky" and "seen ages ago" should compound, and "mastered" should be able
 * to suppress a word almost entirely on its own rather than being averaged away.
 *
 *   weight = accuracy × streak × missRecency × rest × stale × fatigue
 *
 *   accuracy     1 → 5      lifetime error rate. Never right ⇒ 5×.
 *   streak       1 → 0.04   each consecutive correct answer multiplies by 0.45, capped at 4.
 *   missRecency  1 → 5      a miss adds up to 4×, halving every 3 days.
 *   rest         0.2 → 1    a word answered *correctly* in the last 30 min is held back, so
 *                           back-to-back sessions don't replay the same ten cards. A word
 *                           just *missed* is not held back — that is the one to drill.
 *   stale        1 → 3      untouched for a week or more, it climbs back up (forgetting curve).
 *   fatigue      1 → 0.02   the leech brake. Past `leechLapses` misses it divides the weight
 *                           down; see below.
 *
 * Worked example, the case the brief calls out. Missed 3 of 4, last missed an hour ago:
 * 4 × 1 × 4.96 × 1 × 1.01 × 1 ≈ 20. Answered correctly three times running, last seen an hour
 * ago: 1 × 0.091 × 1 × 1 × 1.01 × 1 ≈ 0.09. The shaky word is ~215× likelier. An unseen word
 * sits at 1.0 — but unseen words are drawn from their own quota (see EXPLORE_SHARE) rather
 * than competing on weight, so a first session is not a coin flip.
 *
 * ## Every signal is read off answers, and an introduction is not an answer
 *
 * Five of the six terms are functions of the learner's *answers*: an error rate, a streak, a
 * miss stamp, a rest window that only a correct answer opens, a lapse count. A card that only
 * teaches produces none of those, and the moment the app started leaving introductions
 * unscored, `seen` stopped being the number of answers and every one of the five was reading
 * the wrong number. So the record is read through `readRecord`, which separates the two, and
 * the *only* input to `accuracy` and `fatigue` here is `misses` — answers given minus answers
 * right. A word that has been taught and not yet asked has no accuracy and no lapses: it
 * enters at 1.000, exactly where an unseen word sits, and climbs only on `stale`.
 *
 * ## Why `fatigue` exists
 *
 * The first five signals are *saturating*: the error rate hits 1.0 on a word's very first
 * miss, so `missed 1 of 1` and `missed 20 of 20` two days ago both come out at 22.628, and the
 * whole product is bounded at 5 × 1 × 5 × 1 × 3 = 75. A word the learner genuinely cannot
 * learn is therefore arithmetically indistinguishable from one they fumbled once, and it never
 * falls out of the top of the queue: measured over 60 real sessions at one-day spacing, three
 * such words appeared in 19, 22 and 21 of them and took 10.3% of all 600 questions, while the
 * hardest ordinary word appeared 8 times and the median word once.
 *
 * Drilling misses is the whole brief ("weighted toward past misses"). Never letting one go is
 * not — it is the single most demoralising thing a practice app can do, and it spends a tenth
 * of every session on the four words the learner most needs a break from. Anki suspends a card
 * at 8 lapses and hands it to the human. There is nowhere in this app to hand it to, so
 * `fatigue` rests the word instead of suspending it: past `leechLapses` misses each further
 * miss divides the weight by a little more, down to a floor that still leaves it reachable.
 * A 20-miss leech lands at 0.056× — under an ordinary shaky word rather than above it — and the
 * brake stops tightening the moment the learner starts getting it right. Re-measured on the same
 * 60-session run: the three words appear in 7, 9 and 8 sessions rather than 19, 22 and 21, and
 * take 4.0% of the questions rather than 10.3% — at or under the hardest ordinary word, which
 * appears 8 times, and still ~4× the median word, which appears twice.
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
	/** Misses a word may accumulate before the scheduler starts resting it. */
	leechLapses: 6,
	/** How hard each miss past that one divides the weight. */
	leechDamp: 1.2,
	/** Floor of the leech brake, so even a hopeless word is reachable. */
	leechFloor: 0.02,
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

/** `value` when it is a real number, `fallback` when it is `NaN`, `Infinity` or not a number. */
function finite(value: number, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** `1` at `dt = 0`, `0.5` at one half-life, asymptotically `0`. */
function halfLife(dt: number, halfLifeMs: number): number {
	if (dt <= 0) return 1;
	return Math.pow(2, -dt / halfLifeMs);
}

/**
 * Selection weight for one word. `undefined`, or a record nothing has ever touched, is a word
 * the learner has never met and sits at the reference weight of 1.
 *
 * `now` is injected rather than read from the clock so tests — and the demo session behind
 * `?state=summary` — are reproducible.
 */
export function wordWeight(progress: RecordLike, now: number): number {
	// One reading of the record, shared with `direction.ts` and with the pool split in
	// `index.ts`, so the three can never disagree about what a word's history says. It is also
	// where every field is sanitised: `decode()` already does that for anything read out of
	// storage, but records are mutated in place by the progress store and this function is
	// exported, so a `NaN` seen count is reachable from outside — and a `NaN` weight does not
	// merely mis-order the draw, it makes the sort comparator useless.
	const facts = readRecord(progress);
	if (!facts.met) return 1;

	// An exposure is not an answer, so a word that has only been *taught* has no error rate to
	// read: `(seen - correct) / seen` over an introduction is 1.0, a 100% error rate invented
	// out of a card the learner was never asked to answer, and it was worth 5.714 against an
	// unseen word's 1.000 — an introduction made a word 5.7x more urgent than never showing it
	// at all, and 10 subsequent perfect answers never washed it out (0.064 against a clean
	// 0.047). With no answers behind it every term below is neutral and the weight collapses to
	// `stale` alone: 1.000 the moment it is taught, rising the same way any other forgotten word
	// rises, capped at 3.0.
	const errorRate = facts.answers > 0 ? facts.misses / facts.answers : 0;
	const accuracy = 1 + WEIGHTS.errorGain * errorRate;

	const streak = Math.pow(WEIGHTS.streakDecay, clamp(facts.streak, 0, WEIGHTS.streakCap));

	const missRecency =
		facts.lastMissed > 0
			? 1 + WEIGHTS.missBoost * halfLife(now - facts.lastMissed, WEIGHTS.missHalfLifeMs)
			: 1;

	const sinceSeen = Math.max(0, now - facts.lastSeen);
	// `streak > 0` is exactly "the last answer was correct".
	const rest = facts.streak > 0 ? clamp(sinceSeen / WEIGHTS.restMs, WEIGHTS.restFloor, 1) : 1;
	const stale = 1 + Math.min(sinceSeen / WEIGHTS.staleMs, WEIGHTS.staleMax);

	const fatigue = leechBrake(facts.misses);

	const weight = accuracy * streak * missRecency * rest * stale * fatigue;
	return Number.isFinite(weight) ? Math.max(WEIGHTS.floor, weight) : WEIGHTS.floor;
}

/**
 * How much a word's weight is divided by for being a leech.
 *
 * `WordProgress` carries no lapse counter, but `readRecord`'s `misses` — answers given minus
 * answers right, with introductions excluded from both — is exactly the number of times the
 * learner has got this word wrong, which is the same quantity Anki suspends on. Below the
 * threshold this is a flat 1 and the model is unchanged; above it the divisor grows linearly,
 * so the weight falls hyperbolically rather than off a cliff — 7 misses is 0.455×, 10 is 0.172×,
 * 20 is 0.056×, and past 41 the floor holds it at 0.02×.
 */
export function leechBrake(misses: number): number {
	const over = Math.max(0, finite(misses, 0) - WEIGHTS.leechLapses);
	if (over <= 0) return 1;
	return Math.max(WEIGHTS.leechFloor, 1 / (1 + over * WEIGHTS.leechDamp));
}
