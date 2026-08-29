import { describe, expect, it } from 'vitest';
import {
	SCHEMA_VERSION,
	applyAnswer,
	blankWord,
	decode,
	emptyState,
	encode,
	levelOfId
} from './progress-core.ts';

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
			lastSeen: 1756000000000,
			lastMissed: 1755000000000
		};
		state.levels[2] = { sessions: 3, lastPlayed: 1756000000001 };

		const decoded = decode(encode(state));

		expect(decoded).toEqual(state);
	});

	it('stores word records as tuples, not objects', () => {
		const state = emptyState();
		state.byWord['L1-0001'] = {
			wordId: 'L1-0001',
			seen: 5,
			correct: 4,
			streak: 2,
			lastSeen: 10,
			lastMissed: 4
		};

		expect(JSON.parse(encode(state))).toEqual({
			v: SCHEMA_VERSION,
			w: { 'L1-0001': [5, 4, 2, 10, 4] },
			l: {}
		});
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
		const future = JSON.stringify({ v: SCHEMA_VERSION + 1, w: { 'L1-0001': [1, 1, 1, 9, 0] } });

		expect(decode(future)).toBeNull();
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
					lastSeen: 1755000000000,
					lastMissed: 1754000000000
				}
			},
			levels: { '1': { sessions: 2, lastPlayed: 1755000000001 } }
		});

		const decoded = decode(legacy);

		expect(decoded?.byWord['L1-0001']).toEqual({
			wordId: 'L1-0001',
			seen: 4,
			correct: 3,
			streak: 2,
			lastSeen: 1755000000000,
			lastMissed: 1754000000000
		});
		expect(decoded?.levels[1]).toEqual({ sessions: 2, lastPlayed: 1755000000001 });
		expect(decoded?.version).toBe(SCHEMA_VERSION);
	});

	it('sanitises junk fields rather than propagating NaN into the app', () => {
		const junk = JSON.stringify({
			v: 1,
			w: {
				'L1-0001': [-4, 'x', null, 1755000000000, undefined],
				'L1-0002': ['9', '9', '9', '9', '0'],
				'L1-0003': 'not a record',
				'L1-0004': [0, 0, 0, 0, 0]
			},
			l: { '1': [2, 5], '9': [4, 4], banana: [1, 1] }
		});

		const decoded = decode(junk);

		expect(decoded?.byWord['L1-0001']).toEqual({
			wordId: 'L1-0001',
			seen: 0,
			correct: 0,
			streak: 0,
			lastSeen: 1755000000000,
			lastMissed: 0
		});
		expect(decoded?.byWord['L1-0002']?.seen).toBe(9);
		// A non-record, and a record with nothing in it, are both dropped entirely.
		expect(decoded?.byWord['L1-0003']).toBeUndefined();
		expect(decoded?.byWord['L1-0004']).toBeUndefined();
		// Only real levels survive.
		expect(Object.keys(decoded?.levels ?? {})).toEqual(['1']);
	});

	it('clamps correct to seen and streak to correct', () => {
		const impossible = JSON.stringify({ v: 1, w: { 'L1-0001': [2, 99, 99, 10, 0] } });

		expect(decode(impossible)?.byWord['L1-0001']).toEqual({
			wordId: 'L1-0001',
			seen: 2,
			correct: 2,
			streak: 2,
			lastSeen: 10,
			lastMissed: 0
		});
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
