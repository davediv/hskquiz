import { MASTERY_STREAK, levelOfId } from '$lib/progress';
import { hasMet } from '$lib/session';
import { SHIPPED_SIZES, SHIPPED_TOTAL } from '$lib/data/sizes';
import type { Level, ProgressState, WordProgress } from '$lib/types';

/** What the level-select screen needs to know about one level's history. */
export interface LevelStats {
	/**
	 * Distinct words at this level the learner has MET — answered, or shown by a teach card.
	 *
	 * `hasMet`, not `seen > 0`. `seen` counts answers, and the first session at any level is
	 * mostly introductions, so gating on it made ten cards just taught read as "0 of 500
	 * practised" beside a `Continue` badge. Everything below this line still counts answers:
	 * an exposure is not an answer, so it must never make a word shaky or dilute accuracy.
	 */
	practised: number;
	/** Of those, how many are on a streak of `MASTERY_STREAK` or better. */
	mastered: number;
	/** Total answers given at this level. */
	answered: number;
	/** Of those, how many were right. */
	correct: number;
	/** 0–1, or null when nothing has been answered here yet. */
	accuracy: number | null;
	/** Words whose most recent answer was wrong (`streak` resets to 0 on a miss). */
	shaky: number;
	sessions: number;
	/** Epoch ms of the last session at this level, 0 if never. */
	lastPlayed: number;
}

export const emptyStats: LevelStats = {
	practised: 0,
	mastered: 0,
	answered: 0,
	correct: 0,
	accuracy: null,
	shaky: 0,
	sessions: 0,
	lastPlayed: 0
};

/** Word ids are `L{level}-{n}`, so a level's records are selectable by prefix alone. */
function prefixOf(level: Level): string {
	return `L${level}-`;
}

function records(state: ProgressState | null | undefined): WordProgress[] {
	const byWord = state?.byWord;
	return byWord ? Object.values(byWord) : [];
}

export function levelStats(state: ProgressState | null | undefined, level: Level): LevelStats {
	if (!state) return emptyStats;

	const prefix = prefixOf(level);
	const stats: LevelStats = { ...emptyStats };

	for (const record of records(state)) {
		if (!record?.wordId?.startsWith(prefix)) continue;
		if (hasMet(record)) stats.practised += 1;
		if (record.seen > 0) {
			if (record.streak === 0) stats.shaky += 1;
			if (record.streak >= MASTERY_STREAK) stats.mastered += 1;
		}
		stats.answered += record.seen;
		stats.correct += record.correct;
	}

	// A record can exist for an official row that ships merged into another card, so the count
	// of records is not automatically a count of cards. Clamped to what the level actually
	// ships, or the card reads "772 of 770". `ProgressStore.levelSummary` clamps the same way.
	const size = SHIPPED_SIZES[level];
	stats.practised = Math.min(stats.practised, size);
	stats.mastered = Math.min(stats.mastered, stats.practised);
	stats.shaky = Math.min(stats.shaky, stats.practised);

	stats.accuracy = stats.answered > 0 ? stats.correct / stats.answered : null;

	const levelRecord = state.levels?.[level];
	stats.sessions = levelRecord?.sessions ?? 0;
	stats.lastPlayed = levelRecord?.lastPlayed ?? 0;

	return stats;
}

/** The one-line "here is where you are" summary above the level list. */
export interface OverallSummary {
	practised: number;
	mastered: number;
	accuracy: number | null;
	sessions: number;
	lastPlayed: number;
	/** False for a first-time visitor — the screen shows a welcome instead of numbers. */
	started: boolean;
}

export function overallSummary(state: ProgressState | null | undefined): OverallSummary {
	const summary: OverallSummary = {
		practised: 0,
		mastered: 0,
		accuracy: null,
		sessions: 0,
		lastPlayed: 0,
		started: false
	};
	if (!state) return summary;

	let answered = 0;
	let correct = 0;
	for (const record of records(state)) {
		// A stored key can name anything — `hello`, `zz-1`, a level this build does not ship —
		// and this headline sits directly over five level cards that each filter by prefix. An
		// unfiltered total is the app contradicting itself in one glance. `ProgressStore`
		// filters the same way; this is the copy the home screen actually renders.
		if (levelOfId(record?.wordId ?? '') === null) continue;
		if (hasMet(record)) summary.practised += 1;
		if (record.seen > 0 && record.streak >= MASTERY_STREAK) summary.mastered += 1;
		answered += record.seen;
		correct += record.correct;
	}

	for (const levelRecord of Object.values(state.levels ?? {})) {
		if (!levelRecord) continue;
		summary.sessions += levelRecord.sessions ?? 0;
		summary.lastPlayed = Math.max(summary.lastPlayed, levelRecord.lastPlayed ?? 0);
	}

	// Same clamp as `levelStats`, against the whole box.
	summary.practised = Math.min(summary.practised, SHIPPED_TOTAL);
	summary.mastered = Math.min(summary.mastered, summary.practised);

	summary.accuracy = answered > 0 ? correct / answered : null;
	summary.started = summary.practised > 0 || summary.sessions > 0;
	return summary;
}

const DAY = 86_400_000;

const formatters = new Map<string, Intl.RelativeTimeFormat>();
function relative(style: 'narrow' | 'long'): Intl.RelativeTimeFormat {
	let formatter = formatters.get(style);
	if (!formatter) {
		formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style });
		formatters.set(style, formatter);
	}
	return formatter;
}

/** Whole calendar days between two instants, so "yesterday" means yesterday. */
function calendarDays(from: number, to: number): number {
	const a = new Date(from);
	const b = new Date(to);
	a.setHours(0, 0, 0, 0);
	b.setHours(0, 0, 0, 0);
	return Math.round((a.getTime() - b.getTime()) / DAY);
}

/**
 * `ts` rendered against `now` as "just now" / "3d ago" / "2 weeks ago".
 * Returns '' for a never-played timestamp so callers can branch on falsiness.
 *
 * A STAMP IN THE FUTURE IS A CLOCK, NOT A DATE. The store floors what it writes to the app's
 * own epoch — it has to, or the decoder cannot read it back — so a device whose clock is set
 * before that floor reads its own last session as years ahead and this printed "in 23y" on
 * the level card. Nothing in this app can be practised later than now, so a forward delta is
 * a disagreement between two clocks and the only honest reading of it is the present.
 */
export function formatWhen(ts: number, now: number, style: 'narrow' | 'long' = 'narrow'): string {
	if (!ts || !now) return '';
	if (ts > now) return 'just now';
	const rtf = relative(style);
	const minutes = Math.round((ts - now) / 60_000);
	if (Math.abs(minutes) < 1) return 'just now';
	if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute');

	const hours = Math.round((ts - now) / 3_600_000);
	if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');

	const days = calendarDays(ts, now);
	if (Math.abs(days) < 7) return rtf.format(days, 'day');
	if (Math.abs(days) < 31) return rtf.format(Math.round(days / 7), 'week');
	if (Math.abs(days) < 365) return rtf.format(Math.round(days / 30), 'month');
	return rtf.format(Math.round(days / 365), 'year');
}

/** Accuracy as a whole percentage, or '' when there is nothing to average. */
export function formatAccuracy(accuracy: number | null): string {
	return accuracy === null ? '' : `${Math.round(accuracy * 100)}%`;
}
