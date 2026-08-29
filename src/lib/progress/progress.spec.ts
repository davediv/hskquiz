import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProgressStore, progress, type StorageLike } from './progress.svelte.ts';
import { BACKUP_KEY, STORAGE_KEY, encode } from './progress-core.ts';
import { SHIPPED_SIZES } from '$lib/data/sizes';

/** A clock that is safely inside the decoder's plausibility window. */
const T0 = 1_787_000_000_000;

/** A `localStorage` stand-in that can be made to misbehave the way real ones do. */
class MemoryStorage implements StorageLike {
	items = new Map<string, string>();
	/** Writes that landed. */
	writes = 0;
	/** Writes that were *tried*, including the ones that threw — the retry counter. */
	attempts = 0;
	failReads = false;
	failWrites = false;

	getItem(key: string): string | null {
		if (this.failReads) throw new Error('SecurityError: access denied');
		return this.items.get(key) ?? null;
	}

	setItem(key: string, value: string): void {
		this.attempts += 1;
		if (this.failWrites) {
			const error = new Error('The quota has been exceeded.');
			error.name = 'QuotaExceededError';
			throw error;
		}
		this.writes += 1;
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
}

/** A store wired to a fresh fake storage and a clock the test drives. */
function makeStore(storage: MemoryStorage = new MemoryStorage(), start = T0) {
	let clock = start;
	const store = new ProgressStore({ storage, now: () => clock });
	return { store, storage, tick: (ms: number) => (clock += ms) };
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

		expect(store.forWord('L1-0001')).toEqual({
			wordId: 'L1-0001',
			seen: 2,
			correct: 2,
			streak: 2,
			lastSeen: T0 + 1000,
			lastMissed: 0
		});
	});

	it('resets the streak on a miss and remembers when it happened', () => {
		const { store, tick } = makeStore();

		store.recordAnswer('L2-0100', true);
		store.recordAnswer('L2-0100', true);
		expect(store.forWord('L2-0100').streak).toBe(2);

		tick(5000);
		store.recordAnswer('L2-0100', false);

		const missed = store.forWord('L2-0100');
		expect(missed.streak).toBe(0);
		expect(missed.correct).toBe(2);
		expect(missed.seen).toBe(3);
		expect(missed.lastMissed).toBe(T0 + 5000);

		store.recordAnswer('L2-0100', true);
		expect(store.forWord('L2-0100').streak).toBe(1);
	});

	it('ignores an empty word id instead of creating a junk record', () => {
		const { store } = makeStore();

		store.recordAnswer('', true);

		expect(Object.keys(store.state.byWord)).toEqual([]);
	});

	it('refuses ids that would write through to Object.prototype', () => {
		const { store, storage } = makeStore();

		store.recordAnswer('__proto__', true);
		store.recordAnswer('constructor', true);
		store.recordAnswer('toString', true);
		store.flush();

		expect(Object.keys(store.state.byWord)).toEqual([]);
		expect(store.forWord('__proto__').seen).toBe(0);
		expect(storage.payload).toBeNull();
		// The map is still a map, not something wearing a poisoned prototype.
		expect(typeof store.forWord('L1-0001')).toBe('object');
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
		expect(store.state.byWord['L4-0999']).toBeUndefined();
	});

	it('hands back a detached copy, so a stray write cannot rewrite history', () => {
		const { store } = makeStore();
		store.recordAnswer('L1-0001', true);
		store.flush();

		const record = store.forWord('L1-0001');
		record.seen = 999;
		record.correct = 999;

		expect(store.forWord('L1-0001').seen).toBe(1);
		expect(store.levelSummary(1).answers).toBe(1);
	});

	it('never returns something inherited from Object.prototype', () => {
		const { store } = makeStore();

		for (const id of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__']) {
			expect(typeof store.forWord(id)).toBe('object');
			expect(store.forWord(id).seen).toBe(0);
		}
	});
});

