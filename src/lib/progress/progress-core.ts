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

/**
 * The largest reset counter this app could ever have written, and the point past which a
 * counter stops being data.
 *
 * A generation only ever moves by `+1`, and only when a person taps Reset. A million taps is
 * already beyond a lifetime of them, so a counter beyond this did not come from here: it is a
 * corrupt byte, a hand-edited key, or a number that arrived as a string and coerced to `1e22`.
 *
 * The number matters because *every* deletion in this store is decided by a generation
 * comparison. Honouring a junk counter meant `{"g":{"0":1e22}}` deleted every record on load
 * — the payload said "the learner has asked to be forgotten 10 sextillion times" and the
 * store believed it — and `{"g":{"0":1e308,"3":1e308}}` was worse: the sum overflowed to
 * `Infinity`, `stampGen` wrote `Infinity` into every fresh answer, and `count(Infinity)` read
 * it back as 0, so `encode` dropped every record on the way *out* while `flush()` reported a
 * clean save, forever.
 *
 * So a counter past this ceiling is not clamped, it is **ignored**. Clamping still deletes
 * (every record predates the clamped value); ignoring cannot lose anything, because a reset
 * that really happened already pruned the records from the bytes — the counter alone brings
 * nothing back. Deletion needs a fact we are sure of; this is not one.
 */
export const MAX_GENERATION = 1_000_000;

/**
 * The ceiling for the generation stamped on a single record.
 *
 * A record answers to two counters at once (`generationFor` sums the global scope and its
 * level's), so the largest generation a record can legitimately carry is twice the scope
 * ceiling. Junk in a record's own `gen` slot is clamped *up* to that, never down to 0: a
 * record whose generation we cannot read must not be deleted on the strength of it.
 */
const MAX_RECORD_GENERATION = 2 * MAX_GENERATION;

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

/**
 * How far ahead of our clock a stamp may sit and still be believed.
 *
 * Generous on purpose — see `stamp()`. Everything under it is some device's clock being a
 * device's clock: a slow battery, a bad timezone, a phone that has not synced since last
 * month. Only past it is a stamp something no clock produced.
 */
const FUTURE_HORIZON_MS = 400 * 24 * 60 * 60 * 1000;

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

/**
 * The generation a stored record was written under. Absent or negative reads as 0; a value
 * past what any generation could be is clamped to the ceiling, never down — see
 * `MAX_RECORD_GENERATION`.
 */
