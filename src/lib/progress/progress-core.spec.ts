import { describe, expect, it } from 'vitest';
import {
	SCHEMA_VERSION,
	type StoredProgress,
	applyAnswer,
	blankWord,
	decode,
	decodeStored,
	emptyState,
	emptyStored,
	encode,
	isShippableWordId,
	isUsableWordId,
	levelOfId,
	mergeProgress
} from './progress-core.ts';
import type { WordProgress } from '$lib/types';

/** A clock inside the decoder's plausibility window, and stamps around it. */
const NOW = 1_787_000_000_000;
const EARLIER = NOW - 86_400_000;

function stored(
	words: Record<string, Partial<WordProgress>>,
	cleared: Record<number, number> = {}
): StoredProgress {
	const payload = emptyStored();
	for (const [wordId, fields] of Object.entries(words)) {
		payload.state.byWord[wordId] = { ...blankWord(wordId), ...fields };
	}
	payload.cleared = { ...cleared };
	return payload;
}

describe('applyAnswer', () => {
	it('counts a correct answer and extends the streak', () => {
		const record = blankWord('L1-0001');

		applyAnswer(record, true, 1000);
		applyAnswer(record, true, 2000);

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
		applyAnswer(record, true, 1000);
		applyAnswer(record, true, 2000);
		applyAnswer(record, true, 3000);
		expect(record.streak).toBe(3);

		applyAnswer(record, false, 4000);

		expect(record.streak).toBe(0);
		expect(record.correct).toBe(3);
		expect(record.seen).toBe(4);
		expect(record.lastSeen).toBe(4000);
		expect(record.lastMissed).toBe(4000);

		applyAnswer(record, true, 5000);
		expect(record.streak).toBe(1);
		expect(record.lastMissed).toBe(4000);
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

		const decoded = decode(encode(state), NOW);

		expect(decoded).toEqual(state);
	});

	it('round-trips tombstones alongside the state', () => {
		const payload = stored({ 'L1-0001': { seen: 1, correct: 1, lastSeen: NOW } }, { 3: EARLIER });

		const decoded = decodeStored(encode(payload.state, payload.cleared), NOW);

		expect(decoded?.cleared).toEqual({ 3: EARLIER });
		expect(decoded?.state.byWord['L1-0001']?.seen).toBe(1);
	});

	it('leaves the tombstone field out entirely when nothing was ever reset', () => {
		const state = emptyState();
		state.byWord['L1-0001'] = { ...blankWord('L1-0001'), seen: 1, correct: 1, lastSeen: NOW };

		expect(JSON.parse(encode(state))).toEqual({
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

		expect(JSON.parse(encode(state))).toEqual({
			v: SCHEMA_VERSION,
			w: { 'L1-0001': [5, 4, 2, NOW, EARLIER] },
			l: {}
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

		expect(encode(a)).toBe(encode(b));
	});

	it('drops records for words that were never actually answered', () => {
		const state = emptyState();
		state.byWord['L1-0001'] = blankWord('L1-0001');

		expect(JSON.parse(encode(state)).w).toEqual({});
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

		// Nothing was ever answered here, whatever else the tuple claims.
		expect(decoded?.byWord['L1-0001']).toBeUndefined();
		expect(decoded?.byWord['L1-0002']?.seen).toBe(9);
		expect(decoded?.byWord['L1-0003']).toBeUndefined();
		expect(decoded?.byWord['L1-0004']).toBeUndefined();
		// Only real levels survive.
		expect(Object.keys(decoded?.levels ?? {})).toEqual(['1']);
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

	it('applies a tombstone it finds in the payload', () => {
		const payload = JSON.stringify({
			v: 1,
			w: { 'L1-0001': [1, 1, 1, EARLIER, 0], 'L1-0002': [1, 1, 1, NOW, 0] },
			l: { '1': [4, EARLIER] },
			c: { '0': EARLIER + 1000 }
		});

		const decoded = decodeStored(payload, NOW);

		expect(Object.keys(decoded?.state.byWord ?? {})).toEqual(['L1-0002']);
		expect(decoded?.state.levels[1]).toBeUndefined();
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

	it('lets a tombstone erase what the other side still holds', () => {
		const mine = emptyStored();
		mine.cleared = { 0: NOW };
		const theirs = stored({ 'L1-0001': { seen: 9, correct: 9, streak: 9, lastSeen: EARLIER } });

		const merged = mergeProgress(emptyStored(), mine, theirs);

		expect(merged.state.byWord).toEqual({});
		expect(merged.cleared).toEqual({ 0: NOW });
	});

	it('scopes a level tombstone to that level', () => {
		const mine = emptyStored();
		mine.cleared = { 2: NOW };
		const theirs = stored({
			'L1-0001': { seen: 1, correct: 1, streak: 1, lastSeen: EARLIER },
			'L2-0001': { seen: 1, correct: 1, streak: 1, lastSeen: EARLIER }
		});

		const merged = mergeProgress(emptyStored(), mine, theirs);

		expect(Object.keys(merged.state.byWord)).toEqual(['L1-0001']);
	});

	it('does not let a tombstone erase an answer given after it', () => {
		const mine = stored({ 'L1-0007': { seen: 1, correct: 1, streak: 1, lastSeen: NOW + 5 } });
		mine.cleared = { 0: NOW };

		const merged = mergeProgress(emptyStored(), mine, emptyStored());

		expect(merged.state.byWord['L1-0007']?.seen).toBe(1);
	});

	it('takes the later of two tombstones for the same scope', () => {
		const mine = emptyStored();
		mine.cleared = { 0: EARLIER };
		const theirs = emptyStored();
		theirs.cleared = { 0: NOW };

		expect(mergeProgress(emptyStored(), mine, theirs).cleared).toEqual({ 0: NOW });
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
