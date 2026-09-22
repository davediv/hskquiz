/**
 * Pure helpers behind the quiz screen.
 *
 * Everything here is a function of a `Session`, a `Question` or a `Word` — no state, no DOM —
 * so the screen itself stays a thin layer of markup over the session engine.
 */

import { type Direction, type Level, type Question, type Session, type Word } from '$lib/types';
import { parseLevelSegment } from '$lib/levels/route';
import { isCorrect, isScored } from '$lib/session';

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

/**
 * How one question reads on the progress rail.
 *
 * `taught` is a card that was shown and not asked. It needs its own mark because the two it
 * would otherwise borrow are both false: it is not `todo` — the learner has dealt with it and
 * it will never come back this run — and it is not `correct`, because nothing was answered.
 */
export type Mark = 'correct' | 'wrong' | 'taught' | 'current' | 'todo';

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
		if (i === session.index) return 'current';
		// Behind the cursor with no answer: a teach card, which is done rather than skipped.
		return i < session.index && !isScored(question) ? 'taught' : 'todo';
	});
}

/**
 * Step on the hanzi scale for the headword, for the surfaces that set a headword from a fixed
 * step. (The quiz prompt itself no longer calls this: it sizes its hero character against the
 * space the layout actually left it — see `QuestionPrompt.svelte`.)
 *
 * The official list tops out at four characters (不好意思, 公共汽车), and a fixed size would
 * either wrap those or waste two thirds of the line on 八. So the size is a function of how
 * many characters have to fit, and it must never step *up* as characters are added.
 *
 * The steps are `<Hanzi>`'s own, and only those: the hanzi ramp was cut to five rungs
 * (`--text-hanzi-xl`, `-2xl` and `-prompt` were deleted as tokens nothing declared), so this
 * returns `hero` for one or two characters and `lg` — a flat 48px, which fits four glyphs in
 * the narrowest card the app draws — for anything longer. `md` is the floor for a string
 * longer than the list can hold.
 */
export type HeadwordSize = 'md' | 'lg' | 'hero';

export function headwordSize(hanzi: string): HeadwordSize {
	const chars = [...hanzi].length;
	if (chars <= 2) return 'hero';
	if (chars <= 4) return 'lg';
	return 'md';
}

/** One run of an example sentence: the word being asked about, or everything around it. */
export interface SentencePart {
	text: string;
	/** True for the run that IS the headword — bolded on a teach card, blanked on a question. */
	hit: boolean;
}

/** An example sentence split around its own headword. */
export interface SplitSentence {
	/** The sentence's hanzi as before / headword / after, empty runs dropped. */
	parts: SentencePart[];
	/** Characters in the sentence, punctuation included: the divisor its type is set by. */
	chars: number;
}

/**
 * An example sentence cut into the headword and its surroundings.
 *
 * This is what lets a teach card bold 早上 inside 早上我喝一杯牛奶。the way Pleco bolds 几乎 in
 * its examples, and what lets a production question blank it out instead — which is the whole
 * reason it returns runs rather than a string.
 *
 * The build guarantees every sentence contains its own word, and all 4,308 shipped ones do; a
 * card that ever stopped clearing that gate comes back as a single un-hit run, so the caller
 * prints a plain sentence rather than blanking the wrong half of it.
 */
export function splitExample(sentence: string, hanzi: string): SplitSentence {
	const chars = [...sentence];
	const target = [...hanzi];
	const whole: SplitSentence = { parts: [{ text: sentence, hit: false }], chars: chars.length };
	if (target.length === 0) return whole;

	let at = -1;
	for (let i = 0; i + target.length <= chars.length; i++) {
		if (target.every((glyph, j) => chars[i + j] === glyph)) {
			at = i;
			break;
		}
	}
	if (at < 0) return whole;

	const parts = [
		{ text: chars.slice(0, at).join(''), hit: false },
		{ text: chars.slice(at, at + target.length).join(''), hit: true },
		{ text: chars.slice(at + target.length).join(''), hit: false }
	].filter((part) => part.text !== '');
	return { parts, chars: chars.length };
}

