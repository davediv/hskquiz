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
	/**
	 * Every official id this one card answers for, when two rows of the standard merged into it.
	 *
	 * Eight same-pinyin homograph pairs ship as one card each (老, 省, 把 …), so `id` alone does
	 * not account for the official row it absorbed. Present only on those eight; `id` is always
	 * the first entry. Progress is still keyed on `id` — this is provenance, not a second key.
	 */
	ids?: string[];
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
	/**
	 * Meanings grouped with the part of speech that labels each one.
	 *
	 * `pos` is a card-level list of advertised codes and `meanings` is the quiz-facing
	 * gloss list; neither says which label belongs to which gloss. `senses` is that
	 * pairing, in display order. Cards with no supported POS omit `pos` on each sense
	 * and stay chip-less. Quiz code keeps reading `meanings`.
	 */
	senses?: Sense[];
	/** One sentence showing the word in use. Absent where none has been authored yet. */
	example?: Example;
	/** Supported part-of-speech codes: N V Adj Adv Pron Num M Prep Conj Aux Int Prefix Suffix Phonetic. */
	pos: string[];
	level: Level;
}

/** One gloss bound to the part of speech that labels it. */
export interface Sense {
	/** Official POS code when the list gives one; omitted on untagged cards. */
	pos?: string;
	/** Learner-facing English for this sense alone. */
	gloss: string;
}

/**
 * One example sentence for a word.
 *
 * Both reference apps spend their entry screen on the word in context, because a gloss alone
 * does not tell a learner how a word is used. Sentences are authored against the word's own HSK
 * level and gated at build time: every character in `hanzi` must itself sit at or below that
 * level, so an HSK 1 card can never be explained with an HSK 5 character.
 */
export interface Example {
	/** The sentence in simplified hanzi, including its full-width punctuation. */
	hanzi: string;
	/** Tone-marked pinyin, syllable-spaced, matching `hanzi`. */
	pinyin: string;
	/** Natural English translation — not a gloss-by-gloss crib. */
	english: string;
}

/** Which way a question runs. */
export type Direction = 'hanzi-to-meaning' | 'meaning-to-hanzi';

/**
 * Per-word learning record, persisted to localStorage.
 *
 * `seen` counts ANSWERS, not appearances. A word's first card teaches it and asks nothing, and
 * that card stamps `lastSeen` alone — so `seen === 0 && lastSeen > 0` is one exposure and no
 * answer, a shape `applyAnswer` can never produce because it always bumps the two together.
 * `src/lib/session/record.ts` is the one place that reading lives.
 */
export interface WordProgress {
	wordId: string;
	/** Answers given. An introduction is not an answer, so it does not appear here. */
	seen: number;
	correct: number;
	/** Consecutive correct answers; resets to 0 on a miss. */
	streak: number;
	/** Epoch ms of the last time the word was shown — answered or merely introduced. */
	lastSeen: number;
	/** Epoch ms of the last incorrect answer, or 0 if never missed. */
	lastMissed: number;
	/**
	 * The reset generation this record was written under; absent means 0.
	 *
	 * Owned by `src/lib/progress/progress-core.ts`, which is the only thing that reads or
	 * writes it — but it is declared here because it rides inside the record through every
	 * spread, merge, `$state` proxy and JSON round trip, and a reader of this file should be
	 * able to see that it exists. Left off the object entirely at 0, so a learner who has never
	 * reset stores byte-identical bytes to a build that predates generations.
	 */
	gen?: number;
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
	/** Per-level session counters, for the level-select screen. `gen` as on `WordProgress`. */
	levels: Partial<Record<Level, { sessions: number; lastPlayed: number; gen?: number }>>;
}
