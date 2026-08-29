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
 * { "v": 1, "w": { "L1-0001": [seen, correct, streak, lastSeen, lastMissed, gen] },
 *           "l": { "1": [sessions, lastPlayed, gen] },
 *           "g": { "0": 2, "3": 1 } }
 * ```
 *
 * The trailing `gen` is omitted while it is 0, so a learner who has never reset has exactly
 * the bytes earlier builds wrote. `g` is likewise absent until the first reset.
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
 * ## Forgetting: generations, not timestamps
 *
 * Merging alone would make "Reset" impossible: a deletion is indistinguishable from a record
 * the other side has not seen yet, so the other tab's copy would simply come back. A reset
 * therefore has to be a *fact recorded in the payload*.
 *
 * It used to be recorded as a wall-clock instant — `cleared[level] = Date.now()` — and every
 * record whose `lastSeen` fell before that instant was erased. That made the learner's device
 * clock the arbiter of what survived, and a clock is not a fact:
 *
 * - Reset on a phone running 30 minutes fast, then correct the clock, and every answer given
 *   for the next 30 minutes was stamped *before* the tombstone and silently deleted on the
 *   next read — while the store reported a healthy save.
 * - Reset on a phone running slow and the reset could not stick: the decoder pulls
 *   implausible stamps back to `now`, so every stored record decoded as newer than the
 *   tombstone and a stale tab's rewrite restored everything the learner had just erased.
 *
 * So the clock is gone from the decision entirely. `gens` counts resets per scope — `0` is
 * "all levels", `1`–`5` a single level — and every record carries the generation it was last
 * written under. A record dies iff `record.gen < generation(scope)`. Two integers, both
 * written by us, compared to each other: a record a stale tab wrote before the bump carries
 * the old generation and dies, and a record the learner is giving right now carries the new
 * one and survives, on any clock, in either direction.
 *
 * Generations merge by `Math.max`, so a reset survives every merge, and `encode` applies them
 * on the way out — the encoder and the decoder have to agree about what a reset means, or the
 * store writes bytes its own reader treats as empty.
 *
 * A payload from the timestamp era (`c`) is still readable: see `migrateLegacyCuts`.
 */

import { LEVELS, LEVEL_SIZES, type Level, type ProgressState, type WordProgress } from '$lib/types';

/** Bumped only when a change to the stored shape can no longer be read by the decoder below. */
export const SCHEMA_VERSION = 1;

/** The one and only key this app writes. The version is in the name *and* in the payload. */
export const STORAGE_KEY = 'hskquiz:progress:v1';

/**
 * Where bytes go when they cannot be read, or when a merge would drop records nothing
 * accounts for. Written before anything overwrites them, so a truncated write, a rollback
 * from a future build, or a bug in this file is recoverable instead of being silently
 * destroyed by the learner's next answer.
 */
export const BACKUP_KEY = 'hskquiz:progress:broken';

/**
 * A byte written and removed at startup to find out whether storage accepts *writes*.
 * Detecting storage by reading it says nothing about a full quota or a locked profile.
 */
export const PROBE_KEY = 'hskquiz:probe';

/** Consecutive correct answers before a word counts as mastered on the level screen. */
export const MASTERY_STREAK = 3;

/**
 * How many times each scope has been reset. `0` is "all levels", `1`–`5` a single level.
 *
 * These are counters, never instants. They are never compared to a clock, never passed
 * through `stamp()`, and merge by `Math.max`.
 */
export type Generations = Record<number, number>;

/** Everything the key holds: the state the app reads, plus the resets it must respect. */
export interface StoredProgress {
	state: ProgressState;
	gens: Generations;
}

type LevelEntry = NonNullable<ProgressState['levels'][Level]>;

/**
 * A word record as it is *stored*: the shared `WordProgress` plus the reset generation it was
 * last written under.
 *
 * The extra field rides along inside `byWord` rather than in a parallel map so that every
 * copy of a record — a spread, a merge, a `$state` proxy, a JSON round-trip — carries its
 * generation automatically. `WordProgress` itself belongs to `$lib/types`, which this piece
 * does not own; `recordGen`/`stampGen` are the only places that know about the difference.
 */
export interface StoredWord extends WordProgress {
	gen: number;
}

/** A level entry plus the generation it was last written under. */
export interface StoredLevel extends LevelEntry {
	gen: number;
}

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
 *
 * Exported because the *writer* has to respect it too: a device whose clock says 2001 stamps
 * answers the decoder would throw away, so the store floors what it writes to the same value.
 * Anything encode writes, decode must read back unchanged.
 */
export const EPOCH_FLOOR = Date.UTC(2024, 0, 1);

/** How far ahead of our clock another device's stamp may sit before we call it broken. */
const FUTURE_SLACK_MS = 36 * 60 * 60 * 1000;

/** A fresh, empty state. */
export function emptyState(): ProgressState {
	return { version: SCHEMA_VERSION, byWord: {}, levels: {} };
}

/** A fresh, empty payload: empty state, nothing ever reset. */
export function emptyStored(): StoredProgress {
	return { state: emptyState(), gens: {} };
}

/** A zero record for a word that has never been answered. Not inserted into state by itself. */
export function blankWord(wordId: string): WordProgress {
	return { wordId, seen: 0, correct: 0, streak: 0, lastSeen: 0, lastMissed: 0 };
}

/**
 * Whether a record holds anything worth keeping.
 *
 * `seen` counts *answers*, and an introduction is not an answer: the teach card shows a word
 * and asks nothing, so `noteSeen` stamps `lastSeen` and touches nothing else. That is the one
 * shape `applyAnswer` can never write — it always bumps `seen` and `lastSeen` together — which
 * is exactly why `src/lib/session/record.ts` reads it as one exposure.
 *
 * Dropping records on `seen <= 0` therefore threw every introduction away on the next reload,
 * and the scheduler taught the same ten words on every visit forever. The test is now "did
 * anything at all happen to this word", not "was it answered".
 */
export function hasHistory(record: WordProgress): boolean {
	return record.seen > 0 || record.lastSeen > 0;
}

/** The generation a stored record was written under. Absent, junk or negative all read as 0. */
export function recordGen(record: WordProgress): number {
	return count((record as Partial<StoredWord>).gen);
}

/**
 * Stamp a record with the generation it is being written under.
 *
 * Generation 0 — the overwhelmingly common case, a learner who has never reset — is left off
 * the object rather than written as a zero. `recordGen` reads a missing field as 0, so nothing
 * downstream can tell the difference, and 4,316 records do not each grow a sixth property.
 * A stamp can therefore only ever raise a record's generation, which is the only direction it
 * moves anyway.
 */
export function stampGen(record: WordProgress, gen: number): void {
	if (gen > 0) (record as StoredWord).gen = gen;
}

/** The generation a stored level entry was written under. */
export function levelEntryGen(entry: LevelEntry): number {
	return count((entry as Partial<StoredLevel>).gen);
}

/** Stamp a level entry with the generation it is being written under. Zero is left off. */
export function stampLevelGen(entry: LevelEntry, gen: number): void {
	if (gen > 0) (entry as StoredLevel).gen = gen;
}

/**
 * The generation in force for one scope.
 *
 * A level's records answer to both counters: the global one and their own. Summing them means
 * a single integer per record covers both — reset everything and every record's scope moves
 * on; reset HSK 3 and only HSK 3's does.
 */
export function generationFor(gens: Generations, level: Level | null): number {
	const global = count(gens[0]);
	return level === null ? global : global + count(gens[level]);
}

/** The generation in force for the scope a word id belongs to. */
export function generationForWord(gens: Generations, wordId: string): number {
	return generationFor(gens, levelOfId(wordId));
}

/**
 * A copy of `gens` with one scope moved on. `atLeast` lets a caller outrank a generation it
 * has just read off the key, so a reset in a tab holding a stale payload still wins.
 */
export function bumpGeneration(gens: Generations, scope: number, atLeast = 0): Generations {
	const next = Math.max(count(gens[scope]), count(atLeast)) + 1;
	return { ...gens, [scope]: next };
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

/**
 * The record under a key that `Object.keys(byWord)` just handed back.
 *
 * Own by construction, so the `in` check `ownRecord` performs is redundant — and on a `$state`
 * proxy that check is a `has` trap, one per record, ~4,300 of them on every write of a full
 * library. Only for loops over the map's own keys; anything reading an id from outside must go
 * through `ownRecord`.
 */
export function recordUnderOwnKey(
	byWord: Record<string, WordProgress>,
	wordId: string
): WordProgress | undefined {
	return isUsableWordId(wordId) ? byWord[wordId] : undefined;
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
 *
 * `gen` is the reset generation in force for this word right now, and stamping it here rather
 * than at the call site is what makes an answer outlive every reset that preceded it.
 */
export function applyAnswer(record: WordProgress, correct: boolean, at: number, gen: number): void {
	record.seen += 1;
	record.lastSeen = at;
	if (correct) {
		record.correct += 1;
		record.streak += 1;
	} else {
		record.streak = 0;
		record.lastMissed = at;
	}
	stampGen(record, gen);
}

/**
 * Note that a word was shown without being asked, in place — the introduction card.
 *
 * Touches `lastSeen` and the generation, and deliberately nothing else. `seen`, `correct`,
 * `streak` and `lastMissed` are all claims about an answer, and a card that asked no question
 * has none to make: writing a miss for one manufactured urgency the learner never earned, and
 * writing a hit promoted an untested word straight to the production direction.
 */
export function applySeen(record: WordProgress, at: number, gen: number): void {
	record.lastSeen = at;
	stampGen(record, gen);
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

/**
 * Serialise a payload to the compact wire format. Never throws.
 *
 * Applies generations on the way out, so the bytes this writes are exactly the bytes
 * `decodeStored` reads back. The old encoder did not, and the store routinely wrote payloads
 * its own decoder resolved to empty — one record plus a tombstone the record predated
 * round-tripped to zero words while `flush()` reported success.
 */
export function encode(stored: StoredProgress): string {
	const w: Record<string, number[]> = {};
	// Sorted so two states holding the same data encode to the same bytes — `flush` compares
	// encodings to decide whether a write is needed at all, and key order must not defeat it.
	for (const wordId of Object.keys(stored.state.byWord).sort()) {
		const record = recordUnderOwnKey(stored.state.byWord, wordId);
		// A record exists because something happened to the word — an answer, or the teach card
		// that introduced it. A wholly zeroed one is noise. See `hasHistory`.
		if (!record || !hasHistory(record)) continue;
		const gen = recordGen(record);
		if (gen < generationForWord(stored.gens, wordId)) continue;
		const tuple = [record.seen, record.correct, record.streak, record.lastSeen, record.lastMissed];
		// The generation slot only appears once it is non-zero, so a learner who has never
		// reset has byte-for-byte the payload earlier builds wrote.
		if (gen > 0) tuple.push(gen);
		w[wordId] = tuple;
	}

	const l: Record<string, number[]> = {};
	for (const level of LEVELS) {
		const entry = stored.state.levels[level];
		if (!entry) continue;
		const gen = levelEntryGen(entry);
		if (gen < generationFor(stored.gens, level)) continue;
		const tuple = [entry.sessions, entry.lastPlayed];
		if (gen > 0) tuple.push(gen);
		l[level] = tuple;
	}

	const g: Record<string, number> = {};
	for (const scope of Object.keys(stored.gens).sort()) {
		const n = count(stored.gens[Number(scope)]);
		if (n > 0) g[scope] = n;
	}

	const payload: Record<string, unknown> = { v: SCHEMA_VERSION, w, l };
	// Omitted entirely when nothing has ever been reset, so the common payload is unchanged
	// from what earlier builds wrote.
	if (Object.keys(g).length > 0) payload.g = g;
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
 * device clock rather than data, and get pulled back instead of rendering "in 50y". Nothing
 * about *deletion* consults `now` — that is what generations are for.
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

	const rawGens = raw.g;
	if (isRecord(rawGens)) {
		for (const [key, value] of Object.entries(rawGens)) {
			const scope = readScope(key);
			if (scope === null) continue;
			const n = count(value);
			if (n > 0) stored.gens[scope] = Math.max(count(stored.gens[scope]), n);
		}
	}
	// A payload from the timestamp era. Its cuts are honoured once, here, and never again.
	const legacyCuts = isRecord(rawGens) ? {} : migrateLegacyCuts(raw, stored.gens);

	const words = raw.w ?? raw.byWord;
	if (isRecord(words)) {
		for (const [wordId, value] of Object.entries(words)) {
			// The key is the one input this module does not control, so both id guards live here.
			if (!isUsableWordId(wordId) || !isShippableWordId(wordId)) continue;
			const record = decodeWord(wordId, value, now);
			if (!record) continue;
			if (erasedByLegacyCut(legacyCuts, levelOfId(wordId), value, 3)) continue;
			state.byWord[wordId] = record;
		}
	}

	const levels = raw.l ?? raw.levels;
	if (isRecord(levels)) {
		for (const [key, value] of Object.entries(levels)) {
			const level = asLevel(key);
			if (level === null) continue;
			const entry = decodeLevel(value, now);
			if (!entry) continue;
			if (erasedByLegacyCut(legacyCuts, level, value, 1)) continue;
			state.levels[level] = entry;
		}
	}

	// A migrated payload is adopted *at* the generation it was migrated to: whatever survived
	// the legacy cut is what the learner still has, so it must not then die to its own reset.
	if (Object.keys(legacyCuts).length > 0) adoptGenerations(stored);

	applyGenerations(stored);
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
 * Absence never means deletion here. Only a generation deletes, which is what lets a reset in
 * one tab outlive a half-written blob in another.
 */
export function mergeProgress(
	base: StoredProgress,
	mine: StoredProgress,
	theirs: StoredProgress
): StoredProgress {
	const merged = emptyStored();

	for (const scope of new Set([...scopes(mine.gens), ...scopes(theirs.gens)])) {
		const n = Math.max(count(mine.gens[scope]), count(theirs.gens[scope]));
		if (n > 0) merged.gens[scope] = n;
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

	applyGenerations(merged);
	return merged;
}

/**
 * Drop everything a reset generation covers. Idempotent, and the last step of every
 * merge, decode and encode. No clock is involved: two integers we wrote ourselves.
 */
export function applyGenerations(stored: StoredProgress): void {
	for (const wordId of Object.keys(stored.state.byWord)) {
		const record = recordUnderOwnKey(stored.state.byWord, wordId);
		if (!record) continue;
		if (recordGen(record) < generationForWord(stored.gens, wordId)) {
			delete stored.state.byWord[wordId];
		}
	}

	for (const level of LEVELS) {
		const entry = stored.state.levels[level];
		if (!entry) continue;
		if (levelEntryGen(entry) < generationFor(stored.gens, level)) delete stored.state.levels[level];
	}
}

/** Stamp every record and level with the generation currently in force for its scope. */
export function adoptGenerations(stored: StoredProgress): void {
	for (const wordId of Object.keys(stored.state.byWord)) {
		const record = recordUnderOwnKey(stored.state.byWord, wordId);
		if (record) stampGen(record, generationForWord(stored.gens, wordId));
	}
	for (const level of LEVELS) {
		const entry = stored.state.levels[level];
		if (entry) stampLevelGen(entry, generationFor(stored.gens, level));
	}
}

/**
 * Word ids the key holds that a merge of it has dropped, and that no reset generation in that
 * merge accounts for.
 *
 * Deletion has exactly one legitimate cause in this store — a generation the record predates —
 * so anything else vanishing is a bug in the merge, and the bytes about to be overwritten are
 * the learner's entire history. `flush` copies them aside before writing. This is the half of
 * the rescue net that was missing: the old one covered only bytes that could not be *decoded*,
 * so a payload that decoded perfectly and was then annihilated went to the bit bucket with no
 * copy at all.
 */
export function unexplainedLosses(disk: StoredProgress, merged: StoredProgress): string[] {
	const lost: string[] = [];
	for (const wordId of Object.keys(disk.state.byWord)) {
		const record = recordUnderOwnKey(disk.state.byWord, wordId);
		if (!record || !hasHistory(record)) continue;
		if (ownRecord(merged.state.byWord, wordId)) continue;
		// A reset explains it: the record was written before the generation now in force.
		if (recordGen(record) < generationForWord(merged.gens, wordId)) continue;
		lost.push(wordId);
	}
	return lost;
}

/**
 * Fold a rescue copy back into live state, at the current generation.
 *
 * Not `mergeProgress`: the two sides here are one history and a copy of it, not two tabs
 * racing, so delta arithmetic would double-count everything they share. Fields take the
 * better of the two, and every restored record is stamped with the generation in force now —
 * the learner is explicitly asking for this history back, which outranks any reset that
 * happened while it sat in the backup key.
 */
export function restoreInto(mine: StoredProgress, rescued: StoredProgress): StoredProgress {
	const merged = emptyStored();
	merged.gens = { ...mine.gens };

	const ids = new Set([...Object.keys(mine.state.byWord), ...Object.keys(rescued.state.byWord)]);
	for (const wordId of ids) {
		if (!isUsableWordId(wordId)) continue;
		const a = ownRecord(mine.state.byWord, wordId);
		const b = ownRecord(rescued.state.byWord, wordId);
		const only = a ?? b;
		if (!only) continue;
		const best = a && b ? betterOf(wordId, a, b) : { ...only };
		stampGen(best, generationForWord(merged.gens, wordId));
		merged.state.byWord[wordId] = best;
	}

	for (const level of LEVELS) {
		const a = mine.state.levels[level];
		const b = rescued.state.levels[level];
		const only = a ?? b;
		if (!only) continue;
		const entry: LevelEntry =
			a && b
				? {
						sessions: Math.max(a.sessions, b.sessions),
						lastPlayed: Math.max(a.lastPlayed, b.lastPlayed)
					}
				: { ...only };
		stampLevelGen(entry, generationFor(merged.gens, level));
		merged.state.levels[level] = entry;
	}

	return merged;
}

/** A detached deep copy — no `$state` proxy, safe to keep as a merge ancestor. */
export function snapshot(stored: StoredProgress): StoredProgress {
	const copy = emptyStored();
	copy.state.version = stored.state.version;
	for (const wordId of Object.keys(stored.state.byWord)) {
		const record = recordUnderOwnKey(stored.state.byWord, wordId);
		if (record) copy.state.byWord[wordId] = { ...record };
	}
	for (const level of LEVELS) {
		const entry = stored.state.levels[level];
		if (entry) copy.state.levels[level] = { ...entry };
	}
	for (const scope of scopes(stored.gens)) {
		const n = count(stored.gens[scope]);
		if (n > 0) copy.gens[scope] = n;
	}
	return copy;
}

/** How many word records a payload holds, and how many answers they add up to. */
export function tally(stored: StoredProgress): { words: number; answers: number } {
	let words = 0;
	let answers = 0;
	for (const wordId of Object.keys(stored.state.byWord)) {
		const record = recordUnderOwnKey(stored.state.byWord, wordId);
		if (!record || !hasHistory(record)) continue;
		words += 1;
		answers += record.seen;
	}
	return { words, answers };
}

function scopes(gens: Generations): number[] {
	return Object.keys(gens).map(Number).filter(Number.isFinite);
}

function betterOf(wordId: string, a: WordProgress, b: WordProgress): WordProgress {
	const seen = Math.max(a.seen, b.seen);
	const correct = Math.min(seen, Math.max(a.correct, b.correct));
	const newest = b.lastSeen > a.lastSeen ? b : a;
	return {
		wordId,
		seen,
		correct,
		streak: Math.min(correct, newest.streak),
		lastSeen: Math.max(a.lastSeen, b.lastSeen),
		lastMissed: Math.max(a.lastMissed, b.lastMissed)
	};
}

/**
 * Read the timestamp tombstones a pre-generation build wrote (`c`), turn each into a
 * generation, and hand back the raw cuts so the words in *this same payload* can be filtered
 * by them once.
 *
 * The comparison that follows is raw-stored-value against raw-stored-value — both numbers
 * were written by the same build on the same device in the same payload — so it never touches
 * `now` and cannot repeat the skew bug it is migrating away from. After this, the cut is
 * spent: what survived is stamped at generation 1 and the app never compares a clock again.
 */
function migrateLegacyCuts(
	raw: Record<string, unknown>,
	gens: Generations
): Record<number, number> {
	const cuts: Record<number, number> = {};
	const legacy = raw.c ?? raw.cleared;
	if (!isRecord(legacy)) return cuts;

	for (const [key, value] of Object.entries(legacy)) {
		const scope = readScope(key);
		if (scope === null) continue;
		const at = count(value);
		if (at <= 0) continue;
		cuts[scope] = Math.max(cuts[scope] ?? 0, at);
		gens[scope] = Math.max(count(gens[scope]), 1);
	}
	return cuts;
}

/** True when a legacy timestamp cut covers this raw entry. `slot` is its `lastSeen` index. */
function erasedByLegacyCut(
	cuts: Record<number, number>,
	level: Level | null,
	value: unknown,
	slot: number
): boolean {
	const cut = Math.max(cuts[0] ?? 0, level === null ? 0 : (cuts[level] ?? 0));
	if (cut <= 0) return false;
	const raw = Array.isArray(value)
		? value[slot]
		: isRecord(value)
			? slot === 3
				? value.lastSeen
				: value.lastPlayed
			: undefined;
	// Strictly before: the tombstone carried the instant of the reset, so an entry stamped
	// with that same instant was written after it.
	return count(raw) < cut;
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
		// deletion that needs no bookkeeping at all; generations are the other half, for the tab
		// that was mid-write and never saw our reset.
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

	const merged: WordProgress = {
		wordId,
		seen,
		correct,
		streak: Math.min(correct, newest.streak),
		lastSeen: Math.max(mine.lastSeen, theirs.lastSeen),
		lastMissed: Math.max(mine.lastMissed, theirs.lastMissed)
	};
	// The later generation wins: a record either side has re-answered since a reset survives it.
	stampGen(merged, Math.max(recordGen(mine), recordGen(theirs)));
	return merged;
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

	const merged: LevelEntry = {
		sessions: mine.sessions + Math.max(0, theirs.sessions - (base?.sessions ?? 0)),
		lastPlayed: Math.max(mine.lastPlayed, theirs.lastPlayed)
	};
	stampLevelGen(merged, Math.max(levelEntryGen(mine), levelEntryGen(theirs)));
	return merged;
}

function decodeWord(wordId: string, value: unknown, now: number): WordProgress | null {
	let fields: readonly unknown[];
	if (Array.isArray(value)) {
		fields = value;
	} else if (isRecord(value)) {
		fields = [value.seen, value.correct, value.streak, value.lastSeen, value.lastMissed, value.gen];
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
	stampGen(record, count(fields[5]));

	// Nothing ever happened here — no answer and no exposure — so drop it rather than carrying
	// dead keys forever. A zero `seen` with a `lastSeen` is an introduction and must survive.
	if (!hasHistory(record)) return null;
	return record;
}

function decodeLevel(value: unknown, now: number): LevelEntry | null {
	let fields: readonly unknown[];
	if (Array.isArray(value)) {
		fields = value;
	} else if (isRecord(value)) {
		fields = [value.sessions, value.lastPlayed, value.gen];
	} else {
		return null;
	}

	const entry: LevelEntry = { sessions: count(fields[0]), lastPlayed: stamp(fields[1], now) };
	stampLevelGen(entry, count(fields[2]));
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

/** `0` (all levels) or a level this build ships. Anything else is not a scope we understand. */
function readScope(value: unknown): number | null {
	const n = Number(value);
	if (n === 0) return 0;
	return asLevel(n);
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
 *
 * This only ever affects how a date *reads*. Nothing is deleted on the strength of it.
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
