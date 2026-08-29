/**
 * The progress store: one reactive `$state` object, one versioned `localStorage` key.
 *
 * ## Persistence strategy — debounced whole-blob writes
 *
 * Every mutation marks the store dirty and schedules a write; writes coalesce on a 400 ms
 * trailing debounce with a 2 s ceiling, so a burst of answers costs one `setItem` instead of
 * one per keystroke, and a slow drip still lands within two seconds. Anything that could lose
 * the tab — `pagehide`, `visibilitychange: hidden` — flushes synchronously, and the two
 * destructive operations (`resetLevel`, `resetAll`) write immediately rather than waiting.
 *
 * Incremental per-word writes were the alternative but the brief calls for a single key, and
 * the compact tuple encoding in `progress-core.ts` already keeps the blob to ~200 KB at the
 * absolute worst case of all 4,316 words answered. Typical sessions are two orders of
 * magnitude smaller: only words that have actually been answered get a record.
 *
 * ## Degrading
 *
 * Storage is optional at every step. Server-side rendering, Safari private mode (where
 * `localStorage` exists but throws), a browser with storage disabled, and a full quota all
 * end in the same place: the store keeps working entirely in memory and `persistent` reports
 * `false`. Nothing here throws, and nothing here runs at module scope on the server.
 *
 * ## Not clobbering what we cannot read
 *
 * A write is only ever scheduled by a mutation, never by a load. So corrupt bytes, or a
 * payload from a newer schema, survive untouched until the learner answers a question — at
 * which point their new answers are the better data and win.
 */

import { LEVELS, LEVEL_SIZES, type Level, type ProgressState, type WordProgress } from '$lib/types';
import {
	MASTERY_STREAK,
	STORAGE_KEY,
	applyAnswer,
	blankWord,
	decode,
	emptyState,
	encode,
	levelOfId
} from './progress-core.ts';

/** The slice of the `Storage` API this store needs. Lets tests hand in a fake. */
export interface StorageLike {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

export interface ProgressStoreOptions {
	/** `undefined` auto-detects `localStorage`; `null` forces memory-only. */
	storage?: StorageLike | null;
	now?: () => number;
	debounceMs?: number;
	maxDelayMs?: number;
}

/** What a screen needs to draw a progress figure over a set of words. */
export interface ProgressSummary {
	/** Words the figure is out of: the level's official size, or the list that was passed in. */
	total: number;
	/** Of those, how many have been answered at least once. */
	seen: number;
	/** Of those, how many are on a streak of `MASTERY_STREAK` or better. */
	mastered: number;
	/** Total answers given across the list. */
	answers: number;
	/** Correct answers across the list. */
	correct: number;
	/** `correct / answers`, or 0 before the first answer. */
	accuracy: number;
}

const DEFAULT_DEBOUNCE_MS = 400;
const DEFAULT_MAX_DELAY_MS = 2000;

export class ProgressStore {
	#state = $state(emptyState());
	#persistent = $state(false);

	#storage: StorageLike | null;
	#now: () => number;
	#debounceMs: number;
	#maxDelayMs: number;
	#timer: ReturnType<typeof setTimeout> | null = null;
	#dirty = $state(false);
	#dirtySince = -1;

	constructor(options: ProgressStoreOptions = {}) {
		this.#storage = options.storage === undefined ? detectStorage() : options.storage;
		this.#now = options.now ?? Date.now;
		this.#debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
		this.#maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
		this.#persistent = this.#storage !== null;
		this.reload();
	}

	/** Everything the app persists. Reactive: read it inside `$derived`/markup and it tracks. */
	get state(): ProgressState {
		return this.#state;
	}

	/** False when progress is memory-only: no storage, or a write was rejected. */
	get persistent(): boolean {
		return this.#persistent;
	}

	/** True when a mutation is waiting to be written. */
	get pending(): boolean {
		return this.#dirty;
	}

	/**
	 * The record for a word. Words that have never been answered get a detached zero record —
	 * reading progress must never create it, or a browse screen would balloon the map to every
	 * word it rendered. Mutating the returned object does nothing; call `recordAnswer`.
	 */
	forWord(wordId: string): WordProgress {
		return this.#state.byWord[wordId] ?? blankWord(wordId);
	}

