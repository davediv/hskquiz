import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProgressStore, progress, type StorageLike } from './progress.svelte.ts';
import {
	BACKUP_KEY,
	PROBE_KEY,
	STORAGE_KEY,
	type StoredProgress,
	emptyStored,
	encode,
	mergeProgress
} from './progress-core.ts';
import { SHIPPED_SIZES } from '$lib/data/sizes';

/** A clock that is safely inside the decoder's plausibility window. */
const T0 = 1_787_000_000_000;
const MINUTE = 60_000;

/**
 * A `localStorage` stand-in that can be made to misbehave the way real ones do.
 *
 * `writes`/`attempts` count the *payload* key only, so the one-byte probe the store round-trips
 * at startup does not show up as a save.
 */
class MemoryStorage implements StorageLike {
	items = new Map<string, string>();
	/** Payload writes that landed. */
	writes = 0;
	/** Payload writes that were *tried*, including the ones that threw — the retry counter. */
	attempts = 0;
	/** Probe writes: how many times the store asked storage to prove it accepts a write. */
	probes = 0;
	failReads = false;
	failWrites = false;

	getItem(key: string): string | null {
		if (this.failReads) throw new Error('SecurityError: access denied');
		return this.items.get(key) ?? null;
	}

	setItem(key: string, value: string): void {
		if (key === STORAGE_KEY) this.attempts += 1;
		if (key === PROBE_KEY) this.probes += 1;
		if (this.failWrites) {
			const error = new Error('The quota has been exceeded.');
			error.name = 'QuotaExceededError';
			throw error;
		}
		if (key === STORAGE_KEY) this.writes += 1;
		this.items.set(key, value);
	}

	removeItem(key: string): void {
		if (this.failWrites) throw new Error('SecurityError: access denied');
		this.items.delete(key);
	}

	get payload(): string | null {
		return this.items.get(STORAGE_KEY) ?? null;
	}

	words(): Record<string, number[]> {
		return JSON.parse(this.payload ?? '{}').w ?? {};
	}

	parsed(): Record<string, unknown> {
		return JSON.parse(this.payload ?? '{}');
	}
}

/** A store wired to a fresh fake storage and a clock the test drives. */
function makeStore(storage: MemoryStorage = new MemoryStorage(), start = T0) {
	let clock = start;
	const store = new ProgressStore({ storage, now: () => clock });
	return {
		store,
		storage,
		tick: (ms: number) => (clock += ms),
		set: (at: number) => (clock = at)
	};
}

/** A detached payload built without touching storage, for seeding a key by hand. */
function payloadOf(build: (store: ProgressStore) => void): string {
	const scratch = new ProgressStore({ storage: null, now: () => T0 });
	build(scratch);
	const stored: StoredProgress = { state: scratch.state, gens: {} };
	return encode(stored);
}

afterEach(() => {
	vi.useRealTimers();
});

describe('recordAnswer', () => {
	it('tracks seen, correct, streak and timestamps', () => {
		const { store, tick } = makeStore();

		store.recordAnswer('L1-0001', true);
		tick(1000);
		store.recordAnswer('L1-0001', true);

		const record = store.forWord('L1-0001');
		expect(record.seen).toBe(2);
		expect(record.correct).toBe(2);
		expect(record.streak).toBe(2);
		expect(record.lastSeen).toBe(T0 + 1000);
		expect(record.lastMissed).toBe(0);
	});

	it('resets the streak on a miss and remembers when it happened', () => {
		const { store, tick } = makeStore();

		store.recordAnswer('L1-0001', true);
		store.recordAnswer('L1-0001', true);
		tick(5000);
		store.recordAnswer('L1-0001', false);

		const record = store.forWord('L1-0001');
		expect(record.seen).toBe(3);
		expect(record.correct).toBe(2);
		expect(record.streak).toBe(0);
		expect(record.lastMissed).toBe(T0 + 5000);
	});

	it('stamps an answer at the epoch floor when the device clock predates the app', () => {
		// A 2001 clock used to write `lastSeen` values the decoder threw away as junk, so the
		// word came back "practised, never played". Whatever encode writes, decode must read.
		const storage = new MemoryStorage();
		const store = new ProgressStore({ storage, now: () => Date.UTC(2001, 5, 1) });

		store.recordAnswer('L1-0001', true);
		store.flush();

		const reloaded = new ProgressStore({ storage, now: () => T0 });
		expect(reloaded.forWord('L1-0001').seen).toBe(1);
		expect(reloaded.forWord('L1-0001').lastSeen).toBe(Date.UTC(2024, 0, 1));
	});

	it('ignores an empty word id instead of creating a junk record', () => {
		const { store } = makeStore();

		store.recordAnswer('', true);

		expect(store.state.byWord).toEqual({});
		expect(store.pending).toBe(false);
	});

	it('refuses ids that would write through to Object.prototype', () => {
		const { store } = makeStore();

		store.recordAnswer('__proto__', true);
		store.recordAnswer('toString', true);
		store.recordAnswer('constructor', true);

		expect(store.state.byWord).toEqual({});
		expect(({} as Record<string, unknown>).seen).toBeUndefined();
		expect(typeof {}.toString).toBe('function');
	});
});

describe('forWord', () => {
	it('returns a zero record for an unseen word without storing it', () => {
		const { store } = makeStore();

		const record = store.forWord('L4-0999');

		expect(record).toEqual({
			wordId: 'L4-0999',
			seen: 0,
			correct: 0,
			streak: 0,
			lastSeen: 0,
			lastMissed: 0
		});
		expect(store.state.byWord).toEqual({});
	});

	it('hands back a detached copy, so a stray write cannot rewrite history', () => {
		const { store } = makeStore();
		store.recordAnswer('L1-0001', true);

		const copy = store.forWord('L1-0001');
		copy.seen = 999;

		expect(store.forWord('L1-0001').seen).toBe(1);
		expect(store.levelSummary(1).answers).toBe(1);
	});

	it('never returns something inherited from Object.prototype', () => {
		const { store } = makeStore();

		expect(store.forWord('constructor').seen).toBe(0);
		expect(store.forWord('toString').seen).toBe(0);
		expect(typeof store.forWord('valueOf')).toBe('object');
	});
});

describe('noteSession', () => {
	it('counts sessions per level and stamps the last play', () => {
		const { store, tick } = makeStore();

		store.noteSession(2);
		tick(60_000);
		store.noteSession(2);
		store.noteSession(3);

		expect(store.state.levels[2]?.sessions).toBe(2);
		expect(store.state.levels[2]?.lastPlayed).toBe(T0 + 60_000);
		expect(store.state.levels[3]?.sessions).toBe(1);
	});
});

