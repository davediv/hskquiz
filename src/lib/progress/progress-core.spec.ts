import { describe, expect, it } from 'vitest';
import {
	SCHEMA_VERSION,
	type Generations,
	type StoredProgress,
	applyAnswer,
	applyGenerations,
	applySeen,
	blankWord,
	bumpGeneration,
	decode,
	decodeStored,
	emptyState,
	emptyStored,
	encode,
	generationFor,
	generationForWord,
	heavier,
	isShippableWordId,
	isUsableWordId,
	levelOfId,
	mergeProgress,
	readGeneration,
	recordGen,
	restoreInto,
	shrinks,
	stampLevelGen,
	tally,
	unexplainedLosses,
	weigh
} from './progress-core.ts';
import type { WordProgress } from '$lib/types';

/** A clock inside the decoder's plausibility window, and stamps around it. */
const NOW = 1_787_000_000_000;
const EARLIER = NOW - 86_400_000;
const MINUTE = 60_000;

type WordFields = Partial<WordProgress> & { gen?: number };

function stored(words: Record<string, WordFields>, gens: Generations = {}): StoredProgress {
	const payload = emptyStored();
	for (const [wordId, fields] of Object.entries(words)) {
		payload.state.byWord[wordId] = { ...blankWord(wordId), ...fields };
	}
	payload.gens = { ...gens };
	return payload;
}

function wrap(state = emptyState(), gens: Generations = {}): StoredProgress {
	return { state, gens };
}

/** The generation a payload holds for one id, or -1 when it holds no record at all. */
function genOf(payload: StoredProgress | null | undefined, wordId: string): number {
	const record = payload?.state.byWord[wordId];
	return record ? recordGen(record) : -1;
}

describe('applyAnswer', () => {
	it('counts a correct answer and extends the streak', () => {
		const record = blankWord('L1-0001');

		applyAnswer(record, true, 1000, 0);
		applyAnswer(record, true, 2000, 0);

		expect(record).toEqual({
			wordId: 'L1-0001',
			seen: 2,
			correct: 2,
			streak: 2,
			lastSeen: 2000,
			lastMissed: 0
		});
	});

	it('resets the streak on a miss and stamps lastMissed, without touching correct', () => {
		const record = blankWord('L1-0001');
		applyAnswer(record, true, 1000, 0);
		applyAnswer(record, true, 2000, 0);
		applyAnswer(record, true, 3000, 0);
		expect(record.streak).toBe(3);

		applyAnswer(record, false, 4000, 0);

		expect(record.streak).toBe(0);
		expect(record.correct).toBe(3);
		expect(record.seen).toBe(4);
		expect(record.lastSeen).toBe(4000);
		expect(record.lastMissed).toBe(4000);

		applyAnswer(record, true, 5000, 0);
		expect(record.streak).toBe(1);
		expect(record.lastMissed).toBe(4000);
	});

	it('stamps the reset generation the answer was given under', () => {
		const record = blankWord('L1-0001');

		applyAnswer(record, true, 1000, 3);

		expect(recordGen(record)).toBe(3);
	});

	it('leaves generation 0 off the record entirely', () => {
		const record = blankWord('L1-0001');

		applyAnswer(record, true, 1000, 0);

		expect('gen' in record).toBe(false);
		expect(recordGen(record)).toBe(0);
	});
});

describe('applySeen — the teach card', () => {
	it('stamps the exposure and writes nothing that reads as an answer', () => {
		const record = blankWord('L1-0001');

		applySeen(record, NOW, 0);

		// The whole point: an introduction asked nothing, so it can claim nothing.
		expect(record).toEqual({
			wordId: 'L1-0001',
			seen: 0,
			correct: 0,
			streak: 0,
			lastSeen: NOW,
			lastMissed: 0
		});
	});

	it('survives a round trip, so a word is not introduced again on every reload', () => {
		const stored = emptyStored();
		const record = blankWord('L1-0001');
		// A real clock: the decoder floors anything before 2024 to 0, which would take the
		// exposure with it — the store writes through `#at()`, which floors the same way.
		applySeen(record, NOW, 0);
		stored.state.byWord['L1-0001'] = record;

		const decoded = decodeStored(encode(stored), NOW);

		expect(decoded?.state.byWord['L1-0001']?.lastSeen).toBe(NOW);
		expect(decoded?.state.byWord['L1-0001']?.seen).toBe(0);
	});

	it('is superseded by a real answer rather than competing with one', () => {
		const record = blankWord('L1-0001');

		applySeen(record, NOW, 0);
		applyAnswer(record, true, NOW + 1000, 0);

		expect(record.seen).toBe(1);
		expect(record.correct).toBe(1);
		expect(record.lastSeen).toBe(NOW + 1000);
	});
});

