/**
 * The progress store: one reactive `$state` object, one versioned `localStorage` key.
 *
 * ## The write contract
 *
 * `localStorage` is a *shared* key with no transaction, and `setItem` is allowed to fail. So
 * there is exactly one durable write path — `flush()` — and it always does the same four
 * things, in this order:
 *
 *   1. **read** the key's current bytes;
 *   2. **rescue** them to `hskquiz:progress:broken` if they cannot be decoded, once, before
 *      anything else touches them;
 *   3. **merge** what is there with what we hold, three-way, against the snapshot we last
 *      agreed on — so another tab's answers survive, and a reset survives another tab;
 *   4. **write** the merge, adopt it into memory, and record it as the new common ancestor.
 *
 * Nothing else writes. `resetLevel` and `resetAll` go through the same path, differing only in
 * that they stamp a tombstone (see `progress-core.ts`) rather than deleting and hoping.
 *
 * ## Scheduling, and failing out loud
 *
 * Every mutation marks the store dirty and schedules a write; writes coalesce on a 400 ms
 * trailing debounce with a 2 s ceiling, so a burst of answers costs one `setItem` instead of
 * one per keystroke, and a slow drip still lands within two seconds. Anything that could lose
 * the tab — `pagehide`, `visibilitychange: hidden` — flushes synchronously.
 *
 * A rejected write is not the end of persistence. The store stays dirty, `status` goes to
 * `'failing'`, and the write is re-armed on a 1 s → 5 s → 30 s backoff, because the usual
 * causes (a full quota, a locked profile) are conditions that clear. What it must never do
 * again is what it used to do: latch persistence off after one throw and say nothing, so that
 * a tab killed by iOS silently took every answer since with it.
 *
 * `status` and `salvaged` exist to be *rendered* — `StorageNotice.svelte` is the one line of
 * UI that does it. A store that knows it is not saving and tells no one is the failure mode
 * this whole file is arranged around.
 *
 * ## Degrading
 *
 * Storage is optional at every step. Server-side rendering, Safari private mode (where
 * `localStorage` exists but throws), a browser with storage disabled, and a full quota all
 * end in the same place: the store keeps working entirely in memory and says so. Nothing here
 * throws, and nothing here runs at module scope on the server.
 */

import { LEVELS, type Level, type ProgressState, type WordProgress } from '$lib/types';
import { SHIPPED_SIZES } from '$lib/data/sizes';
import {
	BACKUP_KEY,
	MASTERY_STREAK,
	STORAGE_KEY,
	type StoredProgress,
	type Tombstones,
	applyAnswer,
	blankWord,
	decodeStored,
	emptyState,
	emptyStored,
	encode,
	isUsableWordId,
	levelOfId,
	mergeProgress,
	ownRecord,
	snapshot
} from './progress-core.ts';

/** The slice of the `Storage` API this store needs. Lets tests hand in a fake. */
export interface StorageLike {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

/**
 * Where the learner's progress actually lives right now.
 *
 * `'saving'` — writes are landing. `'unavailable'` — there is no usable storage at all (SSR,
 * private mode, storage disabled), so this session is memory-only and will be lost on close.
 * `'failing'` — storage exists but rejected the last write (a full quota, most likely); we are
 * still retrying, and the answers so far are only in memory.
 */
export type StorageStatus = 'saving' | 'unavailable' | 'failing';

export interface ProgressStoreOptions {
	/** `undefined` auto-detects `localStorage`; `null` forces memory-only. */
	storage?: StorageLike | null;
	now?: () => number;
	debounceMs?: number;
	maxDelayMs?: number;
	/** Backoff schedule after a rejected write. The last entry repeats. */
	retryDelaysMs?: readonly number[];
}

/** What a screen needs to draw a progress figure over a set of words. */
export interface ProgressSummary {
	/** Words the figure is out of: the level's official size, or the list that was passed in. */
	total: number;
	/** Of those, how many have been answered at least once. Never more than `total`. */
	seen: number;
	/** Of those, how many are on a streak of `MASTERY_STREAK` or better. Never more than `seen`. */
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
/** A full quota clears when another tab closes; a locked profile clears when it unlocks. */
const DEFAULT_RETRY_DELAYS_MS = [1000, 5000, 30_000] as const;

/** What `#read` found in the key: the exact bytes, and them decoded if they could be. */
interface DiskRead {
	text: string | null;
	stored: StoredProgress | null;
}

export class ProgressStore {
	#state = $state(emptyState());
	#cleared: Tombstones = {};
	/** The payload this tab and the key last agreed on — the ancestor every merge is against. */
	#base: StoredProgress = emptyStored();