export function recordGen(record: WordProgress): number {
	return Math.min(count((record as Partial<StoredWord>).gen), MAX_RECORD_GENERATION);
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

/** The generation a stored level entry was written under. Clamped like `recordGen`. */
export function levelEntryGen(entry: LevelEntry): number {
	return Math.min(count((entry as Partial<StoredLevel>).gen), MAX_RECORD_GENERATION);
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
	const global = readGeneration(gens[0]);
	return level === null ? global : global + readGeneration(gens[level]);
}

/**
 * One stored reset counter, as a number this store is willing to delete records over.
 *
 * Anything past `MAX_GENERATION` is not a counter we wrote, so it is discarded rather than
 * honoured or clamped. Every reader and writer of `gens` goes through here, which is what
 * keeps `encode` and `decodeStored` agreeing about what a reset means.
 */
export function readGeneration(value: unknown): number {
	const n = count(value);
	return n > MAX_GENERATION ? 0 : n;
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
	const from = Math.max(readGeneration(gens[scope]), readGeneration(atLeast));
	return { ...gens, [scope]: Math.min(from + 1, MAX_GENERATION) };
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
 *
 * "Claiming" is decided by `levelOfId` and by nothing else, because `levelOfId` is what every
 * *counter* in the app files an id under. The two used to disagree: this guard tested
 * `/^L(\d+)-(\d+)$/` and waved through anything that failed to match, while `levelOfId`'s looser
 * `/^L([1-9])-/` happily filed `L1-9000x`, `L1-0001 ` and `L1-+1` under HSK 1 — so forty seeded
 * junk ids read as forty practised and forty mastered on every HSK 1 surface. A guard that
 * disagrees with the thing it is guarding is not a guard.
 *
 * The upper bound is `LEVEL_SIZES`, the official row count, because that is what the build
 * numbers against: eight same-level homographs merge, so a level's ids run `1 … LEVEL_SIZES`
 * with eight holes in them rather than densely to `SHIPPED_SIZES` (verified — the top id at
 * each level is exactly `LEVEL_SIZES`). The holes themselves are not checked here; naming them
 * would need the word lists, which this module deliberately does not pull in.
 */
export function isShippableWordId(wordId: string): boolean {
	// `L` followed by a digit is the whole claim: it is what `levelOfId` looks at, so it is the
	// set this guard has to cover. Anything else is someone else's key and is left alone.
	if (!/^L\d/.test(wordId)) return true;
	// Exactly four digits, because that is the only form the build mints — verified across all
	// five shipped lists, `L1-0001` … `L5-1071`, zero exceptions. A `\d{1,7}` bound accepted
	// `L1-1`, `L1-01`, `L1-001`, `L1-0001`, `L1-00001`, `L1-000001` and `L1-0000001` as seven
	// distinct keys for one word: all seven survived decode, and HSK 1 read "7 practised · 7
	// mastered" over a single answered card. The map is keyed by string, so canonical form is
	// the only thing that makes one word one key.
	const match = /^L([1-9])-(\d{4})$/.exec(wordId);
	if (!match) return false;
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
	return encodeWeighed(stored).text;
}

/**
 * `encode`, plus the heft of what it just wrote, for the price of the one pass it was already
 * making.
 *
 * The write path has to know how much history is going into the key — that is the whole
 * shrink guard — and counting it separately meant a second walk of 4,316 records on every
 * single answer. The encoder is already visiting exactly the records that end up in the
 * bytes, under exactly the filter that decides it, so it is the honest place to count them.
 */
export function encodeWeighed(stored: StoredProgress): { text: string; heft: Heft } {
	let words = 0;
	let answers = 0;
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
		words += 1;
		answers += record.seen;
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
		const n = readGeneration(stored.gens[Number(scope)]);
		if (n > 0) g[scope] = n;
	}

	const payload: Record<string, unknown> = { v: SCHEMA_VERSION, w, l };
	// Omitted entirely when nothing has ever been reset, so the common payload is unchanged
	// from what earlier builds wrote.
	if (Object.keys(g).length > 0) payload.g = g;
	const text = JSON.stringify(payload);
	return { text, heft: { words, answers, readable: true, size: text.length } };
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
			// `readGeneration`, not `count`: a counter past the ceiling is junk, and junk must
			// not be allowed to delete anything. See `MAX_GENERATION`.
			const n = readGeneration(value);
			if (n > 0) stored.gens[scope] = Math.max(readGeneration(stored.gens[scope]), n);
		}
	}
	// A payload from the timestamp era. Its cuts are honoured once, here, and never again.
	const legacyCuts = isRecord(rawGens) ? {} : migrateLegacyCuts(raw, stored.gens);

	// The map slots have to *be* maps. `{"v":1,"w":[…200 records…]}` is a payload whose word map
	// arrived as an array — a shape no build here ever wrote, so something rewrote it — and
	// reading it as "a valid payload holding zero words" was the quietest data loss in the
	// store: nothing was rescued, no notice appeared, and the first answer overwrote all 200.
	// Refusing it hands the bytes to the rescue path instead, which is what `null` means here.
	const words = raw.w ?? raw.byWord;
	if (('w' in raw || 'byWord' in raw) && !isRecord(words)) return null;
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
	if (('l' in raw || 'levels' in raw) && !isRecord(levels)) return null;
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

	// Level entries are history too — "12 sessions, last played Tuesday" is the only record
	// the app keeps of a learner turning up. This used to look at `byWord` alone, so a merge
	// that annihilated every session count and every `lastPlayed` was neither rescued nor
	// reported. Reported as `level:3` so a caller can tell the two kinds apart.
	for (const level of LEVELS) {
		const entry = disk.state.levels[level];
		if (!entry) continue;
		if (merged.state.levels[level]) continue;
		if (levelEntryGen(entry) < generationFor(merged.gens, level)) continue;
		lost.push(`level:${level}`);
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

/** What a rescue copy can actually give back, measured once, from one decode. */
export interface Restorable {
	/** The records and level entries, at no generation: ready for `restoreInto`. */
	stored: StoredProgress;
	/** Word records that would come back. The number the notice prints and the restore must land. */
	words: number;
	/** Answers those records add up to. From the same decode as `words`, never a second view. */
	answers: number;
	/** Level entries — "12 sessions, last played Tuesday" — that come back with them. */
	levels: number;
}

/**
 * Read a *rescue copy* for restoring, as leniently as it can be read honestly.
 *
 * This is deliberately not `decodeStored`, and the difference is the whole bug it exists to
 * fix. `decodeStored` guards the **live key**: it refuses a payload from a newer schema, and
 * it applies every reset generation the payload carries. Both are right for the key and both
 * are catastrophic for a backup, because a copy is set aside *precisely when* something about
 * it could not be trusted:
 *
 * - **Generations are ignored here.** A payload holding 300 records under `g:{"1":3}` decodes
 *   to zero through `decodeStored` — which is exactly why it was copied aside in the first
 *   place. Re-applying that counter on the way back made "Restore it" fold in nothing, report
 *   success on the strength of the write landing, and then delete the only copy. `restoreInto`
 *   stamps every restored record at the generation in force *now*, which is the promise the
 *   store already makes: the learner asking for this history back outranks any reset that
 *   happened while it sat in the backup key.
 * - **Any version is read.** `{"v":7,…}` is a rollback from a future build. Its records are
 *   byte-identical to ours; refusing to *read* them only meant the notice offered Discard as
 *   the single exit from a perfectly parseable payload.
 * - **Both map shapes are read.** A word map that arrived as an array of
 *   `{id,seen,correct,streak,lastSeen,lastMissed}` objects is the most machine-readable
 *   corruption there is, and it too could only be thrown away.
 *
 * What it will not do is guess. Bytes that do not parse, or that name no record and no
 * session, come back as `null` — there is nothing in them to restore.
 */
export function readRestorable(text: string | null, now: number = Date.now()): Restorable | null {
	if (typeof text !== 'string' || text.length === 0) return null;

	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		// A write that was cut off mid-payload. The prefix is still full of *complete* records —
		// see `salvageRecords` — and throwing 240 recoverable words away because the 241st is
		// half-written is the loss this whole file exists to prevent.
		return salvageRecords(text, now);
	}
	if (!isRecord(raw)) return salvageRecords(text, now);

	const stored = emptyStored();
	readRestorableWords(raw.w ?? raw.byWord, stored, now);
	readRestorableLevels(raw.l ?? raw.levels, stored, now);

	const counts = tally(stored);
	const levels = LEVELS.filter((level) => stored.state.levels[level] !== undefined).length;
	if (counts.words === 0 && levels === 0) return null;
	return { stored, words: counts.words, answers: counts.answers, levels };
}

