import { LEVELS, type Level } from '$lib/types';

/** Which shape of chrome a route gets. */
export type ShellMode = 'home' | 'quiz' | 'browse' | 'other';

/** Everything the shell needs to know about the current URL. */
export interface ShellRoute {
	mode: ShellMode;
	level: Level | null;
	/**
	 * Whether the bar shows a back control. Its destination is always level select, so the
	 * href is resolved in the component rather than pasted together here — `resolve()` is what
	 * applies `base`, and a hand-built string silently drops it.
	 */
	back: boolean;
	/** Header label. Empty on home, where the wordmark takes the slot instead. */
	heading: string;
	/** Document title. */
	title: string;
	/**
	 * The title for the same address once the run on it has FINISHED, or null where that state
	 * does not exist. A finished run is not a separate document — it is `/quiz/3` with the
	 * summary swapped in, and it deliberately keeps one canonical URL (see +layout.svelte) —
	 * so the tab, the history entry and the bookmark are the only three places left that can
	 * tell "10 questions to go" apart from "8 of 10, two to review". They used to be
	 * byte-identical. The shell picks between the two off the same signal it uses to hand the
	 * <h1> over: a focus screen that has rendered a heading of its own is the summary.
	 */
	resultsTitle: string | null;
	/**
	 * A run in progress. Chrome is stripped to a single exit control and the footer is
	 * dropped so the answer buttons own the bottom of the screen.
	 */
	focus: boolean;
}

export const APP_NAME = 'hskquiz';
export const APP_TAGLINE = 'HSK 1–5 vocabulary practice';

function toLevel(segment: string | undefined): Level | null {
	if (segment === undefined) return null;
	const n = Number(segment);
	return LEVELS.find((level) => level === n) ?? null;
}

/**
 * Derive the shell's chrome from a pathname. Pure, so the header, the title and the
 * footer can never disagree about what screen the user is on.
 */
export function readRoute(pathname: string, base = ''): ShellRoute {
	const path = base && pathname.startsWith(base) ? pathname.slice(base.length) : pathname;
	const segments = path.split('/').filter(Boolean);

	if (segments.length === 0) {
		return {
			mode: 'home',
			level: null,
			back: false,
			heading: '',
			title: `${APP_NAME} — ${APP_TAGLINE}`,
			resultsTitle: null,
			focus: false
		};
	}

	const level = toLevel(segments[1]);

	if (segments[0] === 'quiz' && level !== null) {
		return {
			mode: 'quiz',
			level,
			back: true,
			heading: `HSK ${level}`,
			title: `HSK ${level} practice · ${APP_NAME}`,
			resultsTitle: `HSK ${level} results · ${APP_NAME}`,
			focus: true
		};
	}

	if (segments[0] === 'browse' && level !== null) {
		return {
			mode: 'browse',
			level,
			back: true,
			heading: `HSK ${level} vocabulary`,
			title: `HSK ${level} vocabulary · ${APP_NAME}`,
			resultsTitle: null,
			focus: false
		};
	}

	return {
		mode: 'other',
		level: null,
		back: true,
		heading: '',
		title: APP_NAME,
		resultsTitle: null,
		focus: false
	};
}