describe('persistence', () => {
	it('survives a reload through one versioned key', () => {
		const { store, storage } = makeStore();

		store.recordAnswer('L1-0001', true);
		store.recordAnswer('L1-0002', false);
		store.noteSession(1);
		store.flush();

		expect(storage.items.size).toBe(1);
		expect(storage.payload).not.toBeNull();

		const reloaded = new ProgressStore({ storage });
		expect(reloaded.forWord('L1-0001').correct).toBe(1);
		expect(reloaded.forWord('L1-0002').lastMissed).toBe(T0);
		expect(reloaded.state.levels[1]?.sessions).toBe(1);
	});

	it('debounces a burst of answers into a single write', () => {
		vi.useFakeTimers();
		const storage = new MemoryStorage();
		const store = new ProgressStore({ storage });

		// Real ids: `L1-0000` is not a word, and the store now refuses to record one.
		for (let i = 1; i <= 10; i += 1) store.recordAnswer(`L1-${String(i).padStart(4, '0')}`, true);
		expect(storage.writes).toBe(0);

		vi.advanceTimersByTime(500);

		expect(storage.writes).toBe(1);
		expect(Object.keys(store.state.byWord)).toHaveLength(10);
	});

	it('still writes within the ceiling when answers keep arriving', () => {
		vi.useFakeTimers();
		const storage = new MemoryStorage();
		const store = new ProgressStore({ storage });

		// One answer every 300 ms never lets a 400 ms trailing debounce fire on its own.
		for (let i = 0; i < 8; i += 1) {
			store.recordAnswer(`L1-010${i}`, true);
			vi.advanceTimersByTime(300);
		}

		expect(storage.writes).toBeGreaterThanOrEqual(1);
	});

	it('flushes pending work on demand and is a no-op when clean', () => {
		vi.useFakeTimers();
		const storage = new MemoryStorage();
		const store = new ProgressStore({ storage });

		store.recordAnswer('L1-0001', true);
		expect(store.pending).toBe(true);

		store.flush();
		expect(storage.writes).toBe(1);
		expect(store.pending).toBe(false);

		store.flush();
		vi.advanceTimersByTime(5000);
		expect(storage.writes).toBe(1);
	});

	it('reports status while it is saving', () => {
		const { store } = makeStore();

		store.recordAnswer('L1-0001', true);
		store.flush();

		expect(store.status).toBe('saving');
		expect(store.persistent).toBe(true);
		expect(store.salvaged).toBe(false);
	});

	it('proves storage accepts a write before claiming to be saving', () => {
		// `detectStorage` only ever *reads*, and reading succeeds on a full quota — so a cold
		// load reported 'saving' with nothing saveable under it and the home screen printed
		// "Progress is kept on this device" anyway.
		const storage = new MemoryStorage();
		storage.failWrites = true;

		const store = new ProgressStore({ storage, now: () => T0 });

		expect(store.status).toBe('failing');
		expect(store.persistent).toBe(false);
		expect(storage.probes).toBe(1);
		// The probe is its own key and never touches the payload.
		expect(storage.attempts).toBe(0);
	});

	it('never merges — or decodes — a key nothing else has touched', () => {
		// The single-tab case is every case, most of the time. Reading the key back, decoding
		// ~200 KB of it and three-way merging it against an ancestor that has not moved is four
		// passes over the payload to arrive back at what this tab already holds.
		const storage = new MemoryStorage();
		let merges = 0;
		const store = new ProgressStore({
			storage,
			now: () => T0,
			merge: (base, mine, theirs) => {
				merges += 1;
				return mergeProgress(base, mine, theirs);
			}
		});

		for (const id of ['L1-0001', 'L1-0002', 'L1-0003']) {
			store.recordAnswer(id, true);
			store.flush();
		}

		expect(merges).toBe(0);
		expect(Object.keys(storage.words())).toHaveLength(3);

		// And it does merge the moment the key really has moved under it.
		const other = new ProgressStore({ storage, now: () => T0 });
		other.recordAnswer('L2-0004', true);
		other.flush();
		store.recordAnswer('L1-0005', true);
		store.flush();

		expect(merges).toBe(1);
		expect(Object.keys(storage.words())).toHaveLength(5);
	});

	it('leaves no probe key behind when storage is healthy', () => {
		const { storage } = makeStore();

		expect(storage.probes).toBe(1);
		expect(storage.items.has(PROBE_KEY)).toBe(false);
		expect(storage.items.size).toBe(0);
	});
});

