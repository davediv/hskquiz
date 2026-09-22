import { describe, expect, it } from 'vitest';
import { buildSession, mulberry32 } from './index';
import { makeLevel } from './test-fixtures';
import { clearAllSessions, restoreSession, saveSession } from './persistence';

function memoryStorage() {
	const data = new Map<string, string>();
	return {
		getItem: (key: string) => data.get(key) ?? null,
		setItem: (key: string, value: string) => void data.set(key, value),
		removeItem: (key: string) => void data.delete(key),
		data
	};
}

const words = makeLevel(1, 220);

describe('quiz session persistence', () => {
	it('restores the same card order, choices, picked answer, and finished result', () => {
		const storage = memoryStorage();
		const session = buildSession(words, 1, null, 10, { rng: mulberry32(42) });
		const scored = session.questions.findIndex((question) => question.kind !== 'introduce');
		session.index = scored;
		session.answers[scored] = session.questions[scored].choices[1];
		saveSession(storage, session, null);

		const resumed = restoreSession(storage, 1, words, null);
		expect(resumed?.index).toBe(scored);
		expect(resumed?.questions.map((question) => question.word.id)).toEqual(
			session.questions.map((question) => question.word.id)
		);
		expect(
			resumed?.questions.map((question) => question.choices.map((choice) => choice.id))
		).toEqual(session.questions.map((question) => question.choices.map((choice) => choice.id)));
		expect(resumed?.answers[scored]?.id).toBe(session.answers[scored]?.id);

		for (let i = 0; i < session.questions.length; i++) {
			if (session.questions[i].kind !== 'introduce') {
				session.answers[i] = session.questions[i].choices[0];
			}
		}
		session.index = session.questions.length;
		saveSession(storage, session, null);
		expect(restoreSession(storage, 1, words, null)?.index).toBe(session.questions.length);
	});

	it('rejects stale words, malformed answers, and a different pinned word', () => {
		const storage = memoryStorage();
		const session = buildSession(words, 1, null, 10, { rng: mulberry32(7) });
		saveSession(storage, session, 'L1-0001');
		expect(restoreSession(storage, 1, words, 'L1-0002')).toBeNull();
		expect(restoreSession(storage, 1, [], 'L1-0001')).toBeNull();

		const key = [...storage.data.keys()][0];
		const saved = JSON.parse(storage.data.get(key) ?? '{}');
		saved.answers[0] = 'L1-9999';
		storage.setItem(key, JSON.stringify(saved));
		expect(restoreSession(storage, 1, words, 'L1-0001')).toBeNull();
	});

	it('tolerates blocked storage and clears every level on reset', () => {
		const storage = memoryStorage();
		const session = buildSession(words, 1, null, 10, { rng: mulberry32(5) });
		saveSession(storage, session, null);
		clearAllSessions(storage);
		expect(restoreSession(storage, 1, words, null)).toBeNull();
		const blocked = {
			getItem: () => {
				throw new Error('blocked');
			},
			setItem: () => {
				throw new Error('blocked');
			},
			removeItem: () => {
				throw new Error('blocked');
			}
		};
		expect(restoreSession(blocked, 1, words, null)).toBeNull();
		expect(() => saveSession(blocked, session, null)).not.toThrow();
	});
});