describe('generations', () => {
	it('sums the global counter with the level’s, so one integer covers both scopes', () => {
		const gens: Generations = { 0: 2, 3: 1 };

		expect(generationFor(gens, 3)).toBe(3);
		expect(generationFor(gens, 1)).toBe(2);
		// An id that names no level answers to the global counter alone.
		expect(generationFor(gens, null)).toBe(2);
		expect(generationForWord(gens, 'L3-0001')).toBe(3);
		expect(generationForWord(gens, 'custom-a')).toBe(2);
	});

	it('bumps past a generation it has only just read off the key', () => {
		// Generations merge by Math.max, so a reset in a tab holding a stale payload has to
		// outrank what is already there or the merge simply absorbs it.
		expect(bumpGeneration({}, 0)).toEqual({ 0: 1 });
		expect(bumpGeneration({ 0: 1 }, 0, 7)).toEqual({ 0: 8 });
		expect(bumpGeneration({ 0: 9 }, 0, 7)).toEqual({ 0: 10 });
	});
});

describe('encode / decode', () => {
	it('round-trips state through the compact wire format', () => {
		const state = emptyState();
		state.byWord['L1-0001'] = {
			wordId: 'L1-0001',
			seen: 5,
			correct: 4,
			streak: 2,
			lastSeen: NOW,
			lastMissed: EARLIER
		};
		state.levels[2] = { sessions: 3, lastPlayed: NOW };

		const decoded = decode(encode(wrap(state)), NOW);

		expect(decoded).toEqual(state);
	});

	it('round-trips generations alongside the state', () => {
		const payload = stored({ 'L1-0001': { seen: 1, correct: 1, lastSeen: NOW, gen: 2 } }, { 3: 2 });

		const decoded = decodeStored(encode(payload), NOW);

		expect(decoded?.gens).toEqual({ 3: 2 });
		expect(decoded?.state.byWord['L1-0001']?.seen).toBe(1);
		expect(genOf(decoded, 'L1-0001')).toBe(2);
	});

	it('leaves the generation field out entirely when nothing was ever reset', () => {
		const state = emptyState();
		state.byWord['L1-0001'] = { ...blankWord('L1-0001'), seen: 1, correct: 1, lastSeen: NOW };

		expect(JSON.parse(encode(wrap(state)))).toEqual({
			v: SCHEMA_VERSION,
			w: { 'L1-0001': [1, 1, 0, NOW, 0] },
			l: {}
		});
	});

	it('stores word records as tuples, not objects', () => {
		const state = emptyState();
		state.byWord['L1-0001'] = {
			wordId: 'L1-0001',
			seen: 5,
			correct: 4,
			streak: 2,
			lastSeen: NOW,
			lastMissed: EARLIER
		};

		expect(JSON.parse(encode(wrap(state)))).toEqual({
			v: SCHEMA_VERSION,
			w: { 'L1-0001': [5, 4, 2, NOW, EARLIER] },
			l: {}
		});
	});

	it('appends the generation to the tuple only once it is non-zero', () => {
		const payload = stored({ 'L2-0001': { seen: 1, correct: 1, lastSeen: NOW, gen: 4 } }, { 0: 4 });
		// The level entry was written under the same reset.
		const level = { sessions: 2, lastPlayed: NOW };
		stampLevelGen(level, 4);
		payload.state.levels[2] = level;

		expect(JSON.parse(encode(payload))).toEqual({
			v: SCHEMA_VERSION,
			w: { 'L2-0001': [1, 1, 0, NOW, 0, 4] },
			l: { '2': [2, NOW, 4] },
			g: { '0': 4 }
		});
	});

	it('encodes the same data to the same bytes whatever order the keys went in', () => {
		const a = emptyState();
		const b = emptyState();
		for (const id of ['L1-0003', 'L1-0001', 'L1-0002']) {
			a.byWord[id] = { ...blankWord(id), seen: 1, correct: 1, lastSeen: NOW };
		}
		for (const id of ['L1-0001', 'L1-0002', 'L1-0003']) {
			b.byWord[id] = { ...blankWord(id), seen: 1, correct: 1, lastSeen: NOW };
		}

		expect(encode(wrap(a))).toBe(encode(wrap(b)));
	});

	it('drops records for words that were never actually answered', () => {
		const state = emptyState();
		state.byWord['L1-0001'] = blankWord('L1-0001');

		expect(JSON.parse(encode(wrap(state))).w).toEqual({});
	});

	it('never writes bytes its own decoder reads as empty', () => {
		// The root cause of the loop-2 data loss: the encoder ignored erasures, so the store
		// happily wrote a payload holding one record and a reset that record predated, and the
		// decoder resolved it to zero words. Encoder and decoder have to agree.
		const payload = stored({ 'L1-0001': { seen: 3, correct: 3, lastSeen: NOW, gen: 0 } }, { 0: 1 });

		const text = encode(payload);

		expect(JSON.parse(text).w).toEqual({});
		expect(decodeStored(text, NOW)?.state.byWord).toEqual({});
	});

	it('encoding is idempotent under decoding, whatever the clock says', () => {
		const payload = stored(
			{
				'L1-0001': { seen: 2, correct: 2, lastSeen: NOW, gen: 1 },
				'L1-0002': { seen: 1, correct: 0, lastSeen: EARLIER, gen: 0 }
			},
			{ 0: 1 }
		);

		const once = encode(payload);
		for (const clock of [NOW, NOW - 40 * 3_600_000, NOW + 40 * 3_600_000]) {
			const decoded = decodeStored(once, clock);
			expect(Object.keys(decoded?.state.byWord ?? {})).toEqual(['L1-0001']);
		}
	});
});