describe('hostile storage', () => {
	it('works entirely in memory when there is no localStorage', () => {
		const store = new ProgressStore({ storage: null });

		store.recordAnswer('L1-0001', true);
		store.noteSession(1);
		store.flush();

		expect(store.status).toBe('unavailable');
		expect(store.persistent).toBe(false);
		expect(store.forWord('L1-0001').seen).toBe(1);
		expect(store.state.levels[1]?.sessions).toBe(1);
	});

	it('degrades when reading throws, the way Safari private mode does', () => {
		const storage = new MemoryStorage();
		storage.failReads = true;

		const store = new ProgressStore({ storage });

		expect(store.status).toBe('unavailable');
		store.recordAnswer('L1-0001', true);
		store.flush();
		expect(store.forWord('L1-0001').seen).toBe(1);
		expect(storage.payload).toBeNull();
	});

	it('keeps retrying after a rejected write, and lands the moment storage recovers', () => {
		vi.useFakeTimers();
		const storage = new MemoryStorage();
		const store = new ProgressStore({ storage });
		storage.failWrites = true;

		store.recordAnswer('L1-0001', true);
		store.flush();

		// The answer is safe, the store says out loud that it is not saved, and it stays dirty.
		expect(store.status).toBe('failing');
		expect(store.persistent).toBe(false);
		expect(store.pending).toBe(true);
		expect(store.forWord('L1-0001').seen).toBe(1);
		expect(storage.attempts).toBe(1);

		// Backoff: 1 s, then 5 s. Not one attempt per answer.
		store.recordAnswer('L1-0002', true);
		vi.advanceTimersByTime(1000);
		expect(storage.attempts).toBe(2);
		vi.advanceTimersByTime(4999);
		expect(storage.attempts).toBe(2);
		vi.advanceTimersByTime(1);
		expect(storage.attempts).toBe(3);

		// Storage recovers — a full quota does, when another tab closes.
		storage.failWrites = false;
		vi.advanceTimersByTime(30_000);

		expect(storage.writes).toBe(1);
		expect(store.status).toBe('saving');
		expect(store.pending).toBe(false);
		expect(storage.words()).toHaveProperty('L1-0001');
		expect(storage.words()).toHaveProperty('L1-0002');
	});

	it('pulls a long backoff forward to the write ceiling while answers keep coming', () => {
		// On the 30 s rung a tab killed by iOS took half a minute of answers with it, because a
		// new answer could not move the armed retry. It can now — as far as the ceiling, never
		// as far as the debounce, or a jammed quota would be re-tried on every keystroke.
		vi.useFakeTimers();
		const storage = new MemoryStorage();
		const store = new ProgressStore({ storage });
		storage.failWrites = true;

		store.recordAnswer('L1-0001', true);
		store.flush();
		vi.advanceTimersByTime(1000);
		vi.advanceTimersByTime(5000);
		expect(storage.attempts).toBe(3); // now on the 30 s rung

		storage.failWrites = false;
		store.recordAnswer('L1-0002', true);
		vi.advanceTimersByTime(2000);

		expect(storage.writes).toBe(1);
		expect(store.status).toBe('saving');
		expect(storage.words()).toHaveProperty('L1-0002');
	});

	it('copies bytes it cannot read aside instead of destroying them', () => {
		const storage = new MemoryStorage();
		const corrupt = '{"v":1,"w":{"L1-0001":[1,1,';
		storage.items.set(STORAGE_KEY, corrupt);

		const store = new ProgressStore({ storage, now: () => T0 });
		expect(Object.keys(store.state.byWord)).toEqual([]);
		// The rescue happens on load, before anything can overwrite the key.
		expect(storage.items.get(BACKUP_KEY)).toBe(corrupt);
		expect(store.salvaged).toBe(true);
		// The one record in there was cut off mid-tuple, so nothing can be salvaged from it — but
		// its id is still legible, and saying "about 1 word" is more use to a learner deciding
		// whether to keep a copy than "we cannot tell".
		expect(store.rescue).toEqual({
			words: 1,
			answers: 0,
			levels: 0,
			readable: false,
			reason: 'unreadable'
		});

		store.recordAnswer('L1-0009', true);
		store.flush();

		// Finding 8: the notice used to vanish the moment the key became readable again, while
		// the copy sat in quota with nothing in the codebase able to read it.
		expect(store.salvaged).toBe(true);

		const reloaded = new ProgressStore({ storage });
		expect(reloaded.forWord('L1-0009').seen).toBe(1);
		expect(reloaded.salvaged).toBe(true);
		expect(storage.items.get(BACKUP_KEY)).toBe(corrupt);
	});

	it('rescues a payload from a newer schema rather than half-reading it', () => {
		const storage = new MemoryStorage();
		const future = JSON.stringify({ v: 99, w: { 'L1-0001': [3, 3, 3, T0, 0] } });
		storage.items.set(STORAGE_KEY, future);

		const store = new ProgressStore({ storage, now: () => T0 });

		expect(store.forWord('L1-0001').seen).toBe(0);
		expect(store.salvaged).toBe(true);
		expect(storage.items.get(BACKUP_KEY)).toBe(future);

		// The learner's next answer is the better data and wins the key — the old bytes are safe.
		store.recordAnswer('L1-0002', true);
		store.flush();
		expect(storage.words()).toHaveProperty('L1-0002');
		expect(storage.items.get(BACKUP_KEY)).toBe(future);
	});

	it('keeps the rescue copy that holds the most, not the one that got there first', () => {
		// "First casualty wins" was exactly backwards: history accumulates, so the oldest copy
		// is the smallest one, and a one-word leftover from a previous session used to sit in
		// the backup key refusing three hundred words that were about to be overwritten.
		const storage = new MemoryStorage();
		const small = JSON.stringify({ v: 1, w: { 'L1-0001': [1, 1, 1, T0, 0] }, l: {} });
		const big: Record<string, number[]> = {};
		for (let i = 1; i <= 40; i += 1) big[`L1-${String(i).padStart(4, '0')}`] = [3, 2, 1, T0, 0];
		const bigText = JSON.stringify({ v: 1, w: big, l: {} });

		storage.items.set(BACKUP_KEY, small);
		// Truncated, so it will not parse as a whole — and it still has to win, because
		// thirty-nine of its forty records survived the cut intact and the copy already kept
		// holds one.
		storage.items.set(STORAGE_KEY, bigText.slice(0, -30));

		const store = new ProgressStore({ storage, now: () => T0 });

		expect(store.salvaged).toBe(true);
		expect(storage.items.get(BACKUP_KEY)).toBe(bigText.slice(0, -30));
		expect(store.rescue).toEqual({
			words: 39,
			answers: 117,
			levels: 0,
			readable: true,
			reason: 'unreadable'
		});
	});

	it('does not let a smaller copy displace the one already kept', () => {
		const storage = new MemoryStorage();
		const big: Record<string, number[]> = {};
		for (let i = 1; i <= 40; i += 1) big[`L1-${String(i).padStart(4, '0')}`] = [3, 2, 1, T0, 0];
		const bigText = JSON.stringify({ v: 1, w: big, l: {} });

		storage.items.set(BACKUP_KEY, bigText);
		storage.items.set(STORAGE_KEY, '{"v":1,"w":{"L1-0001":[1,1,');

		const store = new ProgressStore({ storage, now: () => T0 });

		expect(storage.items.get(BACKUP_KEY)).toBe(bigText);
		expect(store.rescue).toEqual({
			words: 40,
			answers: 120,
			levels: 0,
			readable: true,
			reason: 'found'
		});
	});

	it('keeps the bytes when a merge loses a record no reset accounts for', () => {
		// The half of the rescue net that was missing: bytes that decode perfectly and are then
		// annihilated by a merge used to go to the bit bucket with no copy at all. Nothing in
		// the store deletes without moving a generation on, so the bug has to be handed in.
		const storage = new MemoryStorage();
		const seed = new ProgressStore({ storage, now: () => T0 });
		seed.recordAnswer('L1-0001', true);
		seed.recordAnswer('L1-0002', true);
		seed.flush();

		const store = new ProgressStore({
			storage,
			now: () => T0,
			merge: (base, mine, theirs) => {
				const merged = mergeProgress(base, mine, theirs);
				delete merged.state.byWord['L1-0001'];
				return merged;
			}
		});

		// Move the key on, so this store takes the merge path rather than the fast path.
		seed.recordAnswer('L1-0003', true);
		seed.flush();
		const before = storage.payload;

		store.recordAnswer('L1-0004', true);
		store.flush();

		expect(storage.items.get(BACKUP_KEY)).toBe(before);
		expect(store.rescue).toEqual({
			words: 3,
			answers: 3,
			levels: 0,
			readable: true,
			reason: 'lost'
		});
		expect(store.salvaged).toBe(true);
	});

	it('migrates a pre-v1 payload and rewrites it in the current format', () => {
		const storage = new MemoryStorage();
		storage.items.set(
			STORAGE_KEY,
			JSON.stringify({
				version: 0,
				byWord: {
					'L1-0001': {
						wordId: 'L1-0001',
						seen: 4,
						correct: 3,
						streak: 1,
						lastSeen: T0 - 1_000_000,
						lastMissed: T0 - 2_000_000
					}
				},
				levels: { '1': { sessions: 7, lastPlayed: T0 - 999_999 } }
			})
		);

		const store = new ProgressStore({ storage, now: () => T0 });
		expect(store.forWord('L1-0001').correct).toBe(3);
		expect(store.state.levels[1]?.sessions).toBe(7);

		store.recordAnswer('L1-0001', true);
		store.flush();

		const payload = storage.parsed();
		expect(payload.v).toBe(1);
		expect((payload.w as Record<string, number[]>)['L1-0001']).toEqual([
			5,
			4,
			2,
			T0,
			T0 - 2_000_000
		]);
		expect(payload.byWord).toBeUndefined();
		expect(storage.items.get(BACKUP_KEY)).toBeUndefined();
	});

	it('migrates a timestamp tombstone from the pre-generation build', () => {
		const storage = new MemoryStorage();
		storage.items.set(
			STORAGE_KEY,
			JSON.stringify({
				v: 1,
				w: { 'L1-0001': [1, 1, 1, T0 - 10_000, 0], 'L1-0002': [2, 2, 2, T0, 0] },
				c: { '0': T0 - 5000 }
			})
		);

		const store = new ProgressStore({ storage, now: () => T0 });

		// What the old cut erased stays erased; what survived it survives, and is rewritten as
		// a generation so no clock is ever consulted again.
		expect(Object.keys(store.state.byWord)).toEqual(['L1-0002']);
		store.recordAnswer('L1-0003', true);
		store.flush();

		expect(storage.parsed().c).toBeUndefined();
		expect(storage.parsed().g).toEqual({ '0': 1 });
		expect(Object.keys(storage.words()).sort()).toEqual(['L1-0002', 'L1-0003']);
	});
});

