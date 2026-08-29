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
 *   2. **rescue** them to `hskquiz:progress:broken` if they cannot be decoded, *or* if
 *      merging them would drop records no reset accounts for — before anything else touches
 *      them;
 *   3. **merge** what is there with what we hold, three-way, against the bytes we last agreed
 *      on — so another tab's answers survive, and a reset survives another tab;
 *   4. **write** the merge, adopt it into memory, and record it as the new common ancestor.
 *
 * Nothing else writes. `resetLevel` and `resetAll` go through the same path, differing only in
 * that they move a reset generation on (see `progress-core.ts`) rather than deleting and
 * hoping.
 *
 * When the key still reads back as exactly the bytes we last agreed on — the normal
 * single-tab case — steps 2 and 3 are skipped, and the key is never even decoded, because a
 * three-way merge against an unchanged ancestor is the identity. That is what keeps an answer
 * at 4,300 answered words down to one encode and one `setItem` rather than four passes over
 * ~200 KB.
 *
 * ## Forgetting
 *
 * Reset is a *generation*, not a timestamp. The device clock decides nothing about what
 * survives — see the "Forgetting" section of `progress-core.ts` for why it must not.
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
 * causes (a full quota, a locked profile) are conditions that clear. A learner who keeps
 * answering pulls the next attempt forward to the 2 s ceiling, so a tab killed while storage
 * is jammed loses seconds rather than the whole backoff rung.
 *
 * `status` and `rescue` exist to be *rendered* — `StorageNotice.svelte` is the one piece of UI
 * that does it. A store that knows it is not saving and tells no one is the failure mode this
 * whole file is arranged around, and the status is honest from the first frame: the store
 * round-trips a probe byte at startup rather than inferring "saving" from a successful read.
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
	EPOCH_FLOOR,
	MASTERY_STREAK,
	PROBE_KEY,
	STORAGE_KEY,
	type Generations,
	type StoredProgress,
	applyAnswer,
	applySeen,
	blankWord,
	bumpGeneration,
	decodeStored,
	emptyState,
	emptyStored,
	encode,
	generationFor,
	generationForWord,
	isUsableWordId,
	levelOfId,
	mergeProgress,
	ownRecord,
	recordUnderOwnKey,
	restoreInto,
	snapshot,
	stampLevelGen,
	tally,
	unexplainedLosses
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
 * `'failing'` — storage exists but rejected a write (a full quota, most likely); we are
 * still retrying, and the answers so far are only in memory.
 */
export type StorageStatus = 'saving' | 'unavailable' | 'failing';

/** Why a copy of the key is sitting in `hskquiz:progress:broken`. */
export type RescueReason =
	/** The bytes in the key could not be decoded at all. */
	| 'unreadable'
	/** Merging them would have dropped records no reset accounts for. */
	| 'lost'
	/** A copy from an earlier session was already there when this one started. */
	| 'found';

/** What can be said about a rescue copy without restoring it. */
export interface RescueInfo {
	/** Word records the copy holds, or `null` when the copy cannot be decoded either. */
	words: number | null;
	/** Answers those records add up to. */
	answers: number;
	reason: RescueReason;
}

export interface ProgressStoreOptions {
	/** `undefined` auto-detects `localStorage`; `null` forces memory-only. */
	storage?: StorageLike | null;
	now?: () => number;
	debounceMs?: number;
	maxDelayMs?: number;
	/** Backoff schedule after a rejected write. The last entry repeats. */
	retryDelaysMs?: readonly number[];
	/**
	 * The three-way merge. Injectable for exactly one reason: the store promises that *if* a
	 * merge ever drops a record no reset accounts for, the bytes it was about to overwrite are
	 * copied aside instead — and a promise about a bug can only be tested by handing the store
	 * a bug. Production never passes this.
	 */
	merge?: typeof mergeProgress;
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
	#gens: Generations = {};
	/**
	 * The exact bytes this tab and the key last agreed on.
	 *
	 * Doubles as the merge ancestor (decoded on demand, only when a merge is actually needed)
	 * and as the fast-path test: if the key still reads back as this, nothing has happened
	 * since we settled and there is nothing to merge.
	 */
	#settledText: string | null = null;

	#status = $state<StorageStatus>('unavailable');
	#rescued = $state<RescueInfo | null>(null);
	#salvageAttempted = false;

