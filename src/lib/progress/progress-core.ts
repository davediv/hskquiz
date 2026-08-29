/**
 * Pure progress logic: the persisted wire format, its decoder, the answer maths, and the
 * three-way merge that makes a write safe.
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
 *           "l": { "1": [sessions, lastPlayed] },
 *           "c": { "0": 1756000000000, "3": 1755000000000 } }
 * ```
 *
 * `c` is the tombstone map — see below. It was added inside v1 rather than as v2 on purpose:
 * a build that predates it ignores the field and still reads every word and level, whereas a
 * version bump would make old tabs refuse the payload outright. Forwards-compatible fields
 * are additive; only a change the decoder below genuinely cannot read earns a bump.
 *
 * The decoder is deliberately forgiving: it accepts the tuple form, the verbose
 * `ProgressState` form written by pre-v1 builds, and any half-corrupt mixture of the two,
 * sanitising every field on the way in. It never throws.
 *
 * ## Merging, not overwriting
 *
 * A learner can have this app open twice. `localStorage` gives us no transaction, so the only
 * way a write can be safe is to treat the key as shared: read it, merge what is there with
 * what we hold, write the union. `mergeProgress` is that merge, and it is a *three-way* one —
 * it takes the snapshot we last saw on disk as the common ancestor, so two tabs that each
 * answered a different word end up with both answers rather than the larger of the two.
 *
 * ## Tombstones
 *
 * Merging alone would make "Reset" impossible: a deletion is indistinguishable from a record
 * the other side has not seen yet, so the other tab's copy would simply come back. So a reset
 * is not a deletion, it is a fact with a timestamp — `cleared[level] = now`, or `cleared[0]`
 * for all levels — and any record last touched at or before that moment is gone wherever the
 * tombstone travels. Tombstones are tiny (at most six numbers), merge by `Math.max`, and
 * survive in the payload so the tab that was mid-write cannot resurrect what was erased.
 */

import { LEVELS, LEVEL_SIZES, type Level, type ProgressState, type WordProgress } from '$lib/types';

/** Bumped only when a change to the stored shape can no longer be read by the decoder below. */
export const SCHEMA_VERSION = 1;

/** The one and only key this app writes. The version is in the name *and* in the payload. */
export const STORAGE_KEY = 'hskquiz:progress:v1';

/**
 * Where bytes go when they cannot be read. Written once, before anything overwrites an
 * unreadable payload, so a truncated write or a rollback from a future build is recoverable
 * instead of being silently destroyed by the learner's next answer.
 */
export const BACKUP_KEY = 'hskquiz:progress:broken';

/** Consecutive correct answers before a word counts as mastered on the level screen. */
export const MASTERY_STREAK = 3;

/**
 * Tombstones, keyed by level, with `0` meaning "every level". The value is the epoch ms at
 * which the learner erased that scope; anything last touched at or before it stays erased.
 */
export type Tombstones = Record<number, number>;

/** Everything the key holds: the state the app reads, plus the erasures it must respect. */
export interface StoredProgress {
	state: ProgressState;
	cleared: Tombstones;
}

type LevelEntry = NonNullable<ProgressState['levels'][Level]>;

/**
 * Word ids that would write through to `Object.prototype` rather than into the map, or read
 * back off it.
 *
 * `byWord` has to be a plain object: it goes through `JSON` and through Svelte's `$state`
 * proxy, neither of which is happy with a null prototype. So the map stays a map by refusing
 * every name its prototype already occupies — `__proto__` (whose setter would make a bogus
 * record the map's prototype) and the eleven inherited methods, so that `forWord('toString')`
 * cannot hand back a function typed as a `WordProgress`. Every id this app mints is
 * `L{level}-{n}`; nothing real is ever refused.
 */
const RESERVED_IDS = new Set([...Object.getOwnPropertyNames(Object.prototype), 'prototype']);

/**
 * No timestamp in this app can predate the app. `lastSeen: 1` used to render "57y ago" with
 * complete confidence; a stamp below this floor is junk and reads better as "never".
 */
const EPOCH_FLOOR = Date.UTC(2024, 0, 1);

/** How far ahead of our clock another device's stamp may sit before we call it broken. */
const FUTURE_SLACK_MS = 36 * 60 * 60 * 1000;

/** A fresh, empty state. */
export function emptyState(): ProgressState {
	return { version: SCHEMA_VERSION, byWord: {}, levels: {} };
}

/** A fresh, empty payload: empty state, nothing erased. */
export function emptyStored(): StoredProgress {
	return { state: emptyState(), cleared: {} };
}

/** A zero record for a word that has never been answered. Not inserted into state by itself. */
export function blankWord(wordId: string): WordProgress {
	return { wordId, seen: 0, correct: 0, streak: 0, lastSeen: 0, lastMissed: 0 };
}