describe('resetting', () => {
	it('resetLevel drops only that level, and writes immediately', () => {
		const { store, storage } = makeStore();

		store.recordAnswer('L1-0001', true);
		store.recordAnswer('L2-0500', true);
		store.noteSession(1);
		store.noteSession(2);
		store.flush();

		store.resetLevel(1);

		expect(store.forWord('L1-0001').seen).toBe(0);
		expect(store.forWord('L2-0500').seen).toBe(1);
		expect(store.state.levels[1]).toBeUndefined();
		expect(store.state.levels[2]?.sessions).toBe(1);
		expect(storage.parsed().g).toEqual({ '1': 1 });

		const reloaded = new ProgressStore({ storage });
		expect(reloaded.forWord('L1-0001').seen).toBe(0);
		expect(reloaded.forWord('L2-0500').seen).toBe(1);
	});

	it('puts the numbers back when the browser refuses the erase', () => {
		// The erase happens in memory and is written second, so a rejected `setItem` left the
		// screen asserting an erasure that had not happened: the stats strip gone, HSK 1 back to
		// "Start here", and a key still holding every record. A reload brought it all back \u2014
		// which is the tell. `restoreRescue` already rolled back; reset, the more destructive of
		// the two, did not.
		const { store, storage } = makeStore();

		store.recordAnswer('L1-0001', true);
		store.recordAnswer('L2-0500', true);
		store.noteSession(1);
		store.flush();
		const before = storage.payload;

		storage.failWrites = true;
		expect(store.resetAll()).toBe(false);

		expect(store.eraseFailed).toBe(true);
		expect(store.forWord('L1-0001').seen).toBe(1);
		expect(store.forWord('L2-0500').seen).toBe(1);
		expect(store.state.levels[1]?.sessions).toBe(1);
		expect(storage.payload).toBe(before);

		storage.failWrites = false;
		expect(new ProgressStore({ storage, now: () => T0 }).forWord('L1-0001').seen).toBe(1);
	});

	it('puts one level back when the browser refuses that erase', () => {
		const { store, storage } = makeStore();

		store.recordAnswer('L1-0001', true);
		store.noteSession(1);
		store.flush();
		const before = storage.payload;

		storage.failWrites = true;
		expect(store.resetLevel(1)).toBe(false);

		expect(store.eraseFailed).toBe(true);
		expect(store.forWord('L1-0001').seen).toBe(1);
		expect(store.state.levels[1]?.sessions).toBe(1);
		expect(storage.payload).toBe(before);
	});

	it('lets the level be practised again straight after a reset', () => {
		const { store, storage, tick } = makeStore();

		store.recordAnswer('L1-0001', true);
		store.flush();
		store.resetLevel(1);

		tick(1000);
		store.recordAnswer('L1-0001', true);
		store.noteSession(1);
		store.flush();

		const reloaded = new ProgressStore({ storage, now: () => T0 + 2000 });
		expect(reloaded.forWord('L1-0001').seen).toBe(1);
		expect(reloaded.state.levels[1]?.sessions).toBe(1);
	});

	it('resetAll clears every record and leaves nothing about the learner behind', () => {
		const { store, storage } = makeStore();

		store.recordAnswer('L1-0001', true);
		store.noteSession(1);
		store.flush();
		expect(storage.payload).not.toBeNull();

		store.resetAll();

		expect(store.state.byWord).toEqual({});
		expect(store.state.levels).toEqual({});

		// What stays is a counter and nothing else: no words, no sessions, and — unlike the
		// timestamp it replaced — not even the instant the learner asked to be forgotten.
		const payload = storage.parsed();
		expect(payload.w).toEqual({});
		expect(payload.l).toEqual({});
		expect(payload.g).toEqual({ '0': 1 });

		const reloaded = new ProgressStore({ storage, now: () => T0 });
		expect(reloaded.state.byWord).toEqual({});
		expect(reloaded.state.levels).toEqual({});
	});

	it('keeps answers given after a Reset on a clock that was running fast', () => {
		// The loop-2 FAIL, through the real store. Tap Reset while the phone is fast, correct
		// the clock, answer: those answers are stamped *before* the reset, and every one of them
		// used to be deleted on the next read while `flush()` reported success.
		for (const skewMs of [MINUTE, 10 * MINUTE, 2 * 3_600_000, 35 * 3_600_000]) {
			const storage = new MemoryStorage();
			let clock = T0 + skewMs;
			const store = new ProgressStore({ storage, now: () => clock });

			store.recordAnswer('L1-0001', true);
			store.flush();
			store.resetAll();

			clock = T0; // the learner fixes the clock
			store.recordAnswer('L1-0010', true);
			store.recordAnswer('L1-0011', true);
			store.recordAnswer('L1-0012', false);
			expect(store.flush()).toBe(true);

			const reloaded = new ProgressStore({ storage, now: () => clock });
			expect(Object.keys(reloaded.state.byWord).sort()).toEqual(['L1-0010', 'L1-0011', 'L1-0012']);
		}
	});

	it('keeps a Reset stuck on a clock running years in the past', () => {
		// The mirror of the same defect: with `stamp()` pulling implausible values back to now,
		// every stored record read as newer than the tombstone and a stale tab's rewrite put the
		// erased history straight back.
		const storage = new MemoryStorage();
		const store = new ProgressStore({ storage, now: () => Date.UTC(2001, 0, 1) });

		store.recordAnswer('L1-0001', true);
		store.recordAnswer('L1-0002', true);
		store.flush();
		const preReset = storage.payload ?? '';

		store.resetAll();
		expect(store.state.byWord).toEqual({});

		// A tab that never saw the reset writes its old blob back over the key.
		storage.items.set(STORAGE_KEY, preReset);
		store.sync();
		store.flush();

		expect(store.state.byWord).toEqual({});
		expect(storage.words()).toEqual({});
		expect(new ProgressStore({ storage, now: () => T0 }).state.byWord).toEqual({});
	});

	it('outranks a reset generation another tab wrote but this one never saw', () => {
		const storage = new MemoryStorage();
		const a = new ProgressStore({ storage, now: () => T0 });
		a.recordAnswer('L1-0001', true);
		a.flush();

		// B is holding the same history. A resets three times while B is not looking.
		const b = new ProgressStore({ storage, now: () => T0 });
		a.resetAll();
		a.resetAll();
		a.resetAll();
		expect(storage.parsed().g).toEqual({ '0': 3 });

		b.recordAnswer('L1-0002', true);
		b.resetAll();

		// Generations merge by Math.max, so B's own reset has to land above A's or it is a no-op.
		expect(storage.parsed().g).toEqual({ '0': 4 });
		expect(storage.words()).toEqual({});
	});

	it('resetAll takes the rescue copy with it', () => {
		const storage = new MemoryStorage();
		// Bytes that will not parse but do hold records. Bytes holding *nothing* are not copied
		// aside at all any more — a panel over four bytes of junk was a fright with no cause.
		const broken = '{"v":1,"w":{"L1-0001":[4,3,1,' + T0 + ',0],"L1-0002":[2,1,0,' + T0 + ',0]';
		storage.items.set(STORAGE_KEY, broken);

		const store = new ProgressStore({ storage, now: () => T0 });
		expect(storage.items.get(BACKUP_KEY)).toBe(broken);

		store.resetAll();

		expect(storage.items.get(BACKUP_KEY)).toBeUndefined();
		expect(store.salvaged).toBe(false);
	});

	it('keeps the rescue copy when the erase itself could not be written', () => {
		// The exact inverse of Reset's promise: the payload survived, and the only copy of it
		// was deleted anyway. A refresh brought every record back with nothing kept aside.
		const storage = new MemoryStorage();
		const broken = '{"v":1,"w":{"L1-0001":[4,3,1,' + T0 + ',0],"L1-0002":[2,1,0,' + T0 + ',0]';
		storage.items.set(STORAGE_KEY, broken);
		const store = new ProgressStore({ storage, now: () => T0 });
		expect(storage.items.get(BACKUP_KEY)).toBe(broken);

		storage.failWrites = true;
		store.resetAll();

		expect(storage.items.get(BACKUP_KEY)).toBe(broken);
		expect(storage.payload).toBe(broken);
		expect(store.status).toBe('failing');
		expect(store.salvaged).toBe(true);
	});
});