describe('decode', () => {
	it('returns null for nothing, corrupt JSON and non-object payloads', () => {
		expect(decode(null)).toBeNull();
		expect(decode('')).toBeNull();
		expect(decode('{"v":1,"w":')).toBeNull();
		expect(decode('not json at all')).toBeNull();
		expect(decode('[1,2,3]')).toBeNull();
		expect(decode('"a string"')).toBeNull();
		expect(decode('null')).toBeNull();
	});

	it('refuses a payload from a newer schema instead of half-reading it', () => {
		const future = JSON.stringify({ v: SCHEMA_VERSION + 1, w: { 'L1-0001': [1, 1, 1, NOW, 0] } });

		expect(decode(future, NOW)).toBeNull();
	});

	it('refuses a newer payload that hides its version behind a v of 0', () => {
		// `raw.v ?? raw.version` read this as version 0 and accepted it — a v2 payload misread as
		// v1 and then destroyed by the first answer. The version is the highest field, not the
		// first non-nullish one.
		expect(decode('{"v":0,"version":2,"w":{}}', NOW)).toBeNull();
	});

	it('refuses a fractional version rather than flooring it into range', () => {
		expect(decode('{"v":1.9,"w":{}}', NOW)).toBeNull();
	});

	it('refuses a version that is not a plain number', () => {
		expect(decode('{"v":"1","w":{}}', NOW)).toBeNull();
		expect(decode('{"v":{},"w":{}}', NOW)).toBeNull();
	});

	it('migrates the pre-v1 verbose shape', () => {
		const legacy = JSON.stringify({
			version: 0,
			byWord: {
				'L1-0001': {
					wordId: 'L1-0001',
					seen: 4,
					correct: 3,
					streak: 2,
					lastSeen: NOW,
					lastMissed: EARLIER
				}
			},
			levels: { '1': { sessions: 2, lastPlayed: NOW } }
		});

		const decoded = decode(legacy, NOW);

		expect(decoded?.byWord['L1-0001']).toEqual({
			wordId: 'L1-0001',
			seen: 4,
			correct: 3,
			streak: 2,
			lastSeen: NOW,
			lastMissed: EARLIER
		});
		expect(decoded?.levels[1]).toEqual({ sessions: 2, lastPlayed: NOW });
		expect(decoded?.version).toBe(SCHEMA_VERSION);
	});

	it('sanitises junk fields rather than propagating NaN into the app', () => {
		const junk = JSON.stringify({
			v: 1,
			w: {
				'L1-0001': [-4, 'x', null, NOW, undefined],
				'L1-0002': ['9', '9', '9', '9', '0'],
				'L1-0003': 'not a record',
				'L1-0004': [0, 0, 0, 0, 0]
			},
			l: { '1': [2, NOW], '9': [4, NOW], banana: [1, NOW] }
		});

		const decoded = decode(junk, NOW);

		// A negative `seen` sanitises to 0 rather than to NaN. The record survives because its
		// `lastSeen` is real — seen 0 with a stamp is an introduction, not junk — but every
		// field that claimed an answer is gone.
		expect(decoded?.byWord['L1-0001']).toEqual({
			wordId: 'L1-0001',
			seen: 0,
			correct: 0,
			streak: 0,
			lastSeen: NOW,
			lastMissed: 0
		});
		expect(decoded?.byWord['L1-0002']?.seen).toBe(9);
		expect(decoded?.byWord['L1-0003']).toBeUndefined();
		// Nothing ever happened to this one — no answer and no exposure — so it is dropped.
		expect(decoded?.byWord['L1-0004']).toBeUndefined();
		// Only real levels survive.
		expect(Object.keys(decoded?.levels ?? {})).toEqual(['1']);
	});

	it('sanitises a junk generation rather than erasing everything with it', () => {
		const junk = JSON.stringify({
			v: 1,
			w: { 'L1-0001': [1, 1, 1, NOW, 0, 'banana'] },
			g: { '0': 'banana', '9': 4, '1': -3 }
		});

		const decoded = decodeStored(junk, NOW);

		expect(decoded?.gens).toEqual({});
		expect(decoded?.state.byWord['L1-0001']?.seen).toBe(1);
	});

	it('clamps correct to seen and streak to correct', () => {
		const impossible = JSON.stringify({ v: 1, w: { 'L1-0001': [2, 99, 99, NOW, 0] } });

		expect(decode(impossible, NOW)?.byWord['L1-0001']).toEqual({
			wordId: 'L1-0001',
			seen: 2,
			correct: 2,
			streak: 2,
			lastSeen: NOW,
			lastMissed: 0
		});
	});

	it('refuses ids that would land on Object.prototype instead of in the map', () => {
		// Written as text, not through an object literal: `{ __proto__: … }` in source sets the
		// prototype, whereas `JSON.parse` defines it as a real own property — which is exactly
		// the shape that used to make `byWord`'s prototype a bogus record.
		const hostile =
			`{"v":1,"w":{"__proto__":[7,7,7,${NOW},0],` +
			`"toString":[1,1,1,${NOW},0],"L1-0001":[1,1,1,${NOW},0]}}`;

		const decoded = decode(hostile, NOW);

		expect(Object.keys(decoded?.byWord ?? {})).toEqual(['L1-0001']);
		expect(({} as Record<string, unknown>).seen).toBeUndefined();
	});

	it('treats an implausible timestamp as no timestamp instead of "57y ago"', () => {
		const ancient = JSON.stringify({ v: 1, w: { 'L1-0001': [1, 1, 1, 1, 0] } });

		expect(decode(ancient, NOW)?.byWord['L1-0001']?.lastSeen).toBe(0);
	});

	it('pulls a timestamp from a bad clock back to now instead of "in 50y"', () => {
		const skewed = JSON.stringify({
			v: 1,
			w: { 'L1-0001': [1, 1, 1, NOW + 400 * 86_400_000, 0] },
			l: { '1': [3, NOW + 400 * 86_400_000] }
		});

		const decoded = decode(skewed, NOW);

		expect(decoded?.byWord['L1-0001']?.lastSeen).toBe(NOW);
		expect(decoded?.levels[1]?.lastPlayed).toBe(NOW);
	});

	it('applies a reset generation it finds in the payload', () => {
		const payload = JSON.stringify({
			v: 1,
			w: { 'L1-0001': [1, 1, 1, EARLIER, 0], 'L1-0002': [1, 1, 1, NOW, 0, 1] },
			l: { '1': [4, EARLIER] },
			g: { '0': 1 }
		});

		const decoded = decodeStored(payload, NOW);

		expect(Object.keys(decoded?.state.byWord ?? {})).toEqual(['L1-0002']);
		expect(decoded?.state.levels[1]).toBeUndefined();
	});

	it('keeps an answer given after a reset however wrong the device clock is', () => {
		// The loop-2 FAIL, end to end. Reset on a phone running fast, correct the clock, answer:
		// the answers are stamped *before* the reset and used to be deleted on the next read, for
		// as long as the skew lasted. A generation does not care what the clock says.
		for (const skewMs of [MINUTE, 10 * MINUTE, 2 * 3_600_000, 35 * 3_600_000]) {
			const payload = JSON.stringify({
				v: 1,
				w: {
					// Written after the reset (generation 1) but stamped before it, by the skew.
					'L1-0001': [1, 1, 1, NOW - skewMs, 0, 1],
					'L1-0002': [1, 1, 1, NOW - skewMs, 0, 1],
					'L1-0003': [1, 1, 1, NOW - skewMs, 0, 1],
					// Written before the reset. Stays erased.
					'L1-0004': [9, 9, 9, NOW - skewMs - 1, 0]
				},
				g: { '0': 1 }
			});

			const decoded = decodeStored(payload, NOW);

			expect(Object.keys(decoded?.state.byWord ?? {}).sort()).toEqual([
				'L1-0001',
				'L1-0002',
				'L1-0003'
			]);
		}
	});

	it('keeps a reset stuck on a clock running years in the past', () => {
		// The mirror: `stamp()` pulls implausible values back to `now`, so under the old rule
		// every stored record decoded as newer than the tombstone and the reset could not stick.
		const payload = JSON.stringify({
			v: 1,
			w: { 'L1-0001': [4, 4, 4, NOW, 0] },
			g: { '0': 1 }
		});

		for (const clock of [Date.UTC(2001, 5, 1), NOW, NOW + 50 * 365 * 86_400_000]) {
			expect(decodeStored(payload, clock)?.state.byWord).toEqual({});
		}
	});

	it('migrates a timestamp tombstone from the pre-generation format, once', () => {
		const legacy = JSON.stringify({
			v: 1,
			w: { 'L1-0001': [1, 1, 1, EARLIER, 0], 'L1-0002': [2, 2, 2, NOW, 0] },
			l: { '1': [4, EARLIER], '2': [1, NOW] },
			c: { '0': EARLIER + 1000 }
		});

		const decoded = decodeStored(legacy, NOW) ?? emptyStored();

		// The cut is honoured by comparing two numbers from the same payload — never against a
		// clock — and then spent: what survives is adopted at the generation it migrated to.
		expect(Object.keys(decoded.state.byWord)).toEqual(['L1-0002']);
		expect(Object.keys(decoded.state.levels)).toEqual(['2']);
		expect(decoded.gens).toEqual({ 0: 1 });
		expect(genOf(decoded, 'L1-0002')).toBe(1);

		// Re-encoded, it is a generation payload and the cut never applies again.
		const rewritten = encode(decoded);
		expect(JSON.parse(rewritten).c).toBeUndefined();
		expect(JSON.parse(rewritten).g).toEqual({ '0': 1 });
		expect(Object.keys(decodeStored(rewritten, NOW)?.state.byWord ?? {})).toEqual(['L1-0002']);
	});
});