/** Word records and level entries from `rescued` that are now live in `state`. */
export function restoredTotals(
	rescued: StoredProgress,
	state: ProgressState
): { words: number; levels: number } {
	let words = 0;
	for (const wordId of Object.keys(rescued.state.byWord)) {
		const wanted = recordUnderOwnKey(rescued.state.byWord, wordId);
		if (!wanted || !hasHistory(wanted)) continue;
		const live = ownRecord(state.byWord, wordId);
		if (live && hasHistory(live)) words += 1;
	}

	let levels = 0;
	for (const level of LEVELS) {
		if (rescued.state.levels[level] && state.levels[level]) levels += 1;
	}
	return { words, levels };
}

/**
 * One complete `"L1-0001":[6,4,1,1787227200000,0]` pair. Numbers only inside the brackets, so a
 * partial match cannot swallow the rest of the payload, and the tuple has to be *closed* — the
 * record the write was cut off in the middle of simply does not match.
 */
const SALVAGE_RE = /"(L[1-9]-\d{4})"\s*:\s*\[([-\d.,eE+\s]*)\]/g;

/**
 * Pull whole records out of bytes that will not parse.
 *
 * A half-finished `setItem` leaves a payload with one broken record at the end and every
 * earlier one intact. `JSON.parse` refuses the lot, and refusing the lot is how a truncated
 * 300-word write came to offer a learner a single button reading "Discard". Each pair matched
 * here is closed, numeric and complete — it is decoded exactly as the normal path decodes it,
 * and anything that fails that decode is skipped rather than guessed at.
 */
