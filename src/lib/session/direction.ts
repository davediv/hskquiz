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
 * The ladder now runs per word, and every word climbs the same four rungs:
 *
 *   introduce         Never shown. Show the whole word — hanzi, tone-marked pinyin, every
 *                     gloss, part of speech — and ask nothing. Nobody can be wrong about a
 *                     word they have not been taught, so nothing about this card is scored.
 *
 *   hanzi-to-meaning  Shown, and owed its first question. This rung is the reason the ladder
 *                     reads `readRecord` rather than `WordProgress.seen`: once an introduction
 *                     is correctly left *unscored*, "shown" and "answered" stop being the same
 *                     number, and a ladder that only knows `seen` re-introduces the word every
 *                     draw for the rest of the learner's life.
 *
 *   hanzi-to-meaning  Answered, but not yet `PRODUCTION_STREAK` right in a row. Recognition is
 *                     the easier task and the right one while a word is still being learned —
 *                     including *after* a lapse, which resets the streak and drops the word
 *                     back to this rung rather than leaving it in the hard direction.
 *
 *   meaning-to-hanzi  A correct recognition behind it: production, which is what knowing a
 *                     word actually means. One question in `REFRESH_EVERY` still comes back as
 *                     recognition, so "quizzing in both directions" is true of a *word* over
 *                     its life and not merely of a session that happens to contain both.
 *
 * Nothing here reads a clock, an rng, or another word. Two learners with the same record for
 * 谢谢 get the same card for it, and a word's direction cannot change because the draw around
 * it changed.
 */

import type { Direction } from '../types';
import { readRecord, type RecordLike } from './record';

/**
 * The shared `Direction` plus the card that only teaches.
 *
 * `introduce` is not in `Direction` because `Direction` is owned by `src/lib/types.ts` and
 * describes which way a *question* runs; an introduction is not a question. A card carries its
 * kind alongside a legal `direction`, so a renderer that has never heard of `introduce` still
 * draws a valid recognition card instead of an empty one.
 */
export type CardKind = Direction | 'introduce';

/**
 * Correct answers in a row before a word is asked in the harder direction.
 *
 * One, not two. At two, measured over 40 simulated learners x 24 real HSK 1 sessions,
 * production was 0.2% of the questions asked: `cardKindFor` promoted at `streak >= 2` while
 * `wordWeight` multiplied by `0.45 ** streak`, so the records that qualified were precisely
 * the records the sampler had already retired, and README's "quizzing in both directions" was
 * false of the shipped app. The two rules were fighting; the ladder lost.
 *
 * One correct recognition is also the honest threshold. The rung below production is not
 * "never asked" — it is "taught, then recognised correctly", and the next thing worth knowing
 * about that word is whether the learner can produce it. A miss resets the streak to 0 and
 * drops the word straight back to recognition, so the ladder corrects itself in one answer
 * rather than punishing a lucky guess for three.
 */
export const PRODUCTION_STREAK = 1;

/** One question in this many sends a word that has earned production back to recognition. */
export const REFRESH_EVERY = 3;

/**
 * A stable per-word offset in `[0, REFRESH_EVERY)`.
 *
 * Without it `answers % REFRESH_EVERY` puts every word first met in the same session on the
 * same phase for the rest of its life, so a whole cohort flips to recognition together and a
 * synthetic cohort - every record identical - sits at 100% of one direction. FNV-1a over the
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
 * The card this word has earned.
 *
 * Reads `readRecord`, not the raw fields, so "has this word been shown?" and "has this word
 * been answered?" are two different questions here exactly as they are in `weighting.ts`. A
 * record that has been *taught* and never *asked* is the second rung, not the first: without
 * that case the ladder never leaves `introduce`, and a learner whose introductions are
 * correctly left unscored is shown ten teach cards a session, forever. (Measured, before this
 * distinction existed: 9,600 of 9,600 cards over 40 learners x 24 sessions were introductions
 * and not one question was ever asked.)
 */
export function cardKindFor(record: RecordLike, wordId?: string): CardKind {
	const facts = readRecord(record);
	if (!facts.met) return 'introduce';
	// Taught, never asked: it is owed its first question, and recognition is that question.
	if (facts.answers <= 0) return 'hanzi-to-meaning';
	if (facts.streak < PRODUCTION_STREAK) return 'hanzi-to-meaning';

	// The id comes from the caller when it has one, and off the sanitised facts otherwise. It
	// used to be read straight off `record.wordId`, which this function's own docstring says it
	// does not do: a record that had lost that field — reachable through `readRecord`, which
	// never required it — fell back to `phase('') = 1` and put every such word on one refresh
	// phase together. `buildSession` always knows the id, so it passes it.
	return (facts.answers + phase(wordId ?? facts.wordId)) % REFRESH_EVERY === 0
		? 'hanzi-to-meaning'
		: 'meaning-to-hanzi';
}

/**
 * The card a word has earned the instant its introduction is recorded.
 *
 * A session teaches a word and then asks it three cards later, so the second card's kind is a
 * function of a record that does not exist yet — the one `noteSeen` is about to write. Rather
 * than hard-coding "recognition" at the call site and letting the two drift, this runs the
 * ladder above against exactly that record: shown, never answered, which is the second rung.
 */
export function kindAfterIntroduction(wordId: string, at: number): CardKind {
	return cardKindFor(
		{ wordId, seen: 0, correct: 0, streak: 0, lastSeen: at, lastMissed: 0 },
		wordId
	);
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