	#status = $state<StorageStatus>('unavailable');
	#salvaged = $state(false);
	#salvageAttempted = false;

	#storage: StorageLike | null;
	#now: () => number;
	#debounceMs: number;
	#maxDelayMs: number;
	#retryDelaysMs: readonly number[];
	#timer: ReturnType<typeof setTimeout> | null = null;
	#retryArmed = false;
	#failures = 0;
	#dirty = $state(false);
	#dirtySince = -1;

	constructor(options: ProgressStoreOptions = {}) {
		this.#storage = options.storage === undefined ? detectStorage() : options.storage;
		this.#now = options.now ?? Date.now;
		this.#debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
		this.#maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
		this.#retryDelaysMs =
			options.retryDelaysMs && options.retryDelaysMs.length > 0
				? options.retryDelaysMs
				: DEFAULT_RETRY_DELAYS_MS;
		this.#status = this.#storage === null ? 'unavailable' : 'saving';
		this.reload();
	}

	/** Everything the app persists. Reactive: read it inside `$derived`/markup and it tracks. */
	get state(): ProgressState {
		return this.#state;
	}

	/** Where progress is actually going right now. Reactive — render it. */
	get status(): StorageStatus {
		return this.#status;
	}

	/** False when progress is memory-only: no storage, or writes are being rejected. */
	get persistent(): boolean {
		return this.#status === 'saving';
	}

	/** True when a mutation is waiting to be written. */
	get pending(): boolean {
		return this.#dirty;
	}

	/**
	 * True when unreadable bytes were found in the key and copied to `hskquiz:progress:broken`
	 * rather than overwritten. Something was wrong, and the old history is recoverable.
	 */
	get salvaged(): boolean {
		return this.#salvaged;
	}