describe('a payload whose shape is wrong is not a payload', () => {
	it('refuses a word map that is not a map', () => {
		// It parses, so the rescue net used to wave it straight through, and it decodes to
		// zero words, so the learner's next answer overwrote every record in it with no copy
		// kept anywhere. `null` here means "not ours to read, and not ours to destroy".
		expect(decodeStored('{"v":1,"w":[{"id":"L1-0001","seen":3}],"l":{}}', NOW)).toBeNull();
		expect(decodeStored('{"v":1,"w":"nope","l":{}}', NOW)).toBeNull();
		expect(decodeStored('{"v":1,"w":null,"l":{}}', NOW)).toBeNull();
	});

	it('refuses a level map that is not a map', () => {
		expect(decodeStored('{"v":1,"w":{},"l":[1,2]}', NOW)).toBeNull();
	});

	it('still reads an ordinary empty payload', () => {
		expect(decodeStored('{"v":1,"w":{},"l":{}}', NOW)).not.toBeNull();
	});
});

describe('a clock that cannot be true does not get to judge timestamps', () => {
	it('leaves real stamps alone when the device clock predates the app', () => {
		// A phone on a 2001 clock used to flatten five distinct 2026 dates to one instant, and
		// then write them back that way — correcting the clock could not undo it, and every
		// recency comparison downstream saw a flat history.
		const a = NOW - 5 * 86_400_000;
		const b = NOW - 4 * 86_400_000;
		const text = JSON.stringify({
			v: 1,
			w: { 'L1-0001': [3, 3, 3, a, 0], 'L1-0002': [3, 3, 3, b, 0] },
			l: {}
		});

		const payload = decodeStored(text, Date.UTC(2001, 0, 1));

		expect(payload?.state.byWord['L1-0001']?.lastSeen).toBe(a);
		expect(payload?.state.byWord['L1-0002']?.lastSeen).toBe(b);
	});

	it('still pulls a stamp back when the clock is one we can believe', () => {
		const text = JSON.stringify({
			v: 1,
			w: { 'L1-0001': [3, 3, 3, NOW + 40 * 3_600_000, 0] },
			l: {}
		});

		expect(decodeStored(text, NOW)?.state.byWord['L1-0001']?.lastSeen).toBe(NOW);
	});
});

