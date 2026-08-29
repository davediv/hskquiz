/**
 * Synthetic vocabulary for the session tests.
 *
 * Deliberately not the shipped HSK JSON: that file belongs to the data layer and changes
 * shape while it is being built, and a scheduling test that breaks because a gloss was
 * reworded is a bad test. What these fixtures do reproduce is the *pathologies* of the real
 * list — repeated hanzi, words that share a gloss, entries with no part of speech, entries
 * with no meaning at all, and a spread of headword and gloss lengths — because those are
 * what the picker has to survive.
 */

import type { Level, ProgressState, Syllable, Word, WordProgress } from '../types';

const POS_CYCLE: string[][] = [['N'], ['V'], ['Adj'], ['Adv'], [], ['V', 'N'], ['N'], ['V'], []];

const GLOSS_CYCLE = [
	(n: number) => [`object ${n}`],
	(n: number) => [`to act ${n}`, `to do ${n}`],
	(n: number) => [`quality ${n}; trait ${n}`],
	(n: number) => [`a long winded description of concept number ${n} and its several uses`],
	(n: number) => [`to move ${n}`]
];

/** Distinct CJK code points, so two fixture words never collide by accident. */
function hanziFor(index: number, length: number): string {
	let out = '';
	for (let i = 0; i < length; i++) out += String.fromCodePoint(0x4e00 + index * 3 + i);
	return out;
}

/**
 * One syllable per character, like the real list. Every fixture syllable is neutral tone: a
 * fixture `py` carries no diacritic, and `tone` must never contradict what `py` prints.
 */
function syllablesFor(index: number, length: number): Syllable[] {
	return Array.from({ length }, (_, i) => ({ py: `pin${index}${i}`, tone: 0 }) as Syllable);
}

/**
 * A level of `count` synthetic words.
 *
 * Injected on purpose: every 17th word repeats the previous word's hanzi with a different
 * gloss (homographs), every 13th repeats the previous word's gloss under a different hanzi
 * (synonyms), and every 23rd has no gloss at all (the real list has 134 such entries).
 */
export function makeLevel(level: Level, count: number): Word[] {
	const words: Word[] = [];
	for (let n = 0; n < count; n++) {
		const syllables = syllablesFor(n, 1 + (n % 3));
		const word: Word = {
			id: `L${level}-${String(n + 1).padStart(4, '0')}`,
			hanzi: hanziFor(n, 1 + (n % 3)),
			pinyin: syllables.map((syllable) => syllable.py).join(' '),
			syllables,
			meanings: GLOSS_CYCLE[n % GLOSS_CYCLE.length](n),
			pos: POS_CYCLE[n % POS_CYCLE.length],
			level
		};
		if (n > 0 && n % 17 === 0) word.hanzi = words[n - 1].hanzi;
		if (n > 0 && n % 13 === 0) word.meanings = words[n - 1].meanings.slice();
		if (n > 0 && n % 23 === 0) word.meanings = [];
		words.push(word);
	}
	return words;
}

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

/** A progress record with sane defaults; override only what a test cares about. */
export function record(wordId: string, over: Partial<WordProgress> = {}): WordProgress {
	return {
		wordId,
		seen: 1,
		correct: 1,
		streak: 1,
		lastSeen: 0,
		lastMissed: 0,
		...over
	};
}

/** Answered correctly `n` times running, most recently `ago` ms before `now`. */
export function mastered(wordId: string, now: number, ago = HOUR, n = 3): WordProgress {
	return record(wordId, { seen: n, correct: n, streak: n, lastSeen: now - ago });
}

/** Missed `misses` of `seen`, most recently `ago` ms before `now`. */
export function shaky(wordId: string, now: number, ago = HOUR, seen = 4, misses = 3): WordProgress {
	return record(wordId, {
		seen,
		correct: seen - misses,
		streak: 0,
		lastSeen: now - ago,
		lastMissed: now - ago
	});
}

export function progressState(records: readonly WordProgress[]): ProgressState {
	const byWord: Record<string, WordProgress> = {};
	for (const entry of records) byWord[entry.wordId] = entry;
	return { version: 1, byWord, levels: {} };
}
