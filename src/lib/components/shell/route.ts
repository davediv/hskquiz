import { LEVELS, type Level } from '$lib/types';

/** Which shape of chrome a route gets. */
export type ShellMode = 'home' | 'quiz' | 'browse' | 'other';

/** Everything the shell needs to know about the current URL. */
export interface ShellRoute {
	mode: ShellMode;
	level: Level | null;
	/** Target of the back control, or null on the root route where there is no "back". */
	back: string | null;
	/** Header label. Empty on home, where the wordmark takes the slot instead. */
	heading: string;
	/** Document title. */
	title: string;
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
	const home = `${base}/`;

	if (segments.length === 0) {
		return {
			mode: 'home',
			level: null,
			back: null,
			heading: '',
			title: `${APP_NAME} — ${APP_TAGLINE}`,
			focus: false
		};
	}

	const level = toLevel(segments[1]);

	if (segments[0] === 'quiz' && level !== null) {
		return {
			mode: 'quiz',
			level,
			back: home,
			heading: `HSK ${level}`,
			title: `HSK ${level} practice · ${APP_NAME}`,
			focus: true
		};
	}

	if (segments[0] === 'browse' && level !== null) {
		return {
			mode: 'browse',
			level,
			back: home,
			heading: `HSK ${level} vocabulary`,
			title: `HSK ${level} vocabulary · ${APP_NAME}`,
			focus: false
		};
	}

	return {
		mode: 'other',
		level: null,
		back: home,
		heading: '',
		title: APP_NAME,
		focus: false
	};
}
