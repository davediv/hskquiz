/**
 * Per-word learning state, as a browse screen needs it.
 *
 * The progress store keeps counters; a list row needs one word out of them. Four buckets, the
 * same four the level screen's numbers are built from:
 *
 *   new       never answered
 *   learning  answered, currently on a streak below mastery
 *   shaky     the most recent answer was wrong (`streak` resets to 0 on a miss)
 *   mastered  `MASTERY_STREAK` correct in a row
 *
 * Every bucket is derived from a record the store already holds, so browsing and practising
 * are reading the same numbers rather than two similar ones.
 */

import { MASTERY_STREAK } from '$lib/progress';
import { hasMet, isTaughtOnly } from '$lib/session';
import type { Level, ProgressState, Word, WordProgress } from '$lib/types';

export type WordStatus = 'new' | 'seen' | 'learning' | 'shaky' | 'mastered';

/** Filter buckets in the order the chips appear. `all` is not a status, it is the absence of one. */
export type StatusFilter = 'all' | WordStatus;

export const STATUS_FILTERS: readonly StatusFilter[] = [
	'all',
	'new',
	'seen',
	'learning',
	'shaky',
	'mastered'
];

export interface StatusMeta {
	/** Chip and badge label. */
	label: string;
	/** Spoken to a screen reader after the word, and used as the sheet's status line. */
	description: string;
}

export const STATUS_META: Record<StatusFilter, StatusMeta> = {
	all: { label: 'All', description: 'Every word in this level' },
	new: { label: 'New', description: 'Not practised yet' },
	seen: { label: 'Shown', description: 'Shown by a teach card, not yet tested' },
	learning: { label: 'Learning', description: 'Practised, not yet mastered' },
	shaky: { label: 'Shaky', description: 'Missed last time' },
	mastered: { label: 'Mastered', description: `${MASTERY_STREAK} correct in a row` }
};

/**
 * Which bucket a record falls in. A missing record is a word never met.
 *
 * `seen` counts answers, so a word a teach card introduced has `seen === 0` and used to land in
 * `new` — ten cards just taught read as "500 New". A first exposure is not nothing and it is not
 * an answer either, so it gets its own bucket between the two.
 */
export function statusOf(record: WordProgress | undefined | null): WordStatus {
	if (!record) return 'new';
	if (record.seen <= 0) return isTaughtOnly(record) ? 'seen' : 'new';
	if (record.streak >= MASTERY_STREAK) return 'mastered';
	if (record.streak === 0) return 'shaky';
	return 'learning';
}

/**
 * Ids of one level's shipped words, memoised on the array itself.
 *
 * The word lists are cached module-level in `$lib/data`, so a level's array is the same object
 * for the life of the session and this Set is built exactly once per level. A `WeakMap` rather
 * than a `Map` so a list that is never asked for again is still collectable.
 */
const idSets = new WeakMap<readonly Word[], ReadonlySet<string>>();

function idsOf(words: readonly Word[]): ReadonlySet<string> {
	const cached = idSets.get(words);
	if (cached) return cached;
	const ids = new Set(words.map((word) => word.id));
	idSets.set(words, ids);
	return ids;
}

/**
 * Every answered word at one level, bucketed.
 *
 * Walks the stored records rather than the level's word list, so it costs what the learner has
 * actually done (tens of entries) instead of 1,071 lookups per keystroke. Anything absent from
 * the map is `new` by definition — see `statusFor`.
 *
 * IT IS CHECKED AGAINST THE LIST, NOT JUST THE `L5-` PREFIX. Ids are position-derived, so a
 * store written before the word list changed shape can hold `L5-0143` for a word that no longer
 * sits at 143 — or, after a level gains a word, for a row that has shifted. Counting those gave
 * a screen that contradicted itself in one frame: the chip read `Shaky 50`, the header `0
 * shaky`, and the body `No shaky words in HSK 5 yet`. The Set makes the chip a promise the list
 * can keep: tapping it can never produce fewer rows than its own number.
 */