	/** Fold one answer into the word's record. */
	recordAnswer(wordId: string, correct: boolean): void {
		if (typeof wordId !== 'string' || wordId === '') return;

		const existing = this.#state.byWord[wordId];
		const record = existing ?? blankWord(wordId);
		applyAnswer(record, correct, this.#now());
		if (!existing) this.#state.byWord[wordId] = record;

		this.#touch();
	}

	/** Count a finished session against a level, for the level screen. */
	noteSession(level: Level): void {
		if (!LEVELS.includes(level)) return;

		const at = this.#now();
		const entry = this.#state.levels[level];
		if (entry) {
			entry.sessions += 1;
			entry.lastPlayed = at;
		} else {
			this.#state.levels[level] = { sessions: 1, lastPlayed: at };
		}

		this.#touch();
	}

	/**
	 * Forget one level. Word ids carry their level (`L3-0412`), so the level alone is enough;
	 * pass the level's ids to skip the scan or to cover ids that do not follow that shape.
	 */
	resetLevel(level: Level, wordIds?: Iterable<string>): void {
		if (!LEVELS.includes(level)) return;

		delete this.#state.levels[level];
		if (wordIds) {
			for (const wordId of wordIds) delete this.#state.byWord[wordId];
		} else {
			for (const wordId of Object.keys(this.#state.byWord)) {
				if (levelOfId(wordId) === level) delete this.#state.byWord[wordId];
			}
		}

		// Destructive and deliberate: write it now, not in 400 ms.
		this.#dirty = true;
		this.flush();
	}

	/** Forget everything, and take the key with it. */
	resetAll(): void {
		this.#state = emptyState();
		this.#cancelTimer();
		this.#dirty = false;
		this.#dirtySince = -1;

		const storage = this.#storage;
		if (!storage) return;
		try {
			storage.removeItem(STORAGE_KEY);
			// Clearing the key may be exactly what frees a full quota, so give writes another go.
			this.#persistent = true;
		} catch {
			this.#persistent = false;
		}
	}

	/**
	 * A level's figures without loading the level. Word ids carry their level, and only answered
	 * words have records, so this walks what the learner has done rather than all 1,000 words —
	 * which is what lets the level screen render progress before any vocabulary is fetched.
	 */
	levelSummary(level: Level, total: number = LEVEL_SIZES[level] ?? 0): ProgressSummary {
		const summary = blankSummary(total);
		for (const [wordId, record] of Object.entries(this.#state.byWord)) {
			if (levelOfId(wordId) !== level) continue;
			accumulate(summary, record);
		}
		return finishSummary(summary);
	}

	/** The same figures over an explicit word list, for a screen that already has one. O(ids). */
	summarize(wordIds: Iterable<string>): ProgressSummary {
		const summary = blankSummary(0);
		for (const wordId of wordIds) {
			summary.total += 1;
			const record = this.#state.byWord[wordId];
			if (record) accumulate(summary, record);
		}
		return finishSummary(summary);
	}

	/** Write any pending change now. Cheap and safe to call when nothing is dirty. */
	flush(): void {
		this.#cancelTimer();
		this.#dirtySince = -1;
		if (!this.#dirty) return;

		const storage = this.#storage;
		if (!storage) {
			this.#dirty = false;
			return;
		}

		try {
			storage.setItem(STORAGE_KEY, encode(this.#state));
			this.#dirty = false;
			this.#persistent = true;
		} catch {
			// Quota exceeded, storage disabled, private mode. The answer is already in memory and
			// the session carries on; we stop retrying so a full disk cannot throw on every answer.
			this.#dirty = false;
			this.#persistent = false;
		}
	}

	/** Re-read the key, replacing in-memory state with whatever can be read from it. */
	reload(): void {
		const storage = this.#storage;
		if (!storage) return;

		let text: string | null;
		try {
			text = storage.getItem(STORAGE_KEY);
		} catch {
			// Reading threw (Safari private mode): stop touching storage for this session.
			this.#storage = null;
			this.#persistent = false;
			return;
		}

		if (text === null) {
			this.#state = emptyState();
			return;
		}

		const loaded = decode(text);
		// `null` means corrupt or from a newer schema. Keep memory, keep the bytes.
		if (loaded) this.#state = loaded;
	}

	/** Adopt another tab's write, unless this tab has an unsaved change that should win. */
	sync(): void {
		if (this.#dirty) return;
		this.reload();
	}

	#touch(): void {
		this.#dirty = true;
		this.#schedule();
	}

	#schedule(): void {
		if (!this.#storage || !this.#persistent) return;

		const now = this.#now();
		if (this.#dirtySince < 0) this.#dirtySince = now;

		// Trailing debounce, capped so a steady drip of answers still lands within maxDelayMs.
		const waited = now - this.#dirtySince;
		const delay = Math.max(0, Math.min(this.#debounceMs, this.#maxDelayMs - waited));

		this.#cancelTimer();
		this.#timer = setTimeout(() => {
			this.#timer = null;
			this.flush();
		}, delay);
	}

	#cancelTimer(): void {
		if (this.#timer === null) return;
		clearTimeout(this.#timer);
		this.#timer = null;
	}
}

function blankSummary(total: number): ProgressSummary {
	return { total, seen: 0, mastered: 0, answers: 0, correct: 0, accuracy: 0 };
}

function accumulate(summary: ProgressSummary, record: WordProgress): void {
	if (record.seen === 0) return;
	summary.seen += 1;
	summary.answers += record.seen;
	summary.correct += record.correct;
	if (record.streak >= MASTERY_STREAK) summary.mastered += 1;
}

function finishSummary(summary: ProgressSummary): ProgressSummary {
	summary.accuracy = summary.answers ? summary.correct / summary.answers : 0;
	return summary;
}

/** `localStorage`, but only if it is genuinely usable from here. */
function detectStorage(): StorageLike | null {
	try {
		// Reached through `window`, never as a bare global: this module is imported during SSR,
		// and server runtimes have started shipping a `localStorage` global that is not usable
		// (Node 26 defines one that warns and refuses without --localstorage-file).
		if (typeof window === 'undefined') return null;
		const storage: StorageLike | null | undefined = window.localStorage;
		if (!storage) return null;
		// Safari private mode hands back an object that throws on first use, so make it prove it.
		storage.getItem(STORAGE_KEY);
		return storage;
	} catch {
		return null;
	}
}

/**
 * The app-wide singleton. Constructed on import — on the server that is a harmless empty
 * state, since `detectStorage` finds nothing there and no write is ever scheduled.
 */
export const progress = new ProgressStore();

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
	const flush = () => progress.flush();

	// pagehide covers back/forward-cache eviction and tab close; visibilitychange covers the
	// iOS case where the app is swiped away and pagehide never fires. Neither blocks bfcache
	// the way a beforeunload listener would.
	window.addEventListener('pagehide', flush);
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'hidden') flush();
	});

	// Another tab wrote our key (or cleared storage, which reports key === null).
	window.addEventListener('storage', (event) => {
		if (event.key !== null && event.key !== STORAGE_KEY) return;
		progress.sync();
	});
}

export default progress;
