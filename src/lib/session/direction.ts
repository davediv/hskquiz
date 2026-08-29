/**
 * Which card a word gets.
 *
 * One rule, read off that word's own record and nothing else.
 *
 * The model this replaces sorted the ten drawn words by familiarity and handed recognition to
 * the better half, which made a word's direction a property of *who else got drawn*. On a
 * first-ever session, where every word is equally unknown, that split half the run into cold
 * production: "PICK THE CHARACTER · flood" over four words the app had never shown. The
 * learner missed, and `applyAnswer` wrote a `lastMissed` the app had manufactured about
 * itself, which then fed the scheduler.
 *
 * The ladder now runs per word, and every word climbs it in the same order:
 *
 *   introduce         Never answered. Show the whole word — hanzi, tone-marked pinyin, every
 *                     gloss, part of speech — and ask nothing. Nobody can be wrong about a
 *                     word they have not been taught, so nothing about this card is scored.
 *
 *   hanzi-to-meaning  Answered, but not yet `PRODUCTION_STREAK` right in a row. Recognition is
 *                     the easier task and the right one while a word is still being learned —
 *                     including *after* a lapse, which resets the streak and drops the word
 *                     back to this rung rather than leaving it in the hard direction.
 *
 *   meaning-to-hanzi  Two correct in a row or better: production, which is what knowing a word
 *                     actually means. Every `REFRESH_EVERY`-th exposure still comes back as
 *                     recognition, so "quizzing in both directions" is true of a *word* over
 *                     its life and not merely of a session that happens to contain both.
 *
 * Nothing here reads a clock, an rng, or another word. Two learners with the same record for
 * 谢谢 get the same card for it, and a word's direction cannot change because the draw around
 * it changed.
 */

import type { Direction, WordProgress } from '../types';

/**
 * The shared `Direction` plus the card that only teaches.
 *
 * `introduce` is not in `Direction` because `Direction` is owned by `src/lib/types.ts` and
 * describes which way a *question* runs; an introduction is not a question. A card carries its
 * kind alongside a legal `direction`, so a renderer that has never heard of `introduce` still
 * draws a valid recognition card instead of an empty one.
 */
export type CardKind = Direction | 'introduce';

/** Consecutive correct answers before a word is asked in the harder direction. */
export const PRODUCTION_STREAK = 2;

/** One exposure in this many sends a mastered word back to recognition. */
export const REFRESH_EVERY = 3;

/** Any field of a persisted record, coerced to a non-negative integer. `NaN`/`-3`/`'x'` → 0. */
function counted(value: unknown): number {
	const n = typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(n) || n <= 0) return 0;
	return Math.floor(n);
}

/**
 * A stable per-word offset in `[0, REFRESH_EVERY)`.
 *
 * Without it `seen % REFRESH_EVERY` puts every word first met in the same session on the same
 * phase for the rest of its life, so a whole cohort flips to recognition together and a
 * synthetic cohort — every record identical — sits at 100% of one direction. FNV-1a over the
 * id: stable across sessions, devices and reloads, which a random phase would not be.
 */
function phase(wordId: string): number {
	let hash = 2166136261;
	for (let i = 0; i < wordId.length; i++) {
		hash ^= wordId.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0) % REFRESH_EVERY;
}

/**
 * The card this word has earned. `undefined`, or any record with nothing answered in it, is a
 * word the learner has never met.
 */
export function cardKindFor(record: WordProgress | null | undefined): CardKind {
	if (!record) return 'introduce';

	const seen = counted(record.seen);
	if (seen <= 0) return 'introduce';
	if (counted(record.streak) < PRODUCTION_STREAK) return 'hanzi-to-meaning';

	const wordId = typeof record.wordId === 'string' ? record.wordId : '';
	return (seen + phase(wordId)) % REFRESH_EVERY === 0 ? 'hanzi-to-meaning' : 'meaning-to-hanzi';
}

/**
 * The legal `Direction` a card of this kind runs in.
 *
 * An introduction shows the hanzi and reads out its meaning, so it degrades to recognition:
 * a screen that ignores `kind` renders a sane card rather than a broken one.
 */
export function directionOf(kind: CardKind): Direction {
	return kind === 'meaning-to-hanzi' ? 'meaning-to-hanzi' : 'hanzi-to-meaning';
}

/** Whether an answer to a card of this kind may be folded into the learner's record. */
export function kindIsScored(kind: CardKind): boolean {
	return kind !== 'introduce';
}
