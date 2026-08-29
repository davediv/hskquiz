/**
 * How many cards each level actually ships.
 *
 * This is not `LEVEL_SIZES`. That constant is the official HSK 3.0 row count, and it is the
 * right number to audit the build against — `vocab.spec.ts` does exactly that. It is the
 * wrong number to show a learner: eight official rows are same-level homographs that collapse
 * into one card each (老, 省, 把, 初, 任, 为, 批, 品), so a level ships a word or two fewer than the standard lists.
 *
 * Every screen that counts words for a person — "500 words" on a level card, "1,070 words"
 * on the browse header, the denominator under a session summary's arc — has to use the same
 * figure, or the app contradicts itself across a single tap. Since the mastery arc's
 * denominator lives here too, using the official count would also mean the arc could never
 * fill: there is no tenth-of-a-percent of HSK 2 a learner can ever reach.
 *
 * Written out rather than derived so a screen can name a count without pulling down 640KB of
 * JSON it does not need. `vocab.spec.ts` asserts these against the shipped files, so they
 * cannot drift from what is in the box.
 */
import { LEVELS, type Level } from '$lib/types';

export const SHIPPED_SIZES: Record<Level, number> = { 1: 500, 2: 770, 3: 969, 4: 999, 5: 1070 };

/** Every word this app ships, across all five levels. */
export const SHIPPED_TOTAL = LEVELS.reduce((sum, level) => sum + SHIPPED_SIZES[level], 0);