describe('the rescue copy', () => {
	it('offers a copy an earlier session left behind, and puts it back on request', () => {
		const storage = new MemoryStorage();
		storage.items.set(
			BACKUP_KEY,
			payloadOf((s) => {
				s.recordAnswer('L1-0044', true);
				s.recordAnswer('L1-0044', true);
				s.noteSession(1);
			})
		);

		const store = new ProgressStore({ storage, now: () => T0 });
		expect(store.rescue).toEqual({
			words: 1,
			answers: 2,
			levels: 1,
			readable: true,
			reason: 'found'
		});

		store.recordAnswer('L1-0001', true);
		store.flush();
		// A write does not make the offer go away — this is the loop-2 "one-shot notice".
		expect(store.salvaged).toBe(true);

		expect(store.restoreRescue()).toBe(true);
		expect(store.forWord('L1-0044').seen).toBe(2);
		expect(store.forWord('L1-0001').seen).toBe(1);
		expect(store.state.levels[1]?.sessions).toBe(1);
		expect(store.rescue).toBeNull();
		expect(storage.items.has(BACKUP_KEY)).toBe(false);

		const reloaded = new ProgressStore({ storage, now: () => T0 });
		expect(reloaded.forWord('L1-0044').seen).toBe(2);
	});

	it('restores history a reset would otherwise have erased again', () => {
		// Restoring is the learner asking for this history *now*, so it is stamped at the
		// current generation and outranks the reset that happened while it sat in the copy.
		const storage = new MemoryStorage();
		storage.items.set(
			BACKUP_KEY,
			payloadOf((s) => s.recordAnswer('L2-0100', true))
		);

		const store = new ProgressStore({ storage, now: () => T0 });
		store.resetLevel(2);

		expect(store.restoreRescue()).toBe(true);
		expect(store.forWord('L2-0100').seen).toBe(1);
		expect(Object.keys(storage.words())).toEqual(['L2-0100']);
	});

	it('says nothing at all about a copy holding nothing at all — and still keeps it', () => {
		const storage = new MemoryStorage();
		storage.items.set(BACKUP_KEY, 'not json');

		const store = new ProgressStore({ storage, now: () => T0 });
		// 'not json' names no word and no session. A panel reading "Earlier progress was kept
		// aside… it is being kept rather than guessed at", with Discard as its only control, is a
		// fright over nothing, and it used to be redisplayed on every single load.
		expect(store.rescue).toBeNull();
		expect(store.restoreRescue()).toBe(false);
		// Not offered is not the same as thrown away: these are bytes this build cannot account
		// for, and deleting a backup for not understanding it is the bug, not the fix.
		expect(storage.items.get(BACKUP_KEY)).toBe('not json');
	});

	it('throws the copy away when the learner does not want it', () => {
		const storage = new MemoryStorage();
		storage.items.set(
			BACKUP_KEY,
			payloadOf((s) => s.recordAnswer('L1-0044', true))
		);

		const store = new ProgressStore({ storage, now: () => T0 });
		store.discardRescue();

		expect(store.rescue).toBeNull();
		expect(storage.items.has(BACKUP_KEY)).toBe(false);
	});
});