/**
 * True for an id that is safe to use as a key in `byWord`.
 *
 * Rejects the empty string and the three prototype-bearing names. Every id this app mints is
 * `L{level}-{n}`, so nothing real is ever refused; the guard exists because ids also arrive
 * from a payload a learner (or a rolled-back build) could have written.
 */
export function isUsableWordId(wordId: unknown): wordId is string {
	return typeof wordId === 'string' && wordId !== '' && !RESERVED_IDS.has(wordId);
}

/** The record for an id, or `undefined` — never something inherited from `Object.prototype`. */
export function ownRecord(
	byWord: Record<string, WordProgress>,
	wordId: string
): WordProgress | undefined {
	if (!isUsableWordId(wordId)) return undefined;
	// `in` rather than `hasOwnProperty`: on a `$state` proxy the `has` trap is what registers a
	// dependency on a key that is *not there yet*, so a screen reading an unanswered word still
	// re-renders the moment it is answered. Safe because `isUsableWordId` has already refused
	// every name the prototype carries.
	return wordId in byWord ? byWord[wordId] : undefined;
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

/**
 * True for an id that could name a word this app ships.
 *
 * `L{level}-{n}` ids are bounded, and tightly: the standard fixes each level's row count and the
 * build mints `1 … LEVEL_SIZES[level]` (verified — the highest id at each level is exactly that
 * number). So `L1-9000` and `L9-0001` are not words the learner could have answered; they are a
 * hand-edited key, a rolled-back build, or junk. Counting them is how the home screen came to
 * report "900 words practised · 900 mastered" directly above a card reading "500 words".
 *
 * Ids outside the `L{level}-{n}` shape entirely are left alone — the store is generic, and a
 * caller is allowed to key by something else — so this only ever refuses an id that is *claiming*
 * to be one of ours and cannot be.
 */
export function isShippableWordId(wordId: string): boolean {
	const match = /^L(\d+)-(\d+)$/.exec(wordId);
	if (!match) return true;
	const level = asLevel(match[1]);
	if (level === null) return false;
	const index = Number(match[2]);
	return index >= 1 && index <= LEVEL_SIZES[level];
}

/** `L3-0412` → `3`. Lets `resetLevel` work without being handed the level's word list. */
export function levelOfId(wordId: string): Level | null {
	const match = /^L([1-9])-/.exec(wordId);
	return match ? asLevel(match[1]) : null;
}

/** Serialise a payload to the compact wire format. Never throws. */
export function encode(state: ProgressState, cleared: Tombstones = {}): string {
	const w: Record<string, number[]> = {};
	// Sorted so two states holding the same data encode to the same bytes — `flush` compares
	// encodings to decide whether a write is needed at all, and key order must not defeat it.
	for (const wordId of Object.keys(state.byWord).sort()) {
		const record = ownRecord(state.byWord, wordId);
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

	const c: Record<string, number> = {};
	for (const scope of Object.keys(cleared).sort()) {
		const at = cleared[Number(scope)];
		if (typeof at === 'number' && at > 0) c[scope] = at;
	}

	const payload: Record<string, unknown> = { v: SCHEMA_VERSION, w, l };
	// Omitted entirely when nothing has ever been reset, so the common payload is unchanged
	// from what earlier builds wrote.
	if (Object.keys(c).length > 0) payload.c = c;
	return JSON.stringify(payload);
}

/**
 * Parse whatever is in storage into usable state.
 *
 * Returns `null` — meaning "this is not ours to read, and not ours to destroy" — for an empty
 * key, unparseable JSON, a non-object payload, a version field that is not a plain number, or
 * a payload written by a *newer* schema than this build understands. Anything readable comes
 * back sanitised.
 *
 * `now` is the clock the caller trusts; timestamps far beyond it are the symptom of a bad
 * device clock rather than data, and get pulled back instead of rendering "in 50y".
 */
export function decodeStored(text: string | null, now: number = Date.now()): StoredProgress | null {
	if (typeof text !== 'string' || text.length === 0) return null;

	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		return null;
	}
	if (!isRecord(raw)) return null;

	const version = readVersion(raw);
	// Written by a future deploy (or another tab running one), or by something we cannot
	// identify at all. Either way we cannot read it, so we refuse to pretend: the caller keeps
	// its in-memory state, copies the bytes aside, and never guesses at their meaning.
	if (version === null || version > SCHEMA_VERSION) return null;

	const stored = emptyStored();
	const state = stored.state;

	const words = raw.w ?? raw.byWord;
	if (isRecord(words)) {
		for (const [wordId, value] of Object.entries(words)) {
			// The key is the one input this module does not control, so both id guards live here.
			if (!isUsableWordId(wordId) || !isShippableWordId(wordId)) continue;
			const record = decodeWord(wordId, value, now);
			if (record) state.byWord[wordId] = record;
		}
	}

	const levels = raw.l ?? raw.levels;
	if (isRecord(levels)) {
		for (const [key, value] of Object.entries(levels)) {
			const level = asLevel(key);
			if (level === null) continue;
			const entry = decodeLevel(value, now);
			if (entry) state.levels[level] = entry;
		}
	}

	const cleared = raw.c ?? raw.cleared;
	if (isRecord(cleared)) {
		for (const [key, value] of Object.entries(cleared)) {
			const scope = Number(key);
			// `0` is "all levels"; anything else has to be a level we ship.
			if (scope !== 0 && asLevel(scope) === null) continue;
			const at = stamp(value, now);
			if (at > 0) stored.cleared[scope] = Math.max(stored.cleared[scope] ?? 0, at);
		}
	}

	applyTombstones(stored);
	return stored;
}

/** `decodeStored`, for a caller that only wants the state. */
export function decode(text: string | null, now: number = Date.now()): ProgressState | null {
	return decodeStored(text, now)?.state ?? null;
}

/**
 * Three-way merge: `base` is the payload both sides started from, `mine` is this tab, `theirs`
 * is what is in the key right now.
 *
 * Counters merge as *deltas against the ancestor* rather than as maxima, so two tabs that each
 * answered the same word three times come out at six answers, not three. `lastSeen` and
 * `lastMissed` are the later of the two; `streak` — the one field that is a sequence and not a
 * total — belongs to whichever side answered most recently. Everything is re-clamped so the
 * invariants `correct <= seen` and `streak <= correct` survive the arithmetic.
 *
 * Absence never means deletion here. Only a tombstone deletes, which is what lets a reset in
 * one tab outlive a half-written blob in another.
 */
export function mergeProgress(
	base: StoredProgress,
	mine: StoredProgress,
	theirs: StoredProgress
): StoredProgress {
	const merged = emptyStored();

	for (const scope of new Set([...clearedScopes(mine), ...clearedScopes(theirs)])) {
		const at = Math.max(mine.cleared[scope] ?? 0, theirs.cleared[scope] ?? 0);
		if (at > 0) merged.cleared[scope] = at;
	}

	const ids = new Set([...Object.keys(mine.state.byWord), ...Object.keys(theirs.state.byWord)]);
	for (const wordId of ids) {
		if (!isUsableWordId(wordId)) continue;
		const record = mergeWord(
			wordId,
			ownRecord(base.state.byWord, wordId),
			ownRecord(mine.state.byWord, wordId),
			ownRecord(theirs.state.byWord, wordId)
		);
		if (record) merged.state.byWord[wordId] = record;
	}

	for (const level of LEVELS) {
		const entry = mergeLevel(
			base.state.levels[level],
			mine.state.levels[level],
			theirs.state.levels[level]
		);
		if (entry) merged.state.levels[level] = entry;
	}

	applyTombstones(merged);
	return merged;
}

/** Drop everything a tombstone covers. Idempotent, and the last step of every merge/decode. */
export function applyTombstones(stored: StoredProgress): void {
	const everything = stored.cleared[0] ?? 0;

	for (const wordId of Object.keys(stored.state.byWord)) {
		const record = ownRecord(stored.state.byWord, wordId);
		if (!record) continue;
		const level = levelOfId(wordId);
		const cut = Math.max(everything, level === null ? 0 : (stored.cleared[level] ?? 0));
		// Strictly before: the tombstone is stamped with the instant of the reset, so a record
		// carrying that same instant is an answer given after it, not history it should erase.
		if (cut > 0 && record.lastSeen < cut) delete stored.state.byWord[wordId];
	}

	for (const level of LEVELS) {
		const entry = stored.state.levels[level];
		if (!entry) continue;
		const cut = Math.max(everything, stored.cleared[level] ?? 0);
		if (cut > 0 && entry.lastPlayed < cut) delete stored.state.levels[level];
	}
}

/** A detached deep copy — no `$state` proxy, safe to keep as a merge ancestor. */
export function snapshot(stored: StoredProgress): StoredProgress {
	const copy = emptyStored();
	copy.state.version = stored.state.version;
	for (const wordId of Object.keys(stored.state.byWord)) {
		const record = ownRecord(stored.state.byWord, wordId);
		if (record) copy.state.byWord[wordId] = { ...record };
	}
	for (const level of LEVELS) {
		const entry = stored.state.levels[level];
		if (entry) copy.state.levels[level] = { ...entry };
	}
	for (const scope of clearedScopes(stored)) {
		const at = stored.cleared[scope];
		if (at > 0) copy.cleared[scope] = at;
	}
	return copy;
}

function clearedScopes(stored: StoredProgress): number[] {
	return Object.keys(stored.cleared).map(Number).filter(Number.isFinite);
}

function mergeWord(
	wordId: string,
	base: WordProgress | undefined,
	mine: WordProgress | undefined,
	theirs: WordProgress | undefined
): WordProgress | null {
	if (!mine && !theirs) return null;
	if (!theirs) return mine ? { ...mine } : null;
	if (!mine) {
		// We held this record and it is gone from our state, so we deleted it — a reset. Only a
		// record the other side has actually moved on brings it back. This is the half of
		// deletion that needs no clock at all; tombstones are the other half, for the tab that
		// was mid-write and never saw our reset.
		if (base && theirs.seen <= base.seen && theirs.lastSeen <= base.lastSeen) return null;
		return { ...theirs };
	}

	const ancestor = base ?? blankWord(wordId);
	// Their work since we last saw the key, added to ours. `max(0, …)` because a payload can
	// legitimately shrink (a reset that we have already merged) and a negative delta would
	// quietly eat our own answers.
	const seen = mine.seen + Math.max(0, theirs.seen - ancestor.seen);
	const correct = Math.min(seen, mine.correct + Math.max(0, theirs.correct - ancestor.correct));
	const newest = theirs.lastSeen > mine.lastSeen ? theirs : mine;

	return {
		wordId,
		seen,
		correct,
		streak: Math.min(correct, newest.streak),
		lastSeen: Math.max(mine.lastSeen, theirs.lastSeen),
		lastMissed: Math.max(mine.lastMissed, theirs.lastMissed)
	};
}

function mergeLevel(
	base: LevelEntry | undefined,
	mine: LevelEntry | undefined,
	theirs: LevelEntry | undefined
): LevelEntry | null {
	if (!mine && !theirs) return null;
	if (!theirs) return mine ? { ...mine } : null;
	if (!mine) {
		// Same deletion rule as `mergeWord`: gone from us and unchanged for them means erased.
		if (base && theirs.sessions <= base.sessions && theirs.lastPlayed <= base.lastPlayed) {
			return null;
		}
		return { ...theirs };
	}

	return {
		sessions: mine.sessions + Math.max(0, theirs.sessions - (base?.sessions ?? 0)),
		lastPlayed: Math.max(mine.lastPlayed, theirs.lastPlayed)
	};
}

function decodeWord(wordId: string, value: unknown, now: number): WordProgress | null {
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
		lastSeen: stamp(fields[3], now),
		lastMissed: stamp(fields[4], now)
	};

	// Nothing was ever answered here — drop it rather than carrying dead keys forever.
	if (record.seen === 0) return null;
	return record;
}