function salvageRecords(text: string, now: number): Restorable | null {
	const stored = emptyStored();
	for (const match of text.matchAll(SALVAGE_RE)) {
		const wordId = match[1];
		if (!isUsableWordId(wordId) || !isShippableWordId(wordId)) continue;
		let fields: unknown;
		try {
			fields = JSON.parse(`[${match[2]}]`);
		} catch {
			continue;
		}
		if (!Array.isArray(fields)) continue;
		const record = decodeWord(wordId, fields, now);
		if (!record) continue;
		delete (record as Partial<StoredWord>).gen;
		stored.state.byWord[wordId] = record;
	}

	const counts = tally(stored);
	if (counts.words === 0) return null;
	return { stored, words: counts.words, answers: counts.answers, levels: 0 };
}

function readRestorableWords(value: unknown, stored: StoredProgress, now: number): void {
	const put = (wordId: unknown, fields: unknown): void => {
		if (!isUsableWordId(wordId) || !isShippableWordId(wordId)) return;
		const record = decodeWord(wordId, fields, now);
		if (!record) return;
		// No generation travels with a restored record: `restoreInto` stamps it at the one in
		// force when the learner asks for it back.
		delete (record as Partial<StoredWord>).gen;
		const existing = recordUnderOwnKey(stored.state.byWord, wordId);
		stored.state.byWord[wordId] = existing ? betterOf(wordId, existing, record) : record;
	};

	if (isRecord(value)) {
		for (const [wordId, fields] of Object.entries(value)) put(wordId, fields);
		return;
	}
	if (!Array.isArray(value)) return;
	// The array shape: each entry carries its own id, as a field or as the head of a tuple.
	for (const entry of value) {
		if (isRecord(entry)) put(entry.id ?? entry.wordId, entry);
		else if (Array.isArray(entry)) put(entry[0], entry.slice(1));
	}
}

function readRestorableLevels(value: unknown, stored: StoredProgress, now: number): void {
	const put = (key: unknown, fields: unknown): void => {
		const level = asLevel(key);
		if (level === null) return;
		const entry = decodeLevel(fields, now);
		if (!entry) return;
		delete (entry as Partial<StoredLevel>).gen;
		stored.state.levels[level] = entry;
	};

	if (isRecord(value)) {
		for (const [key, fields] of Object.entries(value)) put(key, fields);
		return;
	}
	if (!Array.isArray(value)) return;
	for (const entry of value) {
		if (isRecord(entry)) put(entry.level ?? entry.id, entry);
		else if (Array.isArray(entry)) put(entry[0], entry.slice(1));
	}
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
		const n = readGeneration(stored.gens[scope]);
		if (n > 0) copy.gens[scope] = n;
	}
	return copy;
}

