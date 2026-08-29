import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProgressStore, progress, type StorageLike } from './progress.svelte.ts';
import { STORAGE_KEY } from './progress-core.ts';
import { SHIPPED_SIZES } from '$lib/data/sizes';

/** A `localStorage` stand-in that can be made to misbehave the way real ones do. */
class MemoryStorage implements StorageLike {
	items = new Map<string, string>();
	writes = 0;
	failReads = false;
	failWrites = false;

	getItem(key: string): string | null {
		if (this.failReads) throw new Error('SecurityError: access denied');
		return this.items.get(key) ?? null;
	}

	setItem(key: string, value: string): void {
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
}

/** A store wired to a fresh fake storage and a clock the test drives. */
function makeStore(storage: MemoryStorage = new MemoryStorage(), start = 1_756_000_000_000) {
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
			lastSeen: 1_756_000_001_000,
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
		expect(missed.lastMissed).toBe(1_756_000_005_000);

		store.recordAnswer('L2-0100', true);
		expect(store.forWord('L2-0100').streak).toBe(1);
	});

	it('ignores an empty word id instead of creating a junk record', () => {
		const { store } = makeStore();

		store.recordAnswer('', true);

		expect(Object.keys(store.state.byWord)).toEqual([]);
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
});

describe('noteSession', () => {
	it('counts sessions per level and stamps the last play', () => {
		const { store, tick } = makeStore();

		store.noteSession(3);
		tick(60_000);
		store.noteSession(3);
		store.noteSession(1);

		expect(store.state.levels[3]).toEqual({ sessions: 2, lastPlayed: 1_756_000_060_000 });
		expect(store.state.levels[1]).toEqual({ sessions: 1, lastPlayed: 1_756_000_060_000 });
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
		expect(reloaded.forWord('L1-0002').lastMissed).toBe(1_756_000_000_000);
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
});

describe('hostile storage', () => {
	it('works entirely in memory when there is no localStorage', () => {
		const store = new ProgressStore({ storage: null });

		store.recordAnswer('L1-0001', true);
		store.noteSession(1);
		store.flush();

		expect(store.persistent).toBe(false);
		expect(store.forWord('L1-0001').seen).toBe(1);
		expect(store.state.levels[1]?.sessions).toBe(1);
	});

	it('degrades when reading throws, the way Safari private mode does', () => {
		const storage = new MemoryStorage();
		storage.failReads = true;

		const store = new ProgressStore({ storage });

		expect(store.persistent).toBe(false);
		store.recordAnswer('L1-0001', true);
		store.flush();
		expect(store.forWord('L1-0001').seen).toBe(1);
		expect(storage.payload).toBeNull();
	});

	it('keeps the session alive when the quota is exceeded, and stops retrying', () => {
		vi.useFakeTimers();
		const storage = new MemoryStorage();
		const store = new ProgressStore({ storage });
		storage.failWrites = true;

		store.recordAnswer('L1-0001', true);
		store.flush();

		expect(store.persistent).toBe(false);
		expect(store.forWord('L1-0001').seen).toBe(1);

		store.recordAnswer('L1-0002', true);
		vi.advanceTimersByTime(5000);

		expect(storage.writes).toBe(0);
		expect(store.forWord('L1-0002').seen).toBe(1);
	});

	it('starts empty on corrupt JSON and repairs the key on the next write', () => {
		const storage = new MemoryStorage();
		storage.items.set(STORAGE_KEY, '{"v":1,"w":{"L1-0001":[1,1,');

		const store = new ProgressStore({ storage });
		expect(Object.keys(store.state.byWord)).toEqual([]);

		store.recordAnswer('L1-0009', true);
		store.flush();

		const reloaded = new ProgressStore({ storage });
		expect(reloaded.forWord('L1-0009').seen).toBe(1);
	});

	it('leaves a payload from a newer schema untouched until there is better data', () => {
		const storage = new MemoryStorage();
		const future = JSON.stringify({ v: 99, w: { 'L1-0001': [3, 3, 3, 1, 0] } });
		storage.items.set(STORAGE_KEY, future);

		const store = new ProgressStore({ storage });

		expect(store.forWord('L1-0001').seen).toBe(0);
		// Loading never schedules a write, so the unreadable bytes are still there.
		expect(storage.payload).toBe(future);
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
						lastSeen: 1_755_000_000_000,
						lastMissed: 1_754_000_000_000
					}
				},
				levels: { '1': { sessions: 7, lastPlayed: 1_755_000_000_001 } }
			})
		);

		const store = new ProgressStore({ storage, now: () => 1_756_000_000_000 });
		expect(store.forWord('L1-0001').correct).toBe(3);
		expect(store.state.levels[1]?.sessions).toBe(7);

		store.recordAnswer('L1-0001', true);
		store.flush();

		const payload = JSON.parse(storage.payload ?? '{}');
		expect(payload.v).toBe(1);
		expect(payload.w['L1-0001']).toEqual([5, 4, 2, 1_756_000_000_000, 1_754_000_000_000]);
		expect(payload.byWord).toBeUndefined();
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

	it('resetAll clears memory and removes the key', () => {
		const { store, storage } = makeStore();

		store.recordAnswer('L1-0001', true);
		store.noteSession(1);
		store.flush();
		expect(storage.payload).not.toBeNull();

		store.resetAll();

		expect(store.state.byWord).toEqual({});
		expect(store.state.levels).toEqual({});
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

		const other = new ProgressStore({ storage, now: () => 1_756_000_000_000 });
		other.recordAnswer('L1-0001', true);
		other.flush();

		store.sync();

		expect(store.forWord('L1-0001').seen).toBe(1);
	});

	it('keeps unsaved local answers rather than losing them to another tab', () => {
		vi.useFakeTimers();
		const storage = new MemoryStorage();
		const store = new ProgressStore({ storage });
		const other = new ProgressStore({ storage });

		store.recordAnswer('L1-0001', true);
		other.recordAnswer('L1-0002', true);
		other.flush();

		store.sync();

		expect(store.forWord('L1-0001').seen).toBe(1);
	});
});

describe('server-side import', () => {
	it('gives the singleton an empty, memory-only state when there is no window', () => {
		// Importing this module during SSR must not reach for storage or schedule anything.
		expect(progress.persistent).toBe(false);
		expect(progress.state.byWord).toEqual({});
		expect(progress.state.levels).toEqual({});
	});
});
