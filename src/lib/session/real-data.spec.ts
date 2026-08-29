/**
 * A smoke test against the vocabulary the app actually ships.
 *
 * The rest of the suite runs on synthetic fixtures so scheduling tests don't break when a
 * gloss is reworded. This file exists because the real list has shapes no fixture would
 * think to invent — 85 repeated hanzi, entries with no part of speech, glosses of wildly
 * different lengths — and the picker has to survive all of them.
 *
 * It reads the JSON off disk rather than importing it, and skips itself if the data layer
 * has not landed yet or has moved: an absent word list is the data layer's problem to
 * report, not a session-engine failure.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Level, Word } from '../types';
import { buildSession, isCorrect, mulberry32 } from './index';
import { sharesSense } from './distractors';

const NOW = 1_700_000_000_000;
const LEVELS: Level[] = [1, 2, 3, 4, 5];

function pathFor(level: Level): string {
	return fileURLToPath(new URL(`../data/hsk${level}.json`, import.meta.url));
}

function readLevel(level: Level): Word[] {
	const parsed: unknown = JSON.parse(readFileSync(pathFor(level), 'utf8'));
	if (!Array.isArray(parsed)) return [];
	return parsed as Word[];
}

function looksLikeAWord(value: unknown): boolean {
	if (typeof value !== 'object' || value === null) return false;
	const word = value as Partial<Word>;
	return (
		typeof word.id === 'string' && typeof word.hanzi === 'string' && Array.isArray(word.meanings)
	);
}

const available = LEVELS.every((level) => {
	if (!existsSync(pathFor(level))) return false;
	try {
		const words = readLevel(level);
		return words.length > 100 && looksLikeAWord(words[0]);
	} catch {
		return false;
	}
});

describe.skipIf(!available)('buildSession against the shipped HSK list', () => {
	const levels = available ? LEVELS.map((level) => [level, readLevel(level)] as const) : [];

	it('fills a ten-question session at every level', () => {
		for (const [level, words] of levels) {
			const session = buildSession(words, level, null, 10, { rng: mulberry32(level), now: NOW });
			expect(session.questions).toHaveLength(10);
		}
	});

	it('never builds a question with two defensible answers, over 60 sessions per level', () => {
		for (const [level, words] of levels) {
			for (let seed = 0; seed < 60; seed++) {
				const session = buildSession(words, level, null, 10, {
					rng: mulberry32(seed),
					now: NOW
				});
				expect(new Set(session.questions.map((q) => q.word.id)).size).toBe(10);
				for (const question of session.questions) {
					expect(question.choices).toHaveLength(4);
					expect(isCorrect(question, question.word)).toBe(true);
					for (let i = 0; i < question.choices.length; i++) {
						for (let j = i + 1; j < question.choices.length; j++) {
							// 打 appears three times in the official list; two of them on one
							// card would be a question with no right answer.
							expect(question.choices[i].hanzi).not.toBe(question.choices[j].hanzi);
							expect(sharesSense(question.choices[i], question.choices[j])).toBe(false);
						}
					}
				}
			}
		}
	});

	it('shows a different set of wrong answers each time a word comes round', () => {
		const [, words] = levels[1];
		const seen = new Set<string>();
		for (let seed = 0; seed < 25; seed++) {
			const session = buildSession(words, 2, null, 10, { rng: mulberry32(seed), now: NOW });
			const question = session.questions[0];
			seen.add(
				question.word.id +
					':' +
					question.choices
						.filter((c) => c.id !== question.word.id)
						.map((c) => c.id)
						.sort()
						.join('|')
			);
		}
		expect(seen.size).toBeGreaterThan(20);
	});
});