describe('Restore puts back what the notice promised, or keeps the copy', () => {
	/** 300 L1 records at `seen: 6`, under a reset counter that outranks every one of them. */
	function suppressedPayload(count = 300): string {
		const w: Record<string, number[]> = {};
		for (let i = 1; i <= count; i += 1) {
			w[`L1-${String(i).padStart(4, '0')}`] = [6, 4, 1, T0, T0 - MINUTE];
		}
		return JSON.stringify({ v: 1, w, l: { 1: [4, T0] }, g: { 1: 3 } });
	}

	it('reads a backup past its own reset counter instead of restoring nothing', () => {
		// The loop-4 data-destruction bug, exactly. `decodeStored` re-applied the *backup\u2019s own*
		// `g` — the very thing it was copied aside because of — so a 300-record copy decoded to
		// zero, `restoreInto` folded in nothing, the write landed, `restoreRescue` returned true
		// on the strength of that, and `discardRescue` deleted the only copy. "Restore it" cost
		// the learner everything and left no failure line.
		const storage = new MemoryStorage();
		storage.items.set(BACKUP_KEY, suppressedPayload());

		const store = new ProgressStore({ storage, now: () => T0 });
		expect(store.rescue).toEqual({
			words: 300,
			answers: 1800,
			levels: 1,
			readable: true,
			reason: 'found'
		});

		expect(store.restoreRescue()).toBe(true);
		expect(store.levelSummary(1).seen).toBe(300);
		expect(Object.keys(storage.words())).toHaveLength(300);
		// Deleted only because those words are now in the live key.
		expect(storage.items.has(BACKUP_KEY)).toBe(false);
		expect(new ProgressStore({ storage, now: () => T0 }).levelSummary(1).seen).toBe(300);
	});

	it('never prints a word count and an answer count from two different reads', () => {
		// "It holds 300 words · 0 answers" over 300 records each carrying `seen: 6`. `words` came
		// from a scan of the bytes and `answers` from a decode a reset counter had emptied; the
		// button then honoured the second number.
		const storage = new MemoryStorage();
		storage.items.set(BACKUP_KEY, suppressedPayload(12));

		const store = new ProgressStore({ storage, now: () => T0 });
		expect(store.rescue?.words).toBe(12);
		expect(store.rescue?.answers).toBe(72);
	});

	it('keeps the copy when the restore lands a write but puts nothing back', () => {
		// The general defect: `restoreRescue` returned true because `flush()` returned true.
		// A write landing says a write happened; it says nothing about what is in the key. The
		// merge here is handed a bug on purpose — that is what the `merge` option is for.
		const storage = new MemoryStorage();
		storage.items.set(
			BACKUP_KEY,
			payloadOf((s) => {
				s.recordAnswer('L1-0044', true);
				s.recordAnswer('L1-0045', true);
				s.recordAnswer('L1-0046', true);
			})
		);
		storage.items.set(
			STORAGE_KEY,
			payloadOf((s) => s.recordAnswer('L1-0100', true))
		);

		const store = new ProgressStore({
			storage,
			now: () => T0,
			merge: () => emptyStored()
		});
		// Another tab moves the key, so the merge actually runs rather than taking the fast path.
		storage.items.set(
			STORAGE_KEY,
			payloadOf((s) => {
				s.recordAnswer('L1-0100', true);
				s.recordAnswer('L1-0101', true);
			})
		);

		expect(store.restoreRescue()).toBe(false);
		expect(store.restoreReport).toEqual({ promised: 3, landed: 0 });
		// The only copy is still there, and still holds all three.
		expect(store.rescue?.words).toBe(3);
		expect(store.salvaged).toBe(true);
		expect(JSON.parse(storage.items.get(BACKUP_KEY) ?? '{}').w).toHaveProperty('L1-0046');
	});

	it('restores a payload from a schema version this build has never seen', () => {
		// A rollback from a future deploy. Its records are byte-identical to ours; refusing to
		// *read* them only meant Discard was the single exit from every word the learner had.
		const storage = new MemoryStorage();
		const w: Record<string, number[]> = {};
		for (let i = 1; i <= 120; i += 1) w[`L3-${String(i).padStart(4, '0')}`] = [5, 4, 2, T0, 0];
		storage.items.set(BACKUP_KEY, JSON.stringify({ v: 7, w }));

		const store = new ProgressStore({ storage, now: () => T0 });
		expect(store.rescue?.readable).toBe(true);
		expect(store.rescue?.words).toBe(120);
		expect(store.restoreRescue()).toBe(true);
		expect(store.levelSummary(3).seen).toBe(120);
	});

	it('restores a word map that arrived as an array of objects', () => {
		const storage = new MemoryStorage();
		const w = [];
		for (let i = 1; i <= 40; i += 1) {
			w.push({
				id: `L2-${String(i).padStart(4, '0')}`,
				seen: 7,
				correct: 5,
				streak: 3,
				lastSeen: T0,
				lastMissed: T0 - MINUTE
			});
		}
		storage.items.set(BACKUP_KEY, JSON.stringify({ v: 1, w }));

		const store = new ProgressStore({ storage, now: () => T0 });
		expect(store.rescue?.words).toBe(40);
		expect(store.restoreRescue()).toBe(true);
		expect(store.levelSummary(2).seen).toBe(40);
		expect(store.levelSummary(2).mastered).toBe(40);
	});

	it('salvages the whole records out of a write that was cut off', () => {
		const storage = new MemoryStorage();
		const full = payloadOf((s) => {
			for (let i = 1; i <= 60; i += 1) s.recordAnswer(`L1-${String(i).padStart(4, '0')}`, true);
		});
		storage.items.set(BACKUP_KEY, full.slice(0, Math.floor(full.length * 0.7)));

		const store = new ProgressStore({ storage, now: () => T0 });
		expect(store.rescue?.readable).toBe(true);
		expect(store.rescue?.words).toBeGreaterThan(30);
		expect(store.restoreRescue()).toBe(true);
		expect(store.levelSummary(1).seen).toBeGreaterThan(30);
	});

	it('will not let bytes that merely mention word ids evict a real copy', () => {
		// `{"v":99,"note":[400 id strings]}` weighed 400 words against a readable 50-word backup
		// and replaced it, on a plain page load, with no user action anywhere. A list of names is
		// not a list of records.
		const storage = new MemoryStorage();
		const real = payloadOf((s) => {
			for (let i = 1; i <= 50; i += 1) {
				s.recordAnswer(`L1-${String(i).padStart(4, '0')}`, true);
				s.recordAnswer(`L1-${String(i).padStart(4, '0')}`, true);
			}
		});
		storage.items.set(BACKUP_KEY, real);
		const ids = [];
		for (let i = 1; i <= 400; i += 1) ids.push(`L1-${String(i).padStart(4, '0')}`);
		storage.items.set(STORAGE_KEY, JSON.stringify({ v: 99, note: ids }));

		const store = new ProgressStore({ storage, now: () => T0 });
		expect(storage.items.get(BACKUP_KEY)).toBe(real);
		expect(store.rescue?.words).toBe(50);
		expect(store.rescue?.answers).toBe(100);
	});

	it('raises no notice over four bytes of junk, and keeps no copy of them', () => {
		for (const junk of ['null', '[]', '"x"', '123', '{"v":1,"w":null}']) {
			const storage = new MemoryStorage();
			storage.items.set(STORAGE_KEY, junk);
			const store = new ProgressStore({ storage, now: () => T0 });
			expect(store.rescue, junk).toBeNull();
			expect(storage.items.has(BACKUP_KEY), junk).toBe(false);
		}
	});
});