/**
 * How much history a *string of bytes* holds — the one measure the rescue net compares.
 *
 * `tally` answers the same question about a decoded payload, and on its own it was not enough
 * to protect anything, for two reasons the store hit in practice:
 *
 * - **Truncated bytes cannot be decoded at all.** A half-written 300-word payload tallies to
 *   nothing, so a rescue that compared tallies would keep a one-word backup and throw the 300
 *   away. Counting the word ids the bytes literally name works on a corpse.
 * - **A decoded tally is post-generation.** `decodeStored` applies reset generations, so a
 *   payload holding 300 records under a generation counter that outranks them tallies to
 *   *zero* — exactly the shape that used to empty the key on load with nothing kept aside.
 *   The bytes still name 300 words, and that is the number worth protecting.
 *
 * So `words` is the larger of the two views, `readable` says whether the bytes parsed, and
 * `size` is the last-resort tie-break for two payloads that name no ids at all.
 */
export interface Heft {
	/** Word records these bytes hold: the greater of what they decode to and what they name. */
	words: number;
	/** Answers those records add up to, or 0 when the bytes cannot be decoded. */
	answers: number;
	/** Whether the bytes decoded to a payload at all. */
	readable: boolean;
	/** Length in characters. Only ever consulted when neither side names a word. */
	size: number;
}

/**
 * A word id sitting where a *record* would be — as a map key, or as the `id` field of an
 * object. Two shapes, because two shapes hold history.
 *
 * This used to be a bare `/"(L[1-9]-\d+)"/` matching an id anywhere in the bytes, on the
 * reasoning that the wire format only ever puts one in a key position anyway. It does; junk
 * does not. `{"v":99,"note":["L1-0001", … 400 of them]}` weighed 400 words, `heavier()`
 * ranks words first, and those bytes evicted a real 50-word backup on a plain page load with
 * no user action at all — defeating the one invariant `#keepAside` rests on. A list of names
 * is not a list of records.
 *
 * So the id has to be *followed by a colon* (`{"L1-0001":[8,7,3,…]}`, the wire format, and
 * still matchable when the bytes are truncated mid-payload) or *introduced by an id field*
 * (`{"id":"L1-0001","seen":8,…}`, the array-of-objects shape a rolled-back build writes).
 * Ids go into a `Set`, so one that appears in both shapes is still one word.
 */
const ID_KEY_RES = [/"(L[1-9]-\d{4})"\s*:/g, /"(?:id|wordId)"\s*:\s*"(L[1-9]-\d{4})"/g] as const;

/** Every distinct word id these bytes hold a record for, filtered as the decoder filters. */
function namedWordIds(text: string): Set<string> {
	const named = new Set<string>();
	for (const re of ID_KEY_RES) {
		for (const match of text.matchAll(re)) {
			// Filtered exactly as the decoder filters, so junk ids cannot inflate the count and make
			// dropping them look like a loss.
			if (isShippableWordId(match[1])) named.add(match[1]);
		}
	}
	return named;
}

/**
 * Weigh some bytes. `decoded` lets a caller that has already parsed them skip a second parse;
 * pass `null` for "I tried and it did not parse", and leave it out for "parse it yourself".
 */
export function weigh(text: string | null, decoded?: StoredProgress | null): Heft {
	if (typeof text !== 'string' || text.length === 0) {
		return { words: 0, answers: 0, readable: true, size: 0 };
	}

	const stored = decoded === undefined ? decodeStored(text) : decoded;

	// The scan is ~9 ms on a 194 KB payload, and it is only ever worth paying for when the
	// decoded view could be understating the bytes: when they did not decode at all, or when a
	// reset generation is in force and may have deleted records that are still sitting in the
	// string. With neither in play — every payload this app writes for a learner who has never
	// reset — the decode already saw every record there is, and cold start pays nothing.
	if (stored !== null && Object.keys(stored.gens).length === 0) {
		const clean = tally(stored);
		return { words: clean.words, answers: clean.answers, readable: true, size: text.length };
	}

	const named = namedWordIds(text);

	if (stored === null) return { words: named.size, answers: 0, readable: false, size: text.length };

	const counts = tally(stored);
	return {
		words: Math.max(named.size, counts.words),
		answers: counts.answers,
		readable: true,
		size: text.length
	};
}