	#storage: StorageLike | null;
	#now: () => number;
	#debounceMs: number;
	#maxDelayMs: number;
	#retryDelaysMs: readonly number[];
	#mergeWith: typeof mergeProgress;
	#timer: ReturnType<typeof setTimeout> | null = null;
	#retryArmed = false;
	#retryDueAt = 0;
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
		this.#mergeWith = options.merge ?? mergeProgress;
		this.#status = this.#storage === null ? 'unavailable' : 'saving';
		this.reload();
		if (this.#storage) this.#probe(this.#storage);
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
	 * The rescue copy in `hskquiz:progress:broken`, if there is one: history that was kept
	 * aside rather than overwritten. Reactive, survives every write until it is restored or
	 * discarded, and `restoreRescue()` is the way back.
	 */
	get rescue(): RescueInfo | null {
		return this.#rescued;
	}

	/** True when a rescue copy exists. Shorthand for `rescue !== null`. */
	get salvaged(): boolean {
		return this.#rescued !== null;
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
		// Stamped with the generation in force *now*, which is what makes an answer given after
		// a reset outlive it on any clock, in either direction.
		applyAnswer(record, correct, this.#at(), generationForWord(this.#gens, wordId));
		if (!existing) this.#state.byWord[wordId] = record;

		this.#touch();
	}

	/**
	 * Note that a word was shown and not asked — the quiz's introduction card.
	 *
	 * The first time a word comes up, the session engine teaches it instead of testing it, and
	 * that card has to leave a trace or the scheduler introduces the same word again on every
	 * visit forever. What it must *not* leave is anything that reads as an answer: a `lastMissed`
	 * for a word the app never asked is a miss the app manufactured about itself and then fed
	 * back into its own weighting, and a `correct` is the same lie pointing the other way — it
	 * promotes an untested word straight to the production direction.
	 *
	 * So this stamps `lastSeen` and nothing else, which is the one shape `recordAnswer` can never
	 * write. `applySeen` explains the field choice; `hasHistory` is what keeps it on disk.
	 */
	noteSeen(wordId: string): void {
		if (!isUsableWordId(wordId)) return;

		const existing = ownRecord(this.#state.byWord, wordId);
		const record = existing ?? blankWord(wordId);
		applySeen(record, this.#at(), generationForWord(this.#gens, wordId));
		if (!existing) this.#state.byWord[wordId] = record;

		this.#touch();
	}

	/** Count a finished session against a level, for the level screen. */
	noteSession(level: Level): void {
		if (!LEVELS.includes(level)) return;

		const at = this.#at();
		const entry = this.#state.levels[level] ?? { sessions: 0, lastPlayed: 0 };
		entry.sessions += 1;
		entry.lastPlayed = at;
		stampLevelGen(entry, generationFor(this.#gens, level));
		this.#state.levels[level] = entry;

		this.#touch();
	}

	/**
	 * Forget one level.
	 *
	 * Word ids carry their level (`L3-0412`), and that is the *only* way a level's scope is
	 * decided — the reset generation is keyed on it too. An explicit word-id list used to be
	 * accepted here and was a promise the bookkeeping could not keep: an id outside the
	 * `L{level}-` shape belongs to no level, so deleting it under a level's generation left a
	 * deletion nothing in the payload accounted for, and another tab would put it straight back.
	 *
	 * Moves the level's reset generation on as well as deleting, so a second tab that is
	 * mid-debounce cannot merge the level back in half a second later.
	 */
	resetLevel(level: Level): void {
		if (!LEVELS.includes(level)) return;

		this.#bump(level);
		delete this.#state.levels[level];
		for (const wordId of Object.keys(this.#state.byWord)) {
			if (levelOfId(wordId) === level) delete this.#state.byWord[wordId];
		}

		// Destructive and deliberate: write it now, not in 400 ms.
		this.#dirty = true;
		this.flush();
	}

	/**
	 * Forget everything.
	 *
	 * Writes a generation-only payload rather than removing the key. Removing it looked tidier
	 * and was wrong: another tab holding the old blob would simply write it back, and the
	 * learner would watch their history return. What stays behind is
	 * `{"v":1,"w":{},"l":{},"g":{"0":1}}` — no words, no sessions, nothing about the learner
	 * except a counter saying how many times they have asked to be forgotten, which is the one
	 * fact that makes forgetting stick.
	 */
	resetAll(): void {
		this.#bump(0);
		this.#state = emptyState();
		this.#failures = 0;
		this.#dirty = true;
		const landed = this.flush();

		// "Everything" includes the rescue copy — but only once the erase itself has actually
		// landed. Deleting the only backup while the key still holds every record is the exact
		// inverse of what Reset promises, and a refresh used to bring all of it back.
		if (!landed) return;
		this.discardRescue();
	}

	/**
	 * Fold the rescue copy back into live progress and write it.
	 *
	 * The learner is explicitly asking for this history, so it outranks any reset that happened
	 * while it sat in the backup key: every restored record is stamped at the current
	 * generation. Returns false when there is nothing to restore, the copy is unreadable too,
	 * or the write did not land.
	 */
	restoreRescue(): boolean {
		const storage = this.#storage;
		if (!storage || this.#rescued === null) return false;

		let text: string | null;
		try {
			text = storage.getItem(BACKUP_KEY);
		} catch {
			return false;
		}

		const rescued = decodeStored(text, this.#at());
		if (rescued === null) return false;

		const restored = restoreInto(snapshot(this.#mine()), rescued);
		this.#state = restored.state;
		this.#gens = restored.gens;
		this.#dirty = true;
		if (!this.flush()) return false;

		this.discardRescue();
		return true;
	}

	/** Throw the rescue copy away. Safe when there is none. */
	discardRescue(): void {
		this.#rescued = null;
		this.#salvageAttempted = false;
		const storage = this.#storage;
		if (!storage) return;
		try {
			storage.removeItem(BACKUP_KEY);
		} catch {
			// Nothing to do. It is one key, and it will be reused rather than duplicated.
		}
	}

	/**
	 * Storage was emptied from outside this tab — `localStorage.clear()`, or the browser's
	 * "clear site data". That is the learner asking to be forgotten, so adopt it and write
	 * *nothing* back. Routing this through `sync()` used to merge the cleared key against our
	 * memory and rewrite every record, so clearing site data with a second tab open cleared
	 * nothing at all.
	 */
	noteStorageCleared(): void {
		this.#cancelTimer();
		this.#state = emptyState();
		this.#gens = {};
		this.#settledText = null;
		this.#dirty = false;
		this.#dirtySince = -1;
		this.#failures = 0;
		this.#rescued = null;
		this.#salvageAttempted = false;
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
			const record = recordUnderOwnKey(this.#state.byWord, wordId);
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

		const mineText = encode(this.#mine());
		const raw = this.#readText(storage);
		if (raw === null) return false; // Reading threw; it has already stood the store down.

		if (raw.text === mineText) {
			// Someone already wrote exactly this. Nothing to do but agree with it.
			this.#settle(mineText);
			return true;
		}

		// Fast path: the key still reads back as the bytes we settled on, so nothing has
		// happened since and merge(base, mine, base) is mine. Skipping it saves decoding the
		// key, decoding the ancestor, a merge and a second encode — four passes over ~200 KB
		// on every single answer.
		let merged: StoredProgress | null = null;
		let mergedText = mineText;
		if (raw.text !== this.#settledText) {
			const disk = this.#decodeDisk(storage, raw.text);
			merged = this.#merge(disk);
			mergedText = encode(merged);
			this.#guardLoss(storage, disk, merged);
		}

		try {
			storage.setItem(STORAGE_KEY, mergedText);
		} catch {
			// Quota exceeded, storage locked, private mode. The answer is safe in memory, the
			// session carries on, `status` says so out loud, and we try again on a backoff.
			this.#failWrite();
			return false;
		}

		if (merged) this.#adopt(merged, mergedText !== mineText);
		this.#settle(mergedText);
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
		this.#gens = adopted.gens;
		// Unreadable bytes are now backed up but still sitting in the key; agreeing on them
		// means the next mutation legitimately replaces them.
		this.#settledText = disk.text;
		this.#dirty = false;
		this.#dirtySince = -1;
		this.#noteExistingRescue(storage);
	}

	/**
	 * Another tab wrote the key. Merge it in rather than adopting it — and if the merge holds
	 * anything the key is missing (our unsaved answers, or a reset it never saw), schedule a
	 * write so the two tabs converge instead of taking turns losing data.
	 */
	sync(): void {
		const storage = this.#storage;
		if (!storage) return;

		const raw = this.#readText(storage);
		if (raw === null) return;

		const mineText = encode(this.#mine());
		if (raw.text === mineText) {
			this.#settle(mineText);
			return;
		}
		if (raw.text === this.#settledText) {
			// The key holds exactly what we last agreed on: nothing of theirs to take. Whatever
			// we still hold is unwritten work, so let the debounce carry it.
			if (this.#dirty) this.#schedule();
			return;
		}

		const disk = this.#decodeDisk(storage, raw.text);
		const merged = this.#merge(disk);
		const mergedText = encode(merged);
		this.#guardLoss(storage, disk, merged);
		this.#adopt(merged, mergedText !== mineText);

		if (mergedText === disk.text) {
			this.#settle(mergedText);
			return;
		}

		// The key does not yet hold everything we know, but we have absorbed everything it
		// holds — so those bytes are the ancestor the next merge is against.
		this.#settledText = disk.text;
		this.#dirty = true;
		this.#schedule();
	}

	/** This tab's live payload, as the merge sees it. */
	#mine(): StoredProgress {
		return { state: this.#state, gens: this.#gens };
	}

	/** The last payload this tab and the key agreed on, decoded. Only a real merge needs it. */
	#baseline(): StoredProgress {
		return decodeStored(this.#settledText, this.#at()) ?? emptyStored();
	}

	#merge(disk: DiskRead): StoredProgress {
		const mine = this.#mine();
		// No snapshot of `mine` first: `mergeProgress` only ever reads its inputs and every
		// record it emits is a fresh object, so the merged payload holds no `$state` proxy for
		// `#adopt` to install. Detaching it cost a full pass and 4,316 clones per merge.
		// Unreadable bytes were rescued by `#read`; there is nothing in them we can merge.
		return disk.stored ? this.#mergeWith(this.#baseline(), mine, disk.stored) : mine;
	}

	/**
	 * A merge is only allowed to drop a record that a reset generation accounts for. If it
	 * dropped anything else, the bytes we are about to overwrite are history nothing else
	 * holds — so keep a copy and say so, rather than writing the loss and reporting success.
	 */
	#guardLoss(storage: StorageLike, disk: DiskRead, merged: StoredProgress): void {
		if (!disk.stored || !disk.text) return;
		const lost = unexplainedLosses(disk.stored, merged);
		if (lost.length === 0) return;
		this.#keepAside(storage, disk.text, 'lost');
	}

	/**
	 * Read the key's bytes, and nothing more. Returns `null` only when reading itself threw, in
	 * which case storage is gone for this session and the store has already been stood down to
	 * memory-only.
	 *
	 * Separate from `#decodeDisk` so a write can find out *whether* the key has moved without
	 * paying to decode ~200 KB and discover that it has not. That decode was 2.8 of the 11 ms a
	 * single answer used to cost at a full library.
	 */
	#readText(storage: StorageLike): { text: string | null } | null {
		try {
			return { text: storage.getItem(STORAGE_KEY) };
		} catch {
			// Reading threw (Safari private mode): stop touching storage for this session.
			this.#storage = null;
			this.#status = 'unavailable';
			this.#dirty = false;
			this.#dirtySince = -1;
			this.#cancelTimer();
			return null;
		}
	}

	/** Decode bytes we are about to merge against, rescuing them if they cannot be read. */
	#decodeDisk(storage: StorageLike, text: string | null): DiskRead {
		if (text === null || text === '') return { text, stored: null };

		const stored = decodeStored(text, this.#at());
		// Corrupt, truncated, or from a schema we do not know. Those bytes are the learner's
		// entire history and we are about to write over them, so keep a copy first.
		if (stored === null) this.#keepAside(storage, text, 'unreadable');
		return { text, stored };
	}

	/** Read the key and decode it. For the callers that always need the contents. */
	#read(storage: StorageLike): DiskRead | null {
		const raw = this.#readText(storage);
		return raw === null ? null : this.#decodeDisk(storage, raw.text);
	}

	/** Copy bytes aside, once, and never over an existing rescue copy. */
	#keepAside(storage: StorageLike, text: string, reason: RescueReason): void {
		if (this.#salvageAttempted) return;
		this.#salvageAttempted = true;
		try {
			// First casualty wins: the oldest surviving copy is the one with the most history.
			const existing = storage.getItem(BACKUP_KEY);
			if (existing === null) storage.setItem(BACKUP_KEY, text);
			this.#rescued = describeRescue(existing ?? text, existing === null ? reason : 'found');
		} catch {
			// A full quota is exactly when this fails. Nothing better is available.
			this.#salvageAttempted = false;
		}
	}

	/** A copy from an earlier session is still sitting there. Offer it rather than forget it. */
	#noteExistingRescue(storage: StorageLike): void {
		// A rescue made during this same load already knows exactly why it happened.
		if (this.#rescued !== null) return;
		try {
			const text = storage.getItem(BACKUP_KEY);
			if (text === null || text === '') return;
			// One copy already exists and `#keepAside` would refuse to replace it anyway.
			this.#salvageAttempted = true;
			this.#rescued = describeRescue(text, 'found');
		} catch {
			// No storage to ask; nothing to offer.
		}
	}

	/**
	 * Round-trip one byte so `status` reflects a *write*.
	 *
	 * `detectStorage()` only ever reads, and reading succeeds on a full quota and on a profile
	 * that will refuse every write — so a cold load used to report 'saving' with nothing
	 * saveable, and the home screen printed "Progress is kept on this device" underneath it.
	 * The first answer would have found out; the promise was already on screen by then.
	 */
	#probe(storage: StorageLike): void {
		try {
			storage.setItem(PROBE_KEY, '1');
		} catch {
			this.#status = 'failing';
			return;
		}
		try {
			storage.removeItem(PROBE_KEY);
		} catch {
			// A leftover byte under a key nothing reads. Harmless.
		}
		this.#status = 'saving';
	}

	/** The key now holds `text`. Agree on it and call the write clean. */
	#settle(text: string | null): void {
		this.#settledText = text;
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
		this.#gens = stored.gens;
	}

	/**
	 * Move a reset generation on.
	 *
	 * The bump has to outrank every generation already in play, including one another tab
	 * wrote and we have never seen — generations merge by `Math.max`, so a reset in a tab
	 * holding a stale payload would otherwise be absorbed and do nothing.
	 */
	#bump(scope: number): void {
		let onDisk = 0;
		const storage = this.#storage;
		if (storage) {
			const disk = this.#read(storage);
			if (disk?.stored) onDisk = disk.stored.gens[scope] ?? 0;
		}
		this.#gens = bumpGeneration(this.#gens, scope, onDisk);
	}

	#failWrite(): void {
		this.#dirty = true;
		this.#status = 'failing';
		this.#failures += 1;

		const index = Math.min(this.#failures - 1, this.#retryDelaysMs.length - 1);
		this.#armRetry(this.#retryDelaysMs[index]);
	}

	#armRetry(delayMs: number): void {
		this.#clearTimer();
		this.#retryArmed = true;
		this.#retryDueAt = this.#now() + delayMs;
		this.#timer = setTimeout(() => {
			this.#timer = null;
			this.#retryArmed = false;
			this.flush();
		}, delayMs);
	}

	/** The clock, floored to the decoder's own epoch. */
	#at(): number {
		// A device whose clock says 2001 would otherwise stamp answers that decode back as
		// "never" — the store writing bytes it cannot read is the whole class of bug this file
		// has been chasing. Whatever `encode` writes, `decodeStored` must read back unchanged.
		return Math.max(EPOCH_FLOOR, this.#now());
	}

	#touch(): void {
		this.#dirty = true;
		this.#schedule();
	}

	#schedule(): void {
		if (!this.#storage) return;

		const now = this.#now();
		if (this.#dirtySince < 0) this.#dirtySince = now;

		if (this.#retryArmed) {
			// A backoff owns the timer, and pulling the write forward to the 400 ms debounce
			// would turn a jammed quota into a rejected `setItem` on every single answer. But a
			// learner who is still answering must not be able to lose a whole 30 s rung to a tab
			// kill either, so the retry comes forward to the ceiling — never nearer.
			const soonest = now + this.#maxDelayMs;
			if (this.#retryDueAt > soonest) this.#armRetry(this.#maxDelayMs);
			return;
		}

		// Trailing debounce, capped so a steady drip of answers still lands within maxDelayMs.
		const waited = now - this.#dirtySince;
		const delay = Math.max(0, Math.min(this.#debounceMs, this.#maxDelayMs - waited));

		this.#clearTimer();
		this.#timer = setTimeout(() => {
			this.#timer = null;
			this.flush();
		}, delay);
	}

	#cancelTimer(): void {
		this.#retryArmed = false;
		this.#clearTimer();
	}

	#clearTimer(): void {
		if (this.#timer === null) return;
		clearTimeout(this.#timer);
		this.#timer = null;
	}
}

function describeRescue(text: string, reason: RescueReason): RescueInfo {
	// Deliberately not the store's clock: this is a summary of bytes, and if the copy is junk
	// the honest answer is "we cannot tell", not a fabricated count.
	const stored = decodeStored(text);
	if (stored === null) return { words: null, answers: 0, reason };
	const counts = tally(stored);
	return { words: counts.words, answers: counts.answers, reason };
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

	window.addEventListener('storage', (event) => {
		// `key === null` is what `clear()` and "clear site data" report. That is an erasure the
		// learner asked for, not a write to merge against.
		if (event.key === null) {
			progress.noteStorageCleared();
			return;
		}
		if (event.key !== STORAGE_KEY) return;
		progress.sync();
	});
}

export default progress;
