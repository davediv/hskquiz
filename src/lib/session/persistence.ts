import { LEVELS, type Direction, type Level, type Session, type Word } from '../types';
import { cardKind, SESSION_SIZE, type BuiltSession, type CardKind } from './index';

const PREFIX = 'hskquiz:quiz:session:v1:';
const VERSION = 1;

interface StoredQuestion {
	wordId: string;
	kind: CardKind;
	direction: Direction;
	choiceIds: string[];
}

interface StoredSession {
	version: number;
	level: Level;
	pin: string | null;
	index: number;
	questions: StoredQuestion[];
	answers: (string | null)[];
}

type SessionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function key(level: Level): string {
	return `${PREFIX}${level}`;
}

/** A browser may expose sessionStorage but throw when it is accessed. */
export function availableSessionStorage(): SessionStorage | null {
	try {
		return typeof window === 'undefined' ? null : window.sessionStorage;
	} catch {
		return null;
	}
}

/** Store IDs only; the loaded vocabulary remains the source of word content. */
export function saveSession(
	storage: SessionStorage | null,
	session: Session,
	pin: string | null
): void {
	if (!storage) return;
	const snapshot: StoredSession = {
		version: VERSION,
		level: session.level,
		pin,
		index: session.index,
		questions: session.questions.map((question) => ({
			wordId: question.word.id,
			kind: cardKind(question),
			direction: question.direction,
			choiceIds: question.choices.map((choice) => choice.id)
		})),
		answers: session.answers.map((answer) => answer?.id ?? null)
	};
	try {
		storage.setItem(key(session.level), JSON.stringify(snapshot));
	} catch {
		// A blocked or full storage area does not prevent practice in this tab.
	}
}

/** Discard stale or malformed snapshots instead of rendering a partial question. */
export function restoreSession(
	storage: SessionStorage | null,
	level: Level,
	words: readonly Word[],
	pin: string | null
): BuiltSession | null {
	if (!storage) return null;
	let raw: string | null;
	try {
		raw = storage.getItem(key(level));
	} catch {
		return null;
	}
	if (raw === null) return null;

	try {
		const saved: unknown = JSON.parse(raw);
		if (
			!isRecord(saved) ||
			saved.version !== VERSION ||
			saved.level !== level ||
			saved.pin !== pin
		) {
			return null;
		}
		const entries = saved.questions;
		const answers = saved.answers;
		if (
			!Array.isArray(entries) ||
			entries.length < 1 ||
			entries.length > SESSION_SIZE ||
			!Array.isArray(answers) ||
			answers.length !== entries.length ||
			!Number.isInteger(saved.index) ||
			(saved.index as number) < 0 ||
			(saved.index as number) > entries.length
		) {
			return null;
		}

		const byId = new Map(
			words.filter((word) => word.level === level).map((word) => [word.id, word])
		);
		const questions: BuiltSession['questions'] = [];
		const restoredAnswers: (Word | null)[] = [];
		for (let i = 0; i < entries.length; i++) {
			const entry: unknown = entries[i];
			if (!isRecord(entry) || typeof entry.wordId !== 'string' || !isKind(entry.kind)) {
				return null;
			}
			const direction = entry.direction;
			if (!isDirection(direction) || (entry.kind !== 'introduce' && entry.kind !== direction)) {
				return null;
			}
			if (entry.kind === 'introduce' && direction !== 'hanzi-to-meaning') return null;
			if (!Array.isArray(entry.choiceIds) || entry.choiceIds.length > 4) return null;
			const word = byId.get(entry.wordId);
			if (!word) return null;
			const choiceIds: unknown[] = entry.choiceIds;
			if (choiceIds.some((id) => typeof id !== 'string')) return null;
			if (new Set(choiceIds).size !== choiceIds.length) return null;
			const choices = choiceIds.map((id) => byId.get(id as string));
			if (choices.some((choice) => !choice)) return null;
			if (entry.kind !== 'introduce' && !choiceIds.includes(word.id)) return null;
			const answerId: unknown = answers[i];
			if (answerId !== null && (typeof answerId !== 'string' || !choiceIds.includes(answerId))) {
				return null;
			}
			if (entry.kind === 'introduce' && answerId !== null) return null;
			if (i < (saved.index as number) && entry.kind !== 'introduce' && answerId === null) {
				return null;
			}
			if (i > (saved.index as number) && answerId !== null) return null;
			questions.push({ word, kind: entry.kind, direction, choices: choices as Word[] });
			restoredAnswers.push(answerId === null ? null : (byId.get(answerId as string) ?? null));
		}
		return { level, questions, index: saved.index as number, answers: restoredAnswers };
	} catch {
		return null;
	}
}

export function clearSession(storage: SessionStorage | null, level: Level): void {
	if (!storage) return;
	try {
		storage.removeItem(key(level));
	} catch {
		// Session storage is optional.
	}
}

export function clearAllSessions(storage: SessionStorage | null): void {
	for (const level of LEVELS) clearSession(storage, level);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isDirection(value: unknown): value is Direction {
	return value === 'hanzi-to-meaning' || value === 'meaning-to-hanzi';
}

function isKind(value: unknown): value is CardKind {
	return value === 'introduce' || isDirection(value);
}