describe('isUsableWordId', () => {
	it('accepts real ids and refuses everything Object.prototype already owns', () => {
		expect(isUsableWordId('L1-0001')).toBe(true);
		expect(isUsableWordId('custom-a')).toBe(true);
		expect(isUsableWordId('')).toBe(false);
		expect(isUsableWordId('__proto__')).toBe(false);
		expect(isUsableWordId('constructor')).toBe(false);
		expect(isUsableWordId('toString')).toBe(false);
		expect(isUsableWordId('hasOwnProperty')).toBe(false);
		expect(isUsableWordId(7)).toBe(false);
	});
});

describe('mergeProgress', () => {
	const base = stored({ 'L1-0001': { seen: 1, correct: 1, streak: 1, lastSeen: EARLIER } });

	it('keeps a word each side added independently', () => {
		const mine = stored({ 'L1-0002': { seen: 1, correct: 1, streak: 1, lastSeen: NOW } });
		const theirs = stored({ 'L1-0003': { seen: 1, correct: 1, streak: 1, lastSeen: NOW } });

		const merged = mergeProgress(emptyStored(), mine, theirs);

		expect(Object.keys(merged.state.byWord).sort()).toEqual(['L1-0002', 'L1-0003']);
	});

	it('adds both sides’ answers to the same word rather than taking the larger', () => {
		const mine = stored({ 'L1-0001': { seen: 2, correct: 2, streak: 2, lastSeen: NOW } });
		const theirs = stored({
			'L1-0001': { seen: 2, correct: 1, streak: 0, lastSeen: NOW + 10, lastMissed: NOW + 10 }
		});

		const merged = mergeProgress(base, mine, theirs);

		// One answer before the split, then one on each side.
		expect(merged.state.byWord['L1-0001']?.seen).toBe(3);
		expect(merged.state.byWord['L1-0001']?.correct).toBe(2);
		// The streak belongs to whoever answered last, and theirs was a miss.
		expect(merged.state.byWord['L1-0001']?.streak).toBe(0);
		expect(merged.state.byWord['L1-0001']?.lastMissed).toBe(NOW + 10);
	});

	it('keeps a record deleted here that the other side has not moved on', () => {
		const merged = mergeProgress(base, emptyStored(), base);

		expect(merged.state.byWord).toEqual({});
	});

	it('brings a deleted record back when the other side really did answer it again', () => {
		const theirs = stored({ 'L1-0001': { seen: 4, correct: 4, streak: 4, lastSeen: NOW } });

		const merged = mergeProgress(base, emptyStored(), theirs);

		expect(merged.state.byWord['L1-0001']?.seen).toBe(4);
	});

	it('lets a reset generation erase what the other side still holds', () => {
		const mine = stored({}, { 0: 1 });
		const theirs = stored({ 'L1-0001': { seen: 9, correct: 9, streak: 9, lastSeen: NOW + 5 } });

		const merged = mergeProgress(emptyStored(), mine, theirs);

		expect(merged.state.byWord).toEqual({});
		expect(merged.gens).toEqual({ 0: 1 });
	});

	it('scopes a level reset to that level', () => {
		const mine = stored({}, { 2: 1 });
		const theirs = stored({
			'L1-0001': { seen: 1, correct: 1, streak: 1, lastSeen: EARLIER },
			'L2-0001': { seen: 1, correct: 1, streak: 1, lastSeen: EARLIER }
		});

		const merged = mergeProgress(emptyStored(), mine, theirs);

		expect(Object.keys(merged.state.byWord)).toEqual(['L1-0001']);
	});

	it('does not let a reset erase an answer given under it', () => {
		const mine = stored(
			{ 'L1-0007': { seen: 1, correct: 1, streak: 1, lastSeen: 0, gen: 1 } },
			{ 0: 1 }
		);

		const merged = mergeProgress(emptyStored(), mine, emptyStored());

		// `lastSeen: 0` on purpose: the timestamp is now irrelevant to whether a record survives.
		expect(merged.state.byWord['L1-0007']?.seen).toBe(1);
	});

	it('takes the higher of two generations for the same scope', () => {
		const mine = stored({}, { 0: 1 });
		const theirs = stored({}, { 0: 4 });

		expect(mergeProgress(emptyStored(), mine, theirs).gens).toEqual({ 0: 4 });
	});

	it('carries the newer generation onto a record both sides hold', () => {
		const mine = stored({ 'L1-0001': { seen: 1, correct: 1, lastSeen: NOW, gen: 2 } }, { 0: 2 });
		const theirs = stored({ 'L1-0001': { seen: 1, correct: 1, lastSeen: EARLIER } });

		const merged = mergeProgress(emptyStored(), mine, theirs);

		expect(genOf(merged, 'L1-0001')).toBe(2);
		expect(merged.state.byWord['L1-0001']?.seen).toBe(2);
	});

	it('adds up session counts the same way it adds answers', () => {
		const ancestor = emptyStored();
		ancestor.state.levels[1] = { sessions: 2, lastPlayed: EARLIER };
		const mine = emptyStored();
		mine.state.levels[1] = { sessions: 3, lastPlayed: NOW };
		const theirs = emptyStored();
		theirs.state.levels[1] = { sessions: 4, lastPlayed: NOW - 10 };

		const merged = mergeProgress(ancestor, mine, theirs);

		expect(merged.state.levels[1]).toEqual({ sessions: 5, lastPlayed: NOW });
	});
});

