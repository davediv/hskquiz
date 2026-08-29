/**
 * Shared contracts. Every piece of the app codes against these types, never against
 * another piece's implementation. Owned by the orchestrator — a builder that needs a
 * change here says so in its report rather than editing the file.
 */

/** HSK 3.0 levels this app covers. */
export type Level = 1 | 2 | 3 | 4 | 5;
export const LEVELS: readonly Level[] = [1, 2, 3, 4, 5];

/** Official word counts per level, from 《国际中文教育中文水平等级标准》 (GF 0025-2021). */
export const LEVEL_SIZES: Record<Level, number> = { 1: 500, 2: 772, 3: 973, 4: 1000, 5: 1071 };

/**
 * One syllable of a word's pinyin, aligned 1:1 with a character of its hanzi.
 *
 * Tone is carried as data rather than inferred from the diacritic at render time: neutral tone
 * has no diacritic at all, so a renderer that guesses cannot tell `ba` (neutral) from a parse
 * failure. The build reads the tone numbers out of the reference row's CEDICT key
 * (`爸爸|爸爸[ba4 ba5]`) and fails loudly when the syllable count and character count disagree.
 */
export interface Syllable {
	/** Tone-marked pinyin for this syllable alone, e.g. `bà`. */
	py: string;
	/** 1–4, or 0 for the neutral tone. */
	tone: 0 | 1 | 2 | 3 | 4;
}

/** One vocabulary entry. Hanzi, pinyin and level are authoritative — see reference/hsk. */
export interface Word {
	/** Stable key, e.g. `L1-0001`. Progress is keyed on this. */
	id: string;
	/** Simplified hanzi, cleaned for display — never the raw `爸爸|爸` source notation. */
	hanzi: string;
	/** Traditional form, if it differs from `hanzi`. */
	traditional?: string;
	/** Tone-marked pinyin as the official HSK list prints it, e.g. `bāng máng`. */
	pinyin: string;
	/** `pinyin` split per character, so every syllable can be tone-coloured and searched. */
	syllables: Syllable[];
	/** Short learner-facing English meanings, best first. 1–3 entries, each a few words. */
	meanings: string[];
	/** Part-of-speech codes: N V Adj Adv Pron Num M Prep Conj Aux Int Prefix Suffix Phonetic. */
	pos: string[];
	level: Level;
}

/** Which way a question runs. */
export type Direction = 'hanzi-to-meaning' | 'meaning-to-hanzi';

/** Per-word learning record, persisted to localStorage. */
export interface WordProgress {
	wordId: string;
	seen: number;
	correct: number;
	/** Consecutive correct answers; resets to 0 on a miss. */
	streak: number;
	/** Epoch ms of the last answer, or 0 if never answered. */
	lastSeen: number;
	/** Epoch ms of the last incorrect answer, or 0 if never missed. */
	lastMissed: number;
}

/** One question in a session. */
export interface Question {
	word: Word;
	direction: Direction;
	/** The correct choice plus distractors, already shuffled. */
	choices: Word[];
}

/** A ~10-question practice run. */
export interface Session {
	level: Level;
	questions: Question[];
	/** Index of the question being answered. */
	index: number;
	/** `answers[i]` is the word the learner picked for `questions[i]`, or null if skipped. */
	answers: (Word | null)[];
}

/** Everything the app persists, under a single localStorage key. */
export interface ProgressState {
	version: number;
	byWord: Record<string, WordProgress>;
	/** Per-level session counters, for the level-select screen. */
	levels: Partial<Record<Level, { sessions: number; lastPlayed: number }>>;
}
