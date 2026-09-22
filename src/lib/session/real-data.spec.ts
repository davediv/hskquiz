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
import type { Level, ProgressState, Word, WordProgress } from '../types';
import { buildSession, isCorrect, isScored, mulberry32, readRecord } from './index';
import { sharesSense } from './distractors';
import { senseSet } from '$lib/data/senses';
import { applyAnswer, applySeen, blankWord } from '../progress/progress-core';

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
				// Five words, ten cards: an unmet word brings the card that teaches it and the
				// card that asks it, and nothing appears more often than that.
				const shown = new Map<string, number>();
				for (const question of session.questions) {
					shown.set(question.word.id, (shown.get(question.word.id) ?? 0) + 1);
				}
				expect(shown.size).toBe(5);
				for (const count of shown.values()) expect(count).toBe(2);
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
	}, 15_000);

	it('never offers a contained form of the answer as a wrong answer', () => {
		// 去 "to go" beside 出去 "to go out", and — the half the prefix-only guard used to miss —
		// 半 "half" beside 一半 "one half", 年 "year" beside 半年 "half a year". Same character,
		// and a gloss the learner cannot tell apart from the prompt they were given. 525 such
		// pairs exist inside the five shipped levels; none of them may share a card. Re-derived
		// here rather than imported, so the property is checked and not the implementation
		// restated — and word-aligned, so "ear" inside "early morning" is not a hit.
		const inside = (a: string, b: string) => {
			const [s, l] =
				a.length <= b.length ? [a.split(' '), b.split(' ')] : [b.split(' '), a.split(' ')];
			if (s.length === 0 || s.length >= l.length) return false;
			for (let start = 0; start + s.length <= l.length; start++) {
				if (s.every((token, i) => l[start + i] === token)) return true;
			}
			return false;
		};
		const nested = (a: Word, b: Word) => {
			const chars = new Set([...a.hanzi]);
			if (![...b.hanzi].some((c) => chars.has(c))) return false;
			for (const x of senseSet(a)) for (const y of senseSet(b)) if (inside(x, y)) return true;
			return false;
		};
		let checked = 0;
		for (const [level, words] of levels) {
			for (let seed = 0; seed < 40; seed++) {
				const session = buildSession(words, level, null, 10, {
					rng: mulberry32(seed * 31 + level),
					now: NOW
				});
				for (const question of session.questions) {
					for (const choice of question.choices) {
						if (choice.id === question.word.id) continue;
						checked++;
						expect(nested(question.word, choice)).toBe(false);
					}
				}
			}
		}
		expect(checked).toBeGreaterThan(5000);
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

const DAY = 24 * 60 * 60 * 1000;

function median(values: number[]): number {
	if (values.length === 0) return Number.NaN;
	const sorted = values.slice().sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Drive `buildSession` + the real `applyAnswer`/`applySeen` writers for `days` daily runs
 * on one level. `abandonEvery` of 5 means every fifth run stops after four cards.
 */
function playLevel(
	words: readonly Word[],
	level: Level,
	days: number,
	accuracy: number,
	seed: number,
	abandonEvery = 0
) {
	const rng = mulberry32(seed);
	const byWord: Record<string, WordProgress> = {};
	const answerAt = new Map<string, number[]>();
	const introCounts: number[] = [];
	for (let day = 0; day < days; day++) {
		const at = NOW + day * DAY;
		const saved: ProgressState = { version: 1, byWord, levels: {} };
		const built = buildSession(words, level, saved, 10, { rng, now: at });
		const stop = abandonEvery > 0 && (day + 1) % abandonEvery === 0 ? 4 : built.questions.length;
		let intros = 0;
		for (let i = 0; i < stop; i++) {
			const question = built.questions[i];
			const rec = (byWord[question.word.id] ??= blankWord(question.word.id));
			if (!isScored(question)) {
				applySeen(rec, at, 0);
				intros++;
				continue;
			}
			applyAnswer(rec, rng() < accuracy, at, 0);
			const times = answerAt.get(question.word.id) ?? [];
			times.push(at);
			answerAt.set(question.word.id, times);
		}
		introCounts.push(intros);
	}
	const end = NOW + (days - 1) * DAY;
	const records = Object.values(byWord).map((raw) => readRecord(raw));
	const met = records.filter((facts) => facts.met);
	const answered = records.filter((facts) => facts.answers > 0);
	const gaps: number[] = [];
	for (const times of answerAt.values()) {
		for (let i = 1; i < times.length; i++) gaps.push((times[i] - times[i - 1]) / DAY);
	}
	return {
		introCounts,
		met: met.length,
		once: answered.filter((facts) => facts.answers === 1).length,
		stale30: answered.filter((facts) => facts.lastSeen <= end - 30 * DAY).length,
		streak3: records.filter((facts) => facts.streak >= 3).length,
		medianGap: median(gaps),
		taughtOnly: records.filter((facts) => facts.taughtOnly).length
	};
}

describe.skipIf(!available)('a learner over 120 daily HSK 1 sessions', () => {
	const words = available ? readLevel(1) : [];

	it('keeps introduced words in active review at 75% accuracy', () => {
		const run = playLevel(words, 1, 120, 0.75, 7);
		const snapshot = `met=${run.met} once=${run.once} stale30=${run.stale30} streak3=${run.streak3} gap=${run.medianGap} owed=${run.taughtOnly} intros=${run.introCounts.slice(0, 20).join(',')}`;
		expect(run.taughtOnly, snapshot).toBe(0);
		expect(run.once, snapshot).toBeLessThan(40);
		expect(run.stale30, snapshot).toBeLessThan(60);
		// A fixed count of 150 would require introducing more words than the due backlog can
		// support. Check how many of the words met have reached a three-answer streak instead.
		expect(run.streak3, snapshot).toBeGreaterThan(90);
		expect(run.streak3 / run.met, snapshot).toBeGreaterThan(0.7);
		expect(run.medianGap, snapshot).toBeLessThan(5);
	});

	it('does not leave abandoned introductions unasked', () => {
		// One run in five stops after four cards. The review draw takes taught-only words
		// first, so they cannot sit at weight 1.0 behind a miss at 12 for the rest of the
		// profile. Loop 6 left 27 of them; this has to stay far under that.
		const run = playLevel(words, 1, 150, 0.75, 11, 5);
		expect(run.taughtOnly).toBeLessThan(8);
	});
});