describe('no write may shrink the key without a copy kept aside', () => {
	/** N word records, as bytes the store would recognise. */
	function payloadOfSize(n: number, level = 1): string {
		const w: Record<string, number[]> = {};
		for (let i = 1; i <= n; i += 1) w[`L${level}-${String(i).padStart(4, '0')}`] = [3, 2, 1, T0, 0];
		return JSON.stringify({ v: 1, w, l: {} });
	}

	it('rescues the key when a corrupt generation counter would empty it', () => {
		// `1e308 + 1e308` used to overflow to `Infinity`, which `count()` read back as 0, so
		// `encode` dropped every record on the way out while `flush()` returned true and the
		// home screen went on promising "Progress is kept on this device".
		const storage = new MemoryStorage();
		storage.items.set(
			STORAGE_KEY,
			`{"v":1,"w":{"L3-0001":[5,5,5,${T0},0]},"g":{"0":1e308,"3":1e308}}`
		);

		const store = new ProgressStore({ storage, now: () => T0 });

		// The counter is junk, so it is ignored rather than honoured: nothing is deleted.
		expect(store.forWord('L3-0001').seen).toBe(5);

		for (let i = 2; i <= 6; i += 1) store.recordAnswer(`L3-000${i}`, true);
		expect(store.flush()).toBe(true);

		const reloaded = new ProgressStore({ storage, now: () => T0 });
		for (let i = 2; i <= 6; i += 1) expect(reloaded.forWord(`L3-000${i}`).seen).toBe(1);
		expect(reloaded.forWord('L3-0001').seen).toBe(5);
	});

	it('ignores a generation counter no reset could have produced', () => {
		const storage = new MemoryStorage();
		storage.items.set(
			STORAGE_KEY,
			`{"v":1,"w":{"L1-0001":[3,3,3,${T0},0],"L1-0002":[2,2,2,${T0},0]},"g":{"0":"9999999999999999999999"}}`
		);

		const store = new ProgressStore({ storage, now: () => T0 });

		expect(store.levelSummary(1).seen).toBe(2);
		expect(store.rescue).toBeNull();
	});

	it('rescues a payload whose word map is the wrong shape', () => {
		// It parses, so the old net let it through; it decodes to zero words, so the first
		// answer overwrote all two hundred with no copy anywhere.
		const storage = new MemoryStorage();
		const entries = Array.from(
			{ length: 200 },
			(_, i) => `{"id":"L1-${String(i + 1).padStart(4, '0')}","seen":3}`
		);
		const arrayShaped = `{"v":1,"w":[${entries.join(',')}],"l":{}}`;
		storage.items.set(STORAGE_KEY, arrayShaped);

		const store = new ProgressStore({ storage, now: () => T0 });
		store.recordAnswer('L1-0401', true);
		store.flush();

		expect(storage.items.get(BACKUP_KEY)).toBe(arrayShaped);
		expect(store.rescue?.words).toBe(200);
		// Fully parseable — just not in the shape the live key is allowed to hold. Calling it
		// unreadable left Discard as the only exit from the most machine-readable corruption
		// there is, over two hundred of the learner's words.
		expect(store.rescue?.readable).toBe(true);
		expect(store.restoreRescue()).toBe(true);
		// Two hundred back, plus the one answered while they were sitting in the copy.
		expect(store.levelSummary(1).seen).toBe(201);
	});

	it('lets a reset shrink the key without crying about it', () => {
		const storage = new MemoryStorage();
		storage.items.set(STORAGE_KEY, payloadOfSize(120));

		const store = new ProgressStore({ storage, now: () => T0 });
		expect(store.levelSummary(1).seen).toBe(120);

		expect(store.resetAll()).toBe(true);

		expect(store.rescue).toBeNull();
		expect(storage.items.has(BACKUP_KEY)).toBe(false);
		expect(storage.words()).toEqual({});
		expect(store.eraseFailed).toBe(false);
	});

	it('says a reset did not happen when the write was refused', () => {
		// The erase empties memory first, so every screen goes blank — while the key still holds
		// every record. "These answers live only in this tab" was the wrong sentence entirely.
		const storage = new MemoryStorage();
		storage.items.set(STORAGE_KEY, payloadOfSize(3));
		const store = new ProgressStore({ storage, now: () => T0 });

		storage.failWrites = true;
		expect(store.resetAll()).toBe(false);

		expect(store.eraseFailed).toBe(true);
		expect(storage.payload).toBe(payloadOfSize(3));

		// Rolled back with it: the screen must not assert an erasure that did not happen. The
		// retry goes too — a reset belongs to the tap that asked for it, not to a backoff landing
		// minutes later under a notice that already said it did not happen.
		expect(store.levelSummary(1).seen).toBe(3);

		storage.failWrites = false;
		store.recordAnswer('L1-0001', true);
		expect(store.flush()).toBe(true);
		expect(store.eraseFailed).toBe(false);
		expect(store.levelSummary(1).seen).toBe(3);
	});
});

describe('storage cleared elsewhere', () => {
	it('adopts the erasure instead of writing everything back', () => {
		// `clear()` and "clear site data" report a storage event with a null key. Routing that
		// into `sync()` merged the emptied key against memory and rewrote every record, so
		// clearing site data with a second tab open cleared nothing at all.
		const { store, storage } = makeStore();
		store.recordAnswer('L1-0001', true);
		store.recordAnswer('L1-0002', true);
		store.flush();

		storage.items.clear();
		store.noteStorageCleared();

		expect(store.state.byWord).toEqual({});
		expect(store.pending).toBe(false);
		store.flush();
		expect(storage.payload).toBeNull();
	});
});