describe('unexplainedLosses', () => {
	it('says nothing when a reset accounts for every record that went', () => {
		const disk = stored({ 'L1-0001': { seen: 3, correct: 3, lastSeen: NOW } });
		const merged = stored({}, { 0: 1 });

		expect(unexplainedLosses(disk, merged)).toEqual([]);
	});

	it('names records a merge dropped that nothing accounts for', () => {
		const disk = stored({
			'L1-0001': { seen: 3, correct: 3, lastSeen: NOW },
			'L1-0002': { seen: 1, correct: 0, lastSeen: NOW }
		});
		const merged = stored({ 'L1-0002': { seen: 1, correct: 0, lastSeen: NOW } });

		expect(unexplainedLosses(disk, merged)).toEqual(['L1-0001']);
	});

	it('does not flag a record that survived under a different generation', () => {
		const disk = stored({ 'L1-0001': { seen: 3, correct: 3, lastSeen: NOW } });
		const merged = stored({ 'L1-0001': { seen: 4, correct: 4, lastSeen: NOW, gen: 2 } }, { 0: 2 });

		expect(unexplainedLosses(disk, merged)).toEqual([]);
	});
});

describe('restoreInto', () => {
	it('takes the better of each field rather than adding the two up', () => {
		const mine = stored({ 'L1-0001': { seen: 2, correct: 1, streak: 0, lastSeen: NOW } });
		const rescued = stored({
			'L1-0001': { seen: 5, correct: 4, streak: 2, lastSeen: EARLIER, lastMissed: EARLIER }
		});

		const restored = restoreInto(mine, rescued);

		expect(restored.state.byWord['L1-0001']).toMatchObject({
			seen: 5,
			correct: 4,
			// The streak belongs to whoever answered most recently, which is us, and we missed.
			streak: 0,
			lastSeen: NOW,
			lastMissed: EARLIER
		});
	});

	it('stamps restored history at the current generation so a past reset cannot re-erase it', () => {
		const mine = stored({}, { 0: 3 });
		const rescued = stored({ 'L1-0009': { seen: 4, correct: 4, lastSeen: EARLIER } });

		const restored = restoreInto(mine, rescued);
		applyGenerations(restored);

		expect(restored.state.byWord['L1-0009']?.seen).toBe(4);
		expect(genOf(restored, 'L1-0009')).toBe(3);
	});

	it('keeps level sessions from whichever side has more of them', () => {
		const mine = emptyStored();
		mine.state.levels[1] = { sessions: 1, lastPlayed: NOW };
		const rescued = emptyStored();
		rescued.state.levels[1] = { sessions: 6, lastPlayed: EARLIER };

		const restored = restoreInto(mine, rescued);

		expect(restored.state.levels[1]).toMatchObject({ sessions: 6, lastPlayed: NOW });
	});
});