/**
 * How wide a line of English is, in ems of its own font size.
 *
 * WHY NOT `gloss.length`. The meaning used to step down a three-rung scale on character count
 * (>62 small, >42 base), and the count is not what decides whether it wraps — the rendered
 * width is. 口's `mouth · measure word for family members` is 39 characters, so it stayed at
 * 18px, measured wider than the column, wrapped to two lines and took 24px out of the `1fr`
 * hero row above it; 正's *longer* 44-character gloss stepped down to 16px and stayed on one
 * line and kept its character 25px bigger. The character was being sized by the length of its
 * English definition, and length is a bad proxy: `i` is 0.22em and `W` is 0.94em.
 *
 * So this returns a width, and the stylesheet divides the column by it to get the largest size
 * that fits on one line, clamped to the scale — for the revealed meaning (`96cqw / em`), for
 * the English hero it is the question in the other direction, and for the clue's translation.
 * The table is measured, not guessed: every glyph in the 4,308 shipped glosses was rendered in
 * the app's own `--font-sans` at weight 550 and measured off the DOM, and the outliers below
 * are those numbers. (Not `canvas.measureText`: the canvas resolves the same font stack ~6%
 * narrow at this weight, and a narrow estimate is exactly the failure this function exists to
 * prevent — 想's gloss came out 20.3em against a real 21.1 and wrapped anyway.) The two
 * defaults are deliberately the wide end of their class, so the estimate lands over the truth
 * rather than under: checked against all 4,308 rendered strings, rendered/estimate tops out at
 * 0.995.
 */
const GLOSS_EM: Record<string, number> = {
	' ': 0.26,
	'·': 0.23,
	'.': 0.23,
	',': 0.23,
	':': 0.23,
	"'": 0.27,
	'!': 0.29,
	'(': 0.35,
	')': 0.35,
	'-': 0.44,
	'?': 0.51,
	i: 0.22,
	j: 0.22,
	l: 0.22,
	I: 0.24,
	t: 0.33,
	f: 0.33,
	r: 0.34,
	w: 0.75,
	m: 0.83,
	M: 0.85,
	W: 0.94
};

/** Estimated width of one line of English, in ems. Never zero — it is used as a divisor. */
export function glossEm(gloss: string): number {
	let em = 0;
	for (const ch of gloss.trim()) {
		const known = GLOSS_EM[ch];
		if (known !== undefined) em += known;
		else if (ch >= 'A' && ch <= 'Z') em += 0.74;
		else if (ch >= '0' && ch <= '9') em += 0.63;
		else em += 0.58;
	}
	return Math.max(em, 1);
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
export function promptLabel(kind: Direction | 'introduce'): string {
	if (kind === 'introduce') return 'New word';
	return kind === 'hanzi-to-meaning' ? 'Pick the meaning' : 'Pick the character';
}

/**
 * The level in a `/quiz/[level]` URL, or `null` when that segment names no level this app
 * ships. `/quiz/9`, `/quiz/banana` and `/quiz/` all land on `null` rather than throwing, so
 * the route can render a way out instead of an error.
 */
export function parseLevel(segment: string | null | undefined): Level | null {
	return parseLevelSegment(segment);
}

/**
 * What a screen reader should hear when a teach card arrives.
 *
 * A card that asks nothing has no verdict to announce, and silence would leave the whole point
 * of the card — the word — off the only channel a screen-reader user has.
 */
export function introductionAnnouncement(question: Question): string {
	const word = question.word;
	const record = `New word. ${word.hanzi}, ${word.pinyin}, ${fullGloss(word)}`;
	// The sentence's own hanzi is on screen with `lang="zh-Hans"` on it, where a screen reader
	// reaches for a Chinese voice; announcing it here would hand the same characters to an
	// English one. The translation is the part this channel can carry.
	return word.example ? `${record}. Example: ${word.example.english}` : record;
}

/** What a screen reader should hear the moment an answer lands. */
export function verdictAnnouncement(question: Question, picked: Word | null): string {
	const word = question.word;
	const record = `${word.hanzi}, ${word.pinyin}, ${fullGloss(word)}`;
	return isCorrect(question, picked) ? `Correct. ${record}` : `Not quite. The answer is ${record}`;
}