/**
 * Whether writing `to` over `from` would leave the learner with less than they had.
 *
 * Deliberately narrower than `heavier`: only the two figures a person would recognise as
 * their own history count, and a shorter encoding of the same history is not a loss. This is
 * the test the write path gates on, so a false positive would put a scary notice on screen
 * over nothing.
 */
export function shrinks(from: Heft, to: Heft): boolean {
	if (to.words !== from.words) return to.words < from.words;
	return to.answers < from.answers;
}

/**
 * Whether `a` holds more of the learner's history than `b`.
 *
 * Words first, then answers, then readability, then sheer length. Ties go to `b` — the caller
 * passes the incumbent copy as `b`, so an equal newcomer never displaces a copy already kept.
 */
export function heavier(a: Heft, b: Heft): boolean {
	if (a.words !== b.words) return a.words > b.words;
	if (a.answers !== b.answers) return a.answers > b.answers;
	if (a.readable !== b.readable) return a.readable;
	return a.size > b.size;
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
		gens[scope] = Math.max(readGeneration(gens[scope]), 1);
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

/**
 * Coerce anything at all to a non-negative integer. `NaN`, `-1`, `'x'`, `null` → `0`.
 *
 * Capped at `Number.MAX_SAFE_INTEGER`, because past it a "number" stops behaving like one:
 * `1e308` and `1e308 + 1` are equal, `Math.floor` is the identity, and two such values added
 * together reach `Infinity`, which then coerces back to 0 and silently empties the payload.
 * Nothing this app counts — answers, sessions, milliseconds since 2024 — comes within nine
 * orders of magnitude of the cap, so it only ever bites junk.
 */
function count(value: unknown): number {
	const n = typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(n) || n <= 0) return 0;
	return Math.min(Math.floor(n), Number.MAX_SAFE_INTEGER);
}

/**
 * A timestamp, sanitised for plausibility and not just for sign.
 *
 * Below the app's own epoch it is junk and reads better as 0 ("never") than as "57y ago".
 *
 * The future is the harder half, and the rule here is: **never flatten history to fix a
 * clock.** Pulling a future stamp back to `now` looks like a tidy repair and is a data loss
 * that cannot be undone — five records carrying five real, distinct 2026 dates, opened once
 * on a device whose battery died and whose clock is three days slow, all came back stamped at
 * the same instant *and were written back that way*, so correcting the clock brought nothing
 * back. Worse, every one of them then read as "missed just now", which is the exact input the
 * miss-weighted scheduler runs on: the store manufactured urgency about itself.
 *
 * A device three days slow is an ordinary post-2024 clock, so `now < EPOCH_FLOOR` never fires
 * for it and the old 36-hour slack caught it in full. The slack is therefore only about how a
 * date *reads*, and reading "in 2d" for an afternoon is a trivial cost next to losing the
 * ordering of a learner's history. So anything inside `FUTURE_HORIZON_MS` is kept exactly as
 * found, distinct stamps stay distinct, and only a value no clock skew could explain — a
 * corrupt `1e15`, "in 50y" — is refused, as 0 rather than as `now`, because a stamp we cannot
 * believe must not become a fresh event the scheduler acts on.
 *
 * This only ever affects how a date *reads*. Nothing is deleted on the strength of it.
 */
function stamp(value: unknown, now: number): number {
	const n = count(value);
	if (n === 0) return 0;
	if (n < EPOCH_FLOOR) return 0;
	// A clock that cannot be true cannot adjudicate the future either.
	if (now < EPOCH_FLOOR) return n;
	return n > now + FUTURE_HORIZON_MS ? 0 : n;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