	/**
	 * The record for a word, as a **detached copy**. Never the live `$state` proxy: callers
	 * hand this straight to components, and returning the proxy meant a stray assignment could
	 * rewrite the learner's history without ever scheduling a write, then get persisted later
	 * by an unrelated answer. Reading the fields to copy them is also what registers the
	 * reactive dependency, so the copy still updates when the record does.
	 *
	 * Words that have never been answered get a zero record, and reading one never creates it —
	 * a browse screen must not balloon the map to every row it rendered.
	 */
	forWord(wordId: string): WordProgress {
		const record = ownRecord(this.#state.byWord, wordId);
		return record ? { ...record } : blankWord(wordId);
	}

	/** Fold one answer into the word's record. */
	recordAnswer(wordId: string, correct: boolean): void {
		if (!isUsableWordId(wordId)) return;

		const existing = ownRecord(this.#state.byWord, wordId);
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
	 *
	 * Leaves a tombstone as well as deleting, so a second tab that is mid-debounce cannot merge
	 * the level back in half a second later.
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

		this.#tombstone(level);
		// Destructive and deliberate: write it now, not in 400 ms.
		this.#dirty = true;
		this.flush();
	}

	/**
	 * Forget everything.
	 *
	 * Writes a tombstone-only payload rather than removing the key. Removing it looked tidier
	 * and was wrong: another tab holding the old blob would simply write it back, and the
	 * learner would watch their history return. What stays behind is `{"v":1,"w":{},"l":{},
	 * "c":{"0":<when>}}` — no words, no sessions, nothing about the learner except the instant
	 * they asked to be forgotten, which is the one fact that makes forgetting stick.
	 */
	resetAll(): void {
		this.#state = emptyState();
		this.#cleared = { 0: this.#now() };
		this.#failures = 0;
		this.#dirty = true;
		this.flush();

		// "Everything" includes the rescue copy.
		const storage = this.#storage;
		if (!storage) return;
		try {
			storage.removeItem(BACKUP_KEY);
			this.#salvaged = false;
			this.#salvageAttempted = false;
		} catch {
			// Nothing to do; the main payload is already gone.
		}
	}

	/**
	 * A level's figures without loading the level. Word ids carry their level, and only answered
	 * words have records, so this walks what the learner has done rather than all 1,000 words —
	 * which is what lets the level screen render progress before any vocabulary is fetched.
	 */
	levelSummary(level: Level, total: number = SHIPPED_SIZES[level] ?? 0): ProgressSummary {
		const summary = blankSummary(total);
		for (const wordId of Object.keys(this.#state.byWord)) {
			if (levelOfId(wordId) !== level) continue;
			const record = ownRecord(this.#state.byWord, wordId);
			if (record) accumulate(summary, record);
		}
		return finishSummary(summary);
	}

	/** The same figures over an explicit word list, for a screen that already has one. O(ids). */
	summarize(wordIds: Iterable<string>): ProgressSummary {
		const summary = blankSummary(0);
		for (const wordId of wordIds) {
			summary.total += 1;
			const record = ownRecord(this.#state.byWord, wordId);
			if (record) accumulate(summary, record);
		}
		return finishSummary(summary);
	}

	/**
	 * Write any pending change now: read, rescue, merge, write. Cheap and safe to call when
	 * nothing is dirty. Returns whether the key now holds everything this tab knows.
	 */
	flush(): boolean {
		this.#cancelTimer();

		const storage = this.#storage;
		if (!storage) {
			this.#dirty = false;
			this.#dirtySince = -1;
			return false;
		}
		if (!this.#dirty) {
			this.#dirtySince = -1;
			return true;
		}

		const mineText = encode(this.#state, this.#cleared);
		const disk = this.#read(storage);
		if (disk === null) return false; // Reading threw; `#read` has already stood the store down.

		if (disk.text === mineText) {
			// Someone already wrote exactly this. Nothing to do but agree with it.
			this.#settle(this.#mine(), mineText, mineText);
			return true;
		}

		const merged = this.#merge(disk);
		const mergedText = encode(merged.state, merged.cleared);

		try {
			storage.setItem(STORAGE_KEY, mergedText);
		} catch {
			// Quota exceeded, storage locked, private mode. The answer is safe in memory, the
			// session carries on, `status` says so out loud, and we try again on a backoff.
			this.#failWrite();
			return false;
		}

		this.#settle(merged, mergedText, mineText);
		return true;
	}

	/** Re-read the key, replacing in-memory state with whatever can be read from it. */
	reload(): void {
		const storage = this.#storage;
		if (!storage) return;

		const disk = this.#read(storage);
		if (disk === null) return;

		const adopted = disk.stored ?? emptyStored();
		this.#state = adopted.state;
		this.#cleared = adopted.cleared;
		this.#base = snapshot(adopted);
		this.#dirty = false;
		this.#dirtySince = -1;
		// Unreadable bytes are now backed up but still sitting in the key; the next mutation
		// legitimately replaces them.
	}

	/**
	 * Another tab wrote the key. Merge it in rather than adopting it — and if the merge holds
	 * anything the key is missing (our unsaved answers, or a reset it never saw), schedule a
	 * write so the two tabs converge instead of taking turns losing data.
	 */
	sync(): void {
		const storage = this.#storage;
		if (!storage) return;

		const disk = this.#read(storage);
		if (disk === null) return;

		const mineText = encode(this.#state, this.#cleared);
		if (disk.text === mineText) {
			this.#settle(this.#mine(), mineText, mineText);
			return;
		}

		const merged = this.#merge(disk);
		const mergedText = encode(merged.state, merged.cleared);
		this.#adopt(merged, mergedText !== mineText);

		if (mergedText === disk.text) {
			this.#settle(merged, mergedText, mineText);
			return;
		}

		// The key does not yet hold everything we know. Let the debounce write it back.
		this.#base = snapshot(this.#mine());
		this.#dirty = true;
		this.#schedule();
	}

	/** This tab's live payload, as the merge sees it. */
	#mine(): StoredProgress {
		return { state: this.#state, cleared: this.#cleared };
	}

	#merge(disk: DiskRead): StoredProgress {
		const mine = snapshot(this.#mine());
		// Unreadable bytes were rescued by `#read`; there is nothing in them we can merge.
		return disk.stored ? mergeProgress(this.#base, mine, disk.stored) : mine;
	}

	/**
	 * Read the key. Returns `null` only when reading itself threw, in which case storage is
	 * gone for this session and the store has already been stood down to memory-only.
	 */
	#read(storage: StorageLike): DiskRead | null {
		let text: string | null;
		try {
			text = storage.getItem(STORAGE_KEY);
		} catch {
			// Reading threw (Safari private mode): stop touching storage for this session.
			this.#storage = null;
			this.#status = 'unavailable';
			this.#dirty = false;
			this.#dirtySince = -1;
			this.#cancelTimer();
			return null;
		}

		if (text === null || text === '') return { text, stored: null };

		const stored = decodeStored(text, this.#now());
		// Corrupt, truncated, or from a schema we do not know. Those bytes are the learner's
		// entire history and we are about to write over them, so keep a copy first.
		if (stored === null) this.#rescue(storage, text);
		return { text, stored };
	}

	/** Copy unreadable bytes aside, once, and never over an existing rescue copy. */
	#rescue(storage: StorageLike, text: string): void {
		if (this.#salvageAttempted) return;
		this.#salvageAttempted = true;
		try {
			// First casualty wins: the oldest surviving copy is the one with the most history.
			if (storage.getItem(BACKUP_KEY) === null) storage.setItem(BACKUP_KEY, text);
			this.#salvaged = true;
		} catch {
			// A full quota is exactly when this fails. Nothing better is available.
			this.#salvageAttempted = false;
		}
	}

	/** The key now holds `stored`. Adopt it, agree on it, and call the write clean. */
	#settle(stored: StoredProgress, text: string, mineText: string): void {
		this.#adopt(stored, text !== mineText);
		this.#base = snapshot(this.#mine());
		this.#dirty = false;
		this.#dirtySince = -1;
		this.#failures = 0;
		this.#status = 'saving';
	}

	#adopt(stored: StoredProgress, changed: boolean): void {
		if (!changed) return;
		// Replacing the object rather than patching it: a merge can add, change and remove
		// records in one go, and one new proxy is cheaper than reconciling three sets by hand.
		this.#state = stored.state;
		this.#cleared = stored.cleared;
	}

	#failWrite(): void {
		this.#dirty = true;
		this.#status = 'failing';
		this.#failures += 1;

		const index = Math.min(this.#failures - 1, this.#retryDelaysMs.length - 1);
		this.#cancelTimer();
		this.#retryArmed = true;
		this.#timer = setTimeout(() => {
			this.#timer = null;
			this.#retryArmed = false;
			this.flush();
		}, this.#retryDelaysMs[index]);
	}

	#tombstone(scope: number): void {
		const at = this.#now();
		this.#cleared = { ...this.#cleared, [scope]: Math.max(this.#cleared[scope] ?? 0, at) };
	}

	#touch(): void {
		this.#dirty = true;
		this.#schedule();
	}

	#schedule(): void {
		if (!this.#storage) return;
		// A backoff owns the timer. Pulling the write forward to 400 ms would turn a full quota
		// into a rejected `setItem` on every single answer, which is the thing the backoff is for.
		if (this.#retryArmed) return;

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
		this.#retryArmed = false;
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
	// A stored payload can name word ids this build does not ship — a level whose numbering went
	// sparse when homographs merged, a hand-edited key, a record from a future deploy. Counting
	// them is fine; *reporting* more practised words than the level contains is not, and it used
	// to render "900 practised" directly under "500 words".
	if (summary.total > 0) summary.seen = Math.min(summary.seen, summary.total);
	summary.mastered = Math.min(summary.mastered, summary.seen);
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