describe('tally', () => {
	it('counts the words and answers a payload holds', () => {
		const payload = stored({
			'L1-0001': { seen: 3, correct: 2, lastSeen: NOW },
			'L1-0002': { seen: 1, correct: 1, lastSeen: NOW },
			'L1-0003': { seen: 0 }
		});

		expect(tally(payload)).toEqual({ words: 2, answers: 4 });
	});
});

describe('isShippableWordId', () => {
	it('bounds an L-shaped id by the level it names', () => {
		expect(isShippableWordId('L1-0001')).toBe(true);
		expect(isShippableWordId('L1-0500')).toBe(true);
		expect(isShippableWordId('L1-0501')).toBe(false);
		expect(isShippableWordId('L1-9000')).toBe(false);
		expect(isShippableWordId('L5-1071')).toBe(true);
		expect(isShippableWordId('L5-1072')).toBe(false);
		expect(isShippableWordId('L1-0000')).toBe(false);
		expect(isShippableWordId('L9-0001')).toBe(false);
		expect(isShippableWordId('L10-0001')).toBe(false);
	});

	it('leaves ids that are not claiming to be ours alone', () => {
		expect(isShippableWordId('custom-a')).toBe(true);
		expect(isShippableWordId('anything')).toBe(true);
	});

	it('agrees with levelOfId about what is claiming to be ours', () => {
		// The guard used to return true whenever its own regex failed to match, while
		// `levelOfId`'s looser test still filed these under HSK 1 — so forty seeded ids read as
		// forty practised words on every HSK 1 surface. A guard that disagrees with the thing
		// it is guarding is not a guard.
		for (const id of ['L1-9000x', 'L1-0001 ', 'L1-+1', 'L1-', 'L1-00001234567']) {
			expect(isShippableWordId(id)).toBe(false);
			if (levelOfId(id) !== null) expect(levelOfId(id)).toBe(1);
		}
	});
});

