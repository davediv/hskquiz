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
import type { Level, ProgressState, Word, WordProgress } from '$lib/types';

export type WordStatus = 'new' | 'learning' | 'shaky' | 'mastered';

/** Filter buckets in the order the chips appear. `all` is not a status, it is the absence of one. */
export type StatusFilter = 'all' | WordStatus;

export const STATUS_FILTERS: readonly StatusFilter[] = [
	'all',
	'new',
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
	learning: { label: 'Learning', description: 'Practised, not yet mastered' },
	shaky: { label: 'Shaky', description: 'Missed last time' },
	mastered: { label: 'Mastered', description: `${MASTERY_STREAK} correct in a row` }
};

/** Which bucket a record falls in. A missing record is a word never answered. */
export function statusOf(record: WordProgress | undefined | null): WordStatus {
	if (!record || record.seen <= 0) return 'new';
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
	const counts: StatusCounts = { all: total, new: 0, learning: 0, shaky: 0, mastered: 0 };
	for (const status of map.values()) counts[status] += 1;
	counts.new = Math.max(0, total - counts.learning - counts.shaky - counts.mastered);
	return counts;
}

/** A one-line account of a word's record, for the detail sheet. */
export function progressLine(record: WordProgress): string {
	if (record.seen <= 0) return 'Not practised yet';
	const parts = [`Answered ${record.seen} ${record.seen === 1 ? 'time' : 'times'}`];
	parts.push(`${record.correct} correct`);
	if (record.streak > 0) parts.push(`${record.streak} in a row`);
	return parts.join(' · ');
}