describe('noteSession', () => {
	it('counts sessions per level and stamps the last play', () => {
		const { store, tick } = makeStore();

		store.noteSession(3);
		tick(60_000);
		store.noteSession(3);
		store.noteSession(1);

		expect(store.state.levels[3]).toEqual({ sessions: 2, lastPlayed: T0 + 60_000 });
		expect(store.state.levels[1]).toEqual({ sessions: 1, lastPlayed: T0 + 60_000 });
		expect(store.state.levels[2]).toBeUndefined();
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

		for (let i = 0; i < 10; i += 1) store.recordAnswer(`L1-000${i}`, true);
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

	it('copies bytes it cannot read aside instead of destroying them', () => {
		const storage = new MemoryStorage();
		const corrupt = '{"v":1,"w":{"L1-0001":[1,1,';
		storage.items.set(STORAGE_KEY, corrupt);

		const store = new ProgressStore({ storage, now: () => T0 });
		expect(Object.keys(store.state.byWord)).toEqual([]);
		// The rescue happens on load, before anything can overwrite the key.
		expect(storage.items.get(BACKUP_KEY)).toBe(corrupt);
		expect(store.salvaged).toBe(true);

		store.recordAnswer('L1-0009', true);
		store.flush();

		const reloaded = new ProgressStore({ storage });
		expect(reloaded.forWord('L1-0009').seen).toBe(1);
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

	it('keeps the first rescue copy rather than overwriting it with later junk', () => {
		const storage = new MemoryStorage();
		storage.items.set(BACKUP_KEY, 'the original');
		storage.items.set(STORAGE_KEY, 'also broken');

		const store = new ProgressStore({ storage, now: () => T0 });

		expect(store.salvaged).toBe(true);
		expect(storage.items.get(BACKUP_KEY)).toBe('the original');
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

		const payload = JSON.parse(storage.payload ?? '{}');
		expect(payload.v).toBe(1);
		expect(payload.w['L1-0001']).toEqual([5, 4, 2, T0, T0 - 2_000_000]);
		expect(payload.byWord).toBeUndefined();
		expect(storage.items.get(BACKUP_KEY)).toBeUndefined();
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

		const reloaded = new ProgressStore({ storage });
		expect(reloaded.forWord('L1-0001').seen).toBe(0);
		expect(reloaded.forWord('L2-0500').seen).toBe(1);
	});

	it('resetLevel accepts an explicit word list', () => {
		const { store } = makeStore();

		store.recordAnswer('custom-a', true);
		store.recordAnswer('custom-b', true);

		store.resetLevel(1, ['custom-a']);

		expect(store.state.byWord['custom-a']).toBeUndefined();
		expect(store.state.byWord['custom-b']).toBeDefined();
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

		// What stays is a tombstone and nothing else: no words, no sessions. Removing the key
		// outright is what let a second tab write the history straight back.
		const payload = JSON.parse(storage.payload ?? '{}');
		expect(payload.w).toEqual({});
		expect(payload.l).toEqual({});
		expect(payload.c).toEqual({ '0': T0 });

		const reloaded = new ProgressStore({ storage, now: () => T0 });
		expect(reloaded.state.byWord).toEqual({});
		expect(reloaded.state.levels).toEqual({});
	});

	it('resetAll takes the rescue copy with it', () => {
		const storage = new MemoryStorage();
		storage.items.set(STORAGE_KEY, 'broken bytes');

		const store = new ProgressStore({ storage, now: () => T0 });
		expect(storage.items.get(BACKUP_KEY)).toBe('broken bytes');

		store.resetAll();

		expect(storage.items.get(BACKUP_KEY)).toBeUndefined();
		expect(store.salvaged).toBe(false);
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
			mastered: 1,
			answers: 4,
			correct: 3,
			accuracy: 0.75
		});
		expect(store.levelSummary(2).seen).toBe(1);
		expect(store.levelSummary(3)).toEqual({
			total: SHIPPED_SIZES[3],
			seen: 0,
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

		const payload = JSON.parse(storage.payload ?? '{}');
		expect(payload.w).toEqual({});
		expect(payload.l).toEqual({});
		expect(payload.c).toEqual({ '0': T0 + 2000 });

		const reloaded = new ProgressStore({ storage, now: () => T0 + 4000 });
		expect(reloaded.state.byWord).toEqual({});
	});

	it('carries the tombstone forward so a stale rewrite stays reset', () => {
		const storage = new MemoryStorage();
		let clock = T0;
		const store = new ProgressStore({ storage, now: () => clock });
		store.recordAnswer('L1-0001', true);
		store.flush();

		clock = T0 + 5000;
		store.resetAll();

		// Something rewrites the key with the old history, tombstone and all stripped away —
		// an older build, or a tab that had the payload cached from before the reset.
		const stale = new ProgressStore({ storage: null, now: () => T0 });
		stale.recordAnswer('L1-0001', true);
		storage.items.set(STORAGE_KEY, encode(stale.state));

		clock = T0 + 6000;
		store.sync();

		// The reset stands: that record predates it.
		expect(store.state.byWord).toEqual({});

		// And `sync` noticed the key was missing the tombstone, so it schedules the correction
		// rather than leaving the two out of step until the next answer.
		expect(store.pending).toBe(true);
		store.flush();
		expect(JSON.parse(storage.payload ?? '{}').c).toEqual({ '0': T0 + 5000 });
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