function decodeLevel(value: unknown, now: number): LevelEntry | null {
	let fields: readonly unknown[];
	if (Array.isArray(value)) {
		fields = value;
	} else if (isRecord(value)) {
		fields = [value.sessions, value.lastPlayed];
	} else {
		return null;
	}

	const entry: LevelEntry = { sessions: count(fields[0]), lastPlayed: stamp(fields[1], now) };
	if (entry.sessions === 0 && entry.lastPlayed === 0) return null;
	return entry;
}

/**
 * The payload's schema version, or `null` when the payload does not state one legibly.
 *
 * Takes the **highest** of the fields that could carry it. `{"v":0,"version":2}` is a v2
 * payload wearing a v1 hat — under a plain `raw.v ?? raw.version` it read as version 0, was
 * accepted, and was then overwritten by the first answer. Taking the max refuses it. So does
 * a fractional `1.9`: the comparison happens before any flooring.
 */
function readVersion(raw: Record<string, unknown>): number | null {
	let version = 0;
	for (const key of ['v', 'version'] as const) {
		if (!(key in raw)) continue;
		const value = raw[key];
		if (value === null || value === undefined) continue;
		if (typeof value !== 'number' || !Number.isFinite(value)) return null;
		version = Math.max(version, value);
	}
	return version;
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

/**
 * A timestamp, sanitised for plausibility and not just for sign.
 *
 * Below the app's own epoch it is junk and becomes 0 ("never"); beyond our clock by more than
 * a day and a half it is a bad device clock and gets pulled back to now. Both used to render
 * as confident nonsense — "57y ago", "in 50y" — on the home screen.
 */
function stamp(value: unknown, now: number): number {
	const n = count(value);
	if (n === 0) return 0;
	if (n < EPOCH_FLOOR) return 0;
	const ceiling = now + FUTURE_SLACK_MS;
	return n > ceiling ? now : n;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