describe('readGeneration', () => {
	it('takes a counter a reset could have produced', () => {
		expect(readGeneration(0)).toBe(0);
		expect(readGeneration(7)).toBe(7);
		expect(readGeneration('3')).toBe(3);
		expect(readGeneration(-1)).toBe(0);
	});

	it('ignores a counter no reset could have produced, rather than honouring it', () => {
		// Honouring `1e22` deleted every record on load; clamping it would too, because every
		// record predates the clamp. A counter we cannot believe deletes nothing.
		expect(readGeneration('9999999999999999999999')).toBe(0);
		expect(readGeneration(1e308)).toBe(0);
		expect(readGeneration(Infinity)).toBe(0);
		expect(readGeneration(Number.NaN)).toBe(0);
	});

	it('keeps a bogus counter out of every generation comparison', () => {
		const payload = decodeStored(
			`{"v":1,"w":{"L1-0001":[3,3,3,${NOW},0]},"g":{"0":1e308,"1":1e308}}`,
			NOW
		);

		expect(payload?.state.byWord['L1-0001']?.seen).toBe(3);
		expect(generationFor(payload?.gens ?? {}, 1)).toBe(0);
		// And what it encodes must be what it reads back, or the store writes bytes its own
		// reader treats as empty.
		expect(
			decodeStored(encode(payload as StoredProgress), NOW)?.state.byWord['L1-0001']
		).toBeTruthy();
	});
});

describe('weigh', () => {
	it('counts what a readable payload holds', () => {
		const text = encode(
			stored({
				'L1-0001': { seen: 3, correct: 2, lastSeen: NOW },
				'L1-0002': { seen: 1, correct: 1, lastSeen: NOW }
			})
		);

		expect(weigh(text)).toMatchObject({ words: 2, answers: 4, readable: true });
	});

	it('still counts the word ids in bytes that will not parse', () => {
		// A truncated write is the commonest corruption there is, and its keys are all still
		// in the string. Refusing to count them is what let a one-word backup outrank it.
		const w: Record<string, number[]> = {};
		for (let i = 1; i <= 40; i += 1) w[`L1-${String(i).padStart(4, '0')}`] = [3, 2, 1, NOW, 0];
		const truncated = JSON.stringify({ v: 1, w, l: {} }).slice(0, -30);

		expect(weigh(truncated)).toMatchObject({ words: 40, readable: false });
	});

	it('does not let junk ids inflate the count', () => {
		expect(weigh('{"v":1,"w":{"L1-9000":[1,1,1,1,1],"L9-0001":[1,1,1,1,1]},"l":{}}').words).toBe(0);
	});

	it('measures the bytes, not what a reset generation left of them', () => {
		// The shape that emptied the key in silence: 40 records still in the string, all of
		// them outranked by the counter, so the decoded view is nothing at all.
		const w: Record<string, number[]> = {};
		for (let i = 1; i <= 40; i += 1) w[`L1-${String(i).padStart(4, '0')}`] = [3, 2, 1, NOW, 0];
		const text = JSON.stringify({ v: 1, w, l: {}, g: { 0: 4 } });

		expect(decodeStored(text, NOW)?.state.byWord).toEqual({});
		expect(weigh(text).words).toBe(40);
	});
});

describe('heavier and shrinks', () => {
	const heft = (words: number, answers = 0, readable = true, size = 100) => ({
		words,
		answers,
		readable,
		size
	});

	it('prefers more words, then more answers, then bytes that read', () => {
		expect(heavier(heft(5), heft(4))).toBe(true);
		expect(heavier(heft(4), heft(5))).toBe(false);
		expect(heavier(heft(4, 9), heft(4, 8))).toBe(true);
		expect(heavier(heft(4, 8, true), heft(4, 8, false))).toBe(true);
	});

	it('gives a tie to the copy already kept', () => {
		expect(heavier(heft(4, 8), heft(4, 8))).toBe(false);
	});

	it('calls a write a shrink only when history actually goes', () => {
		expect(shrinks(heft(10, 30), heft(9, 30))).toBe(true);
		expect(shrinks(heft(10, 30), heft(10, 29))).toBe(true);
		expect(shrinks(heft(10, 30), heft(10, 31))).toBe(false);
		// A shorter encoding of the same history is not a loss.
		expect(shrinks(heft(10, 30, true, 900), heft(10, 30, true, 400))).toBe(false);
	});
});

describe('levelOfId', () => {
	it('reads the level out of a word id', () => {
		expect(levelOfId('L1-0001')).toBe(1);
		expect(levelOfId('L5-1071')).toBe(5);
	});

	it('returns null for ids outside the shape', () => {
		expect(levelOfId('L9-0001')).toBeNull();
		expect(levelOfId('0001')).toBeNull();
		expect(levelOfId('')).toBeNull();
	});
});