describe('summarize', () => {
	it('reports coverage, mastery and accuracy over a level word list', () => {
		const { store } = makeStore();

		store.recordAnswer('L1-0001', true);
		store.recordAnswer('L1-0001', true);
		store.recordAnswer('L1-0001', true);
		store.recordAnswer('L1-0002', false);

		const summary = store.summarize(['L1-0001', 'L1-0002', 'L1-0003', 'L1-0004']);

		expect(summary).toEqual({
			total: 4,
			seen: 2,
			met: 2,
			mastered: 1,
			answers: 4,
			correct: 3,
			accuracy: 0.75
		});
	});

	it('reports a level without being handed its word list', () => {
		const { store } = makeStore();

		store.recordAnswer('L1-0001', true);
		store.recordAnswer('L1-0001', true);
		store.recordAnswer('L1-0001', true);
		store.recordAnswer('L1-0002', false);
		store.recordAnswer('L2-0001', true);

		// The denominator is how many words the app *ships* at that level, not how many rows the
		// official standard lists — a learner cannot practise a word that is not in the box, so
		// an arc drawn against the official count could never fill. The store knows the figure
		// without loading the list.
		expect(store.levelSummary(1)).toEqual({
			total: SHIPPED_SIZES[1],
			seen: 2,
			met: 2,
			mastered: 1,
			answers: 4,
			correct: 3,
			accuracy: 0.75
		});
		expect(store.levelSummary(2).seen).toBe(1);
		expect(store.levelSummary(3)).toEqual({
			total: SHIPPED_SIZES[3],
			seen: 0,
			met: 0,
			mastered: 0,
			answers: 0,
			correct: 0,
			accuracy: 0
		});
	});

	it('refuses word ids that cannot name anything this app ships', () => {
		const storage = new MemoryStorage();
		const w: Record<string, number[]> = {};
		// HSK 1 stops at L1-0500. These pass the id *shape* but name no word.
		for (let i = 0; i < 900; i += 1) w[`L1-9${String(i).padStart(3, '0')}`] = [3, 3, 3, T0, 0];
		w['L9-0001'] = [3, 3, 3, T0, 0];
		// Ids that fail the guard's own shape test but that `levelOfId` still files under HSK 1.
		// The guard used to wave every one of these through — it returned true whenever its
		// regex did *not* match — so forty of them read as forty practised and forty mastered.
		w['L1-9000x'] = [3, 3, 3, T0, 0];
		w['L1-0001 '] = [3, 3, 3, T0, 0];
		w['L1-+1'] = [3, 3, 3, T0, 0];
		w['L1-0007'] = [3, 3, 3, T0, 0];
		storage.items.set(STORAGE_KEY, JSON.stringify({ v: 1, w, l: {} }));

		const store = new ProgressStore({ storage, now: () => T0 });

		// Only the real one survives, so every counter downstream agrees rather than the home
		// headline reading "901 words practised" over a card that reads "500 words".
		expect(Object.keys(store.state.byWord)).toEqual(['L1-0007']);
		expect(store.levelSummary(1).seen).toBe(1);
	});

	it('never reports more practised words than the level ships', () => {
		const storage = new MemoryStorage();
		const w: Record<string, number[]> = {};
		// Every official HSK 2 row id. All 772 are real ids; only 770 are cards, because two
		// pairs of same-level homographs share one. The figure a learner sees is out of 770.
		for (let i = 1; i <= 772; i += 1) w[`L2-${String(i).padStart(4, '0')}`] = [3, 3, 3, T0, 0];
		storage.items.set(STORAGE_KEY, JSON.stringify({ v: 1, w, l: {} }));

		const store = new ProgressStore({ storage, now: () => T0 });
		const summary = store.levelSummary(2);

		expect(Object.keys(store.state.byWord)).toHaveLength(772);
		expect(summary.total).toBe(SHIPPED_SIZES[2]);
		expect(summary.seen).toBe(SHIPPED_SIZES[2]);
		expect(summary.mastered).toBe(SHIPPED_SIZES[2]);
		// The answers themselves are not clamped — they really were given.
		expect(summary.answers).toBe(772 * 3);
	});

	it('reports zeroed figures before anything is answered', () => {
		const { store } = makeStore();

		expect(store.summarize(['L1-0001'])).toEqual({
			total: 1,
			seen: 0,
			met: 0,
			mastered: 0,
			answers: 0,
			correct: 0,
			accuracy: 0
		});
	});
});

describe('cross-tab sync', () => {
	it('adopts another tab write when this tab has nothing pending', () => {
		const { store, storage } = makeStore();

		const other = new ProgressStore({ storage, now: () => T0 });
		other.recordAnswer('L1-0001', true);
		other.flush();

		store.sync();

		expect(store.forWord('L1-0001').seen).toBe(1);
	});

	it('keeps both tabs’ answers instead of the last write winning', () => {
		vi.useFakeTimers();
		const storage = new MemoryStorage();
		const store = new ProgressStore({ storage });
		const other = new ProgressStore({ storage });

		store.recordAnswer('L1-0001', true);
		other.recordAnswer('L1-0002', true);
		other.flush();

		// This tab is mid-debounce and has not seen the other write yet.
		store.sync();
		expect(store.forWord('L1-0001').seen).toBe(1);
		expect(store.forWord('L1-0002').seen).toBe(1);

		// And its own write does not roll the other tab back off the key.
		vi.advanceTimersByTime(2000);
		expect(storage.words()).toHaveProperty('L1-0001');
		expect(storage.words()).toHaveProperty('L1-0002');
	});

	it('merges a blind flush from a tab that never saw the other one', () => {
		const storage = new MemoryStorage();
		const a = new ProgressStore({ storage, now: () => T0 });
		const b = new ProgressStore({ storage, now: () => T0 + 10 });

		a.recordAnswer('L1-0001', true);
		b.recordAnswer('L2-0002', true);

		// No `storage` event in between: each tab writes believing it is alone.
		a.flush();
		b.flush();

		expect(storage.words()).toHaveProperty('L1-0001');
		expect(storage.words()).toHaveProperty('L2-0002');
	});

	it('adds up two tabs answering the same word rather than taking the larger', () => {
		const storage = new MemoryStorage();
		const a = new ProgressStore({ storage, now: () => T0 });
		a.recordAnswer('L1-0001', true);
		a.flush();

		const b = new ProgressStore({ storage, now: () => T0 + 1000 });
		a.recordAnswer('L1-0001', true);
		b.recordAnswer('L1-0001', true);
		a.flush();
		b.flush();

		// One answer before the tabs diverged, then one in each: three, not two.
		expect(storage.words()['L1-0001']?.[0]).toBe(3);
	});

	it('does not let a mid-write tab resurrect a reset', () => {
		const storage = new MemoryStorage();
		const a = new ProgressStore({ storage, now: () => T0 });
		a.recordAnswer('L1-0001', true);
		a.noteSession(1);
		a.flush();

		// B loads the same history and answers, but has not written yet.
		let bClock = T0 + 1000;
		const b = new ProgressStore({ storage, now: () => bClock });
		b.recordAnswer('L1-0002', true);

		// A wipes everything, after B's answer.
		bClock = T0 + 2000;
		const a2 = new ProgressStore({ storage, now: () => T0 + 2000 });
		a2.resetAll();

		// B's debounce finally lands. It must not put the erased history back.
		bClock = T0 + 3000;
		b.flush();

		const payload = storage.parsed();
		expect(payload.w).toEqual({});
		expect(payload.l).toEqual({});
		expect(payload.g).toEqual({ '0': 1 });

		const reloaded = new ProgressStore({ storage, now: () => T0 + 4000 });
		expect(reloaded.state.byWord).toEqual({});
	});

	it('carries the reset generation forward so a stale rewrite stays reset', () => {
		const storage = new MemoryStorage();
		let clock = T0;
		const store = new ProgressStore({ storage, now: () => clock });
		store.recordAnswer('L1-0001', true);
		store.flush();

		clock = T0 + 5000;
		store.resetAll();

		// Something rewrites the key with the old history, generation and all stripped away —
		// an older build, or a tab that had the payload cached from before the reset.
		storage.items.set(
			STORAGE_KEY,
			payloadOf((s) => s.recordAnswer('L1-0001', true))
		);

		clock = T0 + 6000;
		store.sync();

		// The reset stands: that record was written under the previous generation.
		expect(store.state.byWord).toEqual({});

		// And `sync` noticed the key had lost the generation, so it schedules the correction
		// rather than leaving the two out of step until the next answer.
		expect(store.pending).toBe(true);
		store.flush();
		expect(storage.parsed().g).toEqual({ '0': 1 });
	});
});

describe('server-side import', () => {
	it('gives the singleton an empty, memory-only state when there is no window', () => {
		// Importing this module during SSR must not reach for storage or schedule anything.
		expect(progress.persistent).toBe(false);
		expect(progress.status).toBe('unavailable');
		expect(progress.state.byWord).toEqual({});
		expect(progress.state.levels).toEqual({});
	});
});
