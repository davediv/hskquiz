/**
 * Pure helpers behind the quiz screen.
 *
 * Everything here is a function of a `Session`, a `Question` or a `Word` — no state, no DOM —
 * so the screen itself stays a thin layer of markup over the session engine.
 */

import {
	LEVELS,
	type Direction,
	type Level,
	type Question,
	type Session,
	type Word
} from '$lib/types';
import { isCorrect } from '$lib/session';

/**
 * How one answer button is drawn once the question is closed. `answer` is the right choice
 * when the learner picked something else — it lights up whether or not they touched it.
 */
export type ChoiceStatus = 'idle' | 'chosen-right' | 'chosen-wrong' | 'answer' | 'other';

/** The status of one choice, given the question and what was picked. */
export function choiceStatus(question: Question, choice: Word, picked: Word | null): ChoiceStatus {
	if (picked === null) return 'idle';
	const isPick = picked.id === choice.id;
	const isAnswer = isCorrect(question, choice);
	if (isPick) return isAnswer ? 'chosen-right' : 'chosen-wrong';
	return isAnswer ? 'answer' : 'other';
}

/** How one question reads on the progress rail. */
export type Mark = 'correct' | 'wrong' | 'current' | 'todo';

export interface Tally {
	answered: number;
	correct: number;
	wrong: number;
}

/** Right/wrong counts so far. The rail is decorative; this is the text version of it. */
export function tally(session: Session): Tally {
	let answered = 0;
	let correct = 0;
	for (let i = 0; i < session.questions.length; i++) {
		const picked = session.answers[i] ?? null;
		if (picked === null) continue;
		answered++;
		if (isCorrect(session.questions[i], picked)) correct++;
	}
	return { answered, correct, wrong: answered - correct };
}

/** One mark per question, in order — the whole run at a glance. */
export function marks(session: Session): Mark[] {
	return session.questions.map((question, i) => {
		const picked = session.answers[i] ?? null;
		if (picked !== null) return isCorrect(question, picked) ? 'correct' : 'wrong';
		return i === session.index ? 'current' : 'todo';
	});
}

/**
 * Step on the hanzi scale for the headword.
 *
 * The official list tops out at four characters (不好意思, 公共汽车), and a fixed size would
 * either wrap those or waste two thirds of the line on 八. So the size is a function of how
 * many characters have to fit: one or two get the full hero setting, and it steps down from
 * there so every headword fills the same optical line width without ever wrapping.
 */
export type HeadwordSize = 'lg' | 'xl' | 'prompt' | 'hero';

export function headwordSize(hanzi: string): HeadwordSize {
	const chars = [...hanzi].length;
	if (chars <= 2) return 'hero';
	if (chars === 3) return 'prompt';
	if (chars === 4) return 'xl';
	return 'lg';
}

/** The one gloss that goes on an answer button. Best first, per the data contract. */
export function primaryGloss(word: Word): string {
	return word.meanings[0] ?? word.hanzi;
}

/** Every gloss, for the reveal — where the learner has time to read all of them. */
export function fullGloss(word: Word): string {
	return word.meanings.length > 0 ? word.meanings.join(' · ') : '—';
}

/**
 * Part-of-speech codes spelled out. `Aux` is the official list's code for 助词 — every entry
 * carrying it at these levels is a particle (吧 的 了 吗 呢 着), so that is what it says.
 */
const POS_LABEL: Record<string, string> = {
	N: 'noun',
	V: 'verb',
	Adj: 'adjective',
	Adv: 'adverb',
	Pron: 'pronoun',
	Num: 'number',
	M: 'measure word',
	Prep: 'preposition',
	Conj: 'conjunction',
	Aux: 'particle',
	Intj: 'interjection',
	Prefix: 'prefix',
	Suffix: 'suffix',
	Phonetic: 'phonetic'
};

/** Readable part of speech, or '' when the entry carries none we can name. */
export function posLabel(word: Word): string {
	return word.pos
		.map((code) => POS_LABEL[code] ?? '')
		.filter(Boolean)
		.join(' · ');
}

/** The instruction above the prompt. Short, because it is on screen ten times a session. */
export function promptLabel(direction: Direction): string {
	return direction === 'hanzi-to-meaning' ? 'Pick the meaning' : 'Pick the character';
}

/**
 * The level in a `/quiz/[level]` URL, or `null` when that segment names no level this app
 * ships. `/quiz/9`, `/quiz/banana` and `/quiz/` all land on `null` rather than throwing, so
 * the route can render a way out instead of an error.
 */
export function parseLevel(segment: string | null | undefined): Level | null {
	if (typeof segment !== 'string' || segment.trim() === '') return null;
	const n = Number(segment);
	return LEVELS.find((level) => level === n) ?? null;
}

/** What a screen reader should hear the moment an answer lands. */
export function verdictAnnouncement(question: Question, picked: Word | null): string {
	const word = question.word;
	const record = `${word.hanzi}, ${word.pinyin}, ${fullGloss(word)}`;
	return isCorrect(question, picked) ? `Correct. ${record}` : `Not quite. The answer is ${record}`;
}
