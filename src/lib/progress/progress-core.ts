/**
 * Pure progress logic: the persisted wire format, its decoder, and the answer maths.
 *
 * Deliberately rune-free and side-effect-free so it can be reasoned about (and tested) on
 * its own. Everything that touches `localStorage`, timers or reactivity lives in
 * `progress.svelte.ts`.
 *
 * ## Wire format
 *
 * One key holds one JSON object. Word records are stored as fixed-order tuples rather than
 * objects because the map is the only thing that grows: at 4,316 answered words the verbose
 * shape is ~560 KB of JSON to re-serialise, the tuple shape ~200 KB.
 *
 * ```json
 * { "v": 1, "w": { "L1-0001": [seen, correct, streak, lastSeen, lastMissed] },
 *           "l": { "1": [sessions, lastPlayed] } }
 * ```
 *
 * The decoder is deliberately forgiving: it accepts the tuple form, the verbose
 * `ProgressState` form written by pre-v1 builds, and any half-corrupt mixture of the two,
 * sanitising every field on the way in. It never throws.
 */

import { LEVELS, type Level, type ProgressState, type WordProgress } from '$lib/types';

/** Bumped only when a change to the stored shape can no longer be read by the decoder below. */
export const SCHEMA_VERSION = 1;

/** The one and only key this app writes. The version is in the name *and* in the payload. */
export const STORAGE_KEY = 'hskquiz:progress:v1';

/** Consecutive correct answers before a word counts as mastered on the level screen. */
export const MASTERY_STREAK = 3;

type LevelEntry = NonNullable<ProgressState['levels'][Level]>;

/** A fresh, empty state. */
export function emptyState(): ProgressState {
	return { version: SCHEMA_VERSION, byWord: {}, levels: {} };
}

/** A zero record for a word that has never been answered. Not inserted into state by itself. */
export function blankWord(wordId: string): WordProgress {
	return { wordId, seen: 0, correct: 0, streak: 0, lastSeen: 0, lastMissed: 0 };
}

/**
 * Fold one answer into a record, in place — the caller owns the object, so this works
 * equally on a plain record and on a `$state` proxy without swapping identities.
 */
export function applyAnswer(record: WordProgress, correct: boolean, at: number): void {
	record.seen += 1;
	record.lastSeen = at;
	if (correct) {
		record.correct += 1;
		record.streak += 1;
	} else {
		record.streak = 0;
		record.lastMissed = at;
	}
}

/** `L3-0412` → `3`. Lets `resetLevel` work without being handed the level's word list. */
export function levelOfId(wordId: string): Level | null {
	const match = /^L([1-9])-/.exec(wordId);
	return match ? asLevel(match[1]) : null;
}

/** Serialise state to the compact wire format. Never throws. */
export function encode(state: ProgressState): string {
	const w: Record<string, number[]> = {};
	for (const [wordId, record] of Object.entries(state.byWord)) {
		// A record only exists because the word was answered; a zeroed one is noise.
		if (!record || record.seen <= 0) continue;
		w[wordId] = [record.seen, record.correct, record.streak, record.lastSeen, record.lastMissed];
	}

	const l: Record<string, number[]> = {};
	for (const level of LEVELS) {
		const entry = state.levels[level];
		if (!entry) continue;
		l[level] = [entry.sessions, entry.lastPlayed];
	}

	return JSON.stringify({ v: SCHEMA_VERSION, w, l });
}

/**
 * Parse whatever is in storage into usable state.
 *
 * Returns `null` — meaning "keep what you have, and leave those bytes alone" — for an empty
 * key, unparseable JSON, a non-object payload, or a payload written by a *newer* schema than
 * this build understands. Anything readable comes back sanitised.
 */
export function decode(text: string | null): ProgressState | null {
	if (typeof text !== 'string' || text.length === 0) return null;

	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		return null;
	}
	if (!isRecord(raw)) return null;

	const version = count(raw.v ?? raw.version);
	// Written by a future deploy (or another tab running one). We cannot read it, so we
	// refuse to pretend: the caller keeps its in-memory state and does not overwrite the key
	// until the learner actually answers something new.
	if (version > SCHEMA_VERSION) return null;

	const state = emptyState();

	const words = raw.w ?? raw.byWord;
	if (isRecord(words)) {
		for (const [wordId, value] of Object.entries(words)) {
			if (wordId === '') continue;
			const record = decodeWord(wordId, value);
			if (record) state.byWord[wordId] = record;
		}
	}

	const levels = raw.l ?? raw.levels;
	if (isRecord(levels)) {
		for (const [key, value] of Object.entries(levels)) {
			const level = asLevel(key);
			if (level === null) continue;
			const entry = decodeLevel(value);
			if (entry) state.levels[level] = entry;
		}
	}

	return state;
}

function decodeWord(wordId: string, value: unknown): WordProgress | null {
	let fields: readonly unknown[];
	if (Array.isArray(value)) {
		fields = value;
	} else if (isRecord(value)) {
		fields = [value.seen, value.correct, value.streak, value.lastSeen, value.lastMissed];
	} else {
		return null;
	}

	const seen = count(fields[0]);
	const correct = Math.min(seen, count(fields[1]));
	const record: WordProgress = {
		wordId,
		seen,
		correct,
		streak: Math.min(correct, count(fields[2])),
		lastSeen: count(fields[3]),
		lastMissed: count(fields[4])
	};

	// Nothing was ever answered here — drop it rather than carrying dead keys forever.
	if (record.seen === 0 && record.lastSeen === 0) return null;
	return record;
}

function decodeLevel(value: unknown): LevelEntry | null {
	let fields: readonly unknown[];
	if (Array.isArray(value)) {
		fields = value;
	} else if (isRecord(value)) {
		fields = [value.sessions, value.lastPlayed];
	} else {
		return null;
	}

	const entry: LevelEntry = { sessions: count(fields[0]), lastPlayed: count(fields[1]) };
	if (entry.sessions === 0 && entry.lastPlayed === 0) return null;
	return entry;
}

function asLevel(value: unknown): Level | null {
	const n = Number(value);
	return LEVELS.includes(n as Level) ? (n as Level) : null;
}

/** Coerce anything at all to a non-negative integer. `NaN`, `-1`, `'x'`, `null` → `0`. */
function count(value: unknown): number {
	const n = typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(n) || n <= 0) return 0;
	return Math.floor(n);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