export function statusMap(
	state: ProgressState | null | undefined,
	level: Level,
	words: readonly Word[]
): Map<string, WordStatus> {
	const map = new Map<string, WordStatus>();
	const byWord = state?.byWord;
	if (!byWord) return map;

	const prefix = `L${level}-`;
	const shipped = idsOf(words);
	for (const [wordId, record] of Object.entries(byWord)) {
		if (!wordId.startsWith(prefix)) continue;
		// A record for a word this level no longer contains is history, not a row.
		if (!shipped.has(wordId)) continue;
		const status = statusOf(record);
		if (status !== 'new') map.set(wordId, status);
	}
	return map;
}

/** The status of one word, given the map above. */
export function statusFor(map: ReadonlyMap<string, WordStatus>, wordId: string): WordStatus {
	return map.get(wordId) ?? 'new';
}

export type StatusCounts = Record<StatusFilter, number>;

/** Chip counts. `new` is whatever the map does not account for. */
export function statusCounts(map: ReadonlyMap<string, WordStatus>, total: number): StatusCounts {
	const counts: StatusCounts = { all: total, new: 0, seen: 0, learning: 0, shaky: 0, mastered: 0 };
	for (const status of map.values()) counts[status] += 1;
	counts.new = Math.max(0, total - counts.seen - counts.learning - counts.shaky - counts.mastered);
	return counts;
}

/**
 * A one-line account of a word's record, for the detail sheet.
 *
 * `seen` is answers, and a teach card shows a word without asking about it, so a word the app
 * introduced ten minutes ago used to read "Not practised yet" here. The bucket it falls in is
 * still `new` — that bucket means "never answered" and the chip row is counted on it — but the
 * line beside the chip says what actually happened.
 */
export function progressLine(record: WordProgress): string {
	if (record.seen <= 0) return hasMet(record) ? 'Shown, not yet tested' : 'Not practised yet';
	const parts = [`Answered ${record.seen} ${record.seen === 1 ? 'time' : 'times'}`];
	parts.push(`${record.correct} correct`);
	if (record.streak > 0) parts.push(`${record.streak} in a row`);
	return parts.join(' · ');
}

/**
 * Which chips the strip should carry, in order.
 *
 * NO `all` CHIP, AND THAT IS THE POINT. Six two-line chips measure 371px of scroll width
 * against a 320px phone, so "40 Mastered" — the one number a returning learner opens this
 * screen for — sat 51px past the right edge behind a fade, and the strip's own header comment
 * had been asserting since loop 4 that everything fit. `all` is the widest of the six (its
 * count is the whole level: `1,070`) and the least informative: it restates the number the
 * level screen, the colophon and the list's own length already give. Dropping it takes the
 * strip to 313px at 320 — inside the viewport with no gesture — and leaves five chips that
 * each say something the others do not.
 *
 * Clearing the filter moves onto the selected chip, which toggles. That is how a filter chip
 * behaves everywhere else, `aria-pressed` already said so, and the empty state still offers a
 * button in the one place a learner can end up with nothing on screen.
 *
 * `new` is always offered, because "how much of this level have I not touched" is a question
 * with a useful answer at zero. The rest appear as the learner reaches them: four chips reading
 * 0 on a first visit are four buttons of noise.
 *
 * Read from the LEVEL's counts, never the search-scoped ones. Scoped, a keystroke that emptied
 * a bucket would delete a chip, the row would change height, and the list under it would jump
 * mid-query. What a chip *says* is scoped; whether it exists is not.
 */
export function visibleFilters(
	available: StatusCounts,
	value: StatusFilter
): readonly WordStatus[] {
	const chips: WordStatus[] = [];
	for (const filter of STATUS_FILTERS) {
		if (filter === 'all') continue;
		if (filter === 'new' || available[filter] > 0 || filter === value) chips.push(filter);
	}
	return chips;
}

/**
 * Whether the strip is worth a row at all.
 *
 * One chip is not a filter, it is a label — on a level nobody has practised the only bucket is
 * `new`, and "500 New" under a header that has just said 500 is the third printing of one
 * number. Below two, the row does not render and the whole screen is one 44px control row.
 */
export function hasChips(chips: readonly WordStatus[]): boolean {
	return chips.length >= 2;
}
