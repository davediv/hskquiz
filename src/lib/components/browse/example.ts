/**
 * The example sentence, cut into the runs the sheet renders.
 *
 * WHY THIS IS NOT JUST `{example.hanzi}`
 * A sentence a learner can read is three lines, not one: the characters, the sound, the
 * meaning. Both references we are measured against print exactly that stack, and both do one
 * more thing on top of it — they mark the headword *inside* the sentence, so the eye lands on
 * the word it opened the entry for before it starts reading. Pleco bolds 几乎 inside
 * 他几乎一夜没睡。 in both the hanzi and the pinyin line. Without that mark a 12-character
 * sentence is a wall the learner has to search.
 *
 * So the sentence is cut into runs at the headword's boundaries: consecutive characters that
 * are all inside the headword, or all outside it. Every occurrence is marked, not just the
 * first — 我爱我的爸爸妈妈 has two 我 and a learner reading the 我 entry wants both.
 *
 * THE PINYIN IS ALIGNED, NOT SEGMENTED
 * `Example.pinyin` ships one space-separated syllable per hanzi character of the sentence, and
 * the build gates that (verified over all 4,308 shipped sentences: 0 misalignments, and every
 * one of them contains its own headword verbatim, so every sheet gets a mark). So
 * the two are zipped rather than re-derived — punctuation carries no syllable and is simply
 * skipped, which is why 他很累，但还在工作。 lines up with `tā hěn lèi dàn hái zài gōng zuò`.
 * If a future sentence ever fails that zip, `pinyin` comes back null and the caller prints the
 * string through `<Pinyin>`'s own segmenter instead of printing a wrong alignment.
 *
 * ERHUA IS THE ONE PLACE A RUN BOUNDARY IS IGNORED. 儿 in 哪儿 is `r` attached to the syllable
 * before it, and `<Pinyin>` only knows to write `nǎr` when both syllables sit in the same call.
 * 63 of the 4,308 sentences carry a bare `r`; a headword that ends before it (那 in 我的书在那儿)
 * would otherwise cut between them and print `nà r`. So a bare `r` always joins the run in
 * front of it, whatever the mark says.
 *
 * AND THE LINE IS SET AS A SENTENCE, not as a list of syllables: a leading capital and the stop
 * the hanzi writes, which is how Pleco sets `Tā jīhū yī yè méi shuì.` under 他几乎一夜没睡。
 * `sentenceCase` in the design system owns both rules; `capitalise` and `terminalStop` below are
 * how they reach a reading that has already been cut into marked and unmarked runs.
 */

import { sentenceCase, toneOf } from '$lib/design';
import type { Example, Syllable } from '$lib/types';

/** One stretch of the sentence's characters, all inside the headword or all outside it. */
export interface HanziRun {
	text: string;
	/** Part of the headword. */
	mark: boolean;
}

/** The same cut, over the sentence's syllables. Ready to hand straight to `<Pinyin>`. */
export interface PinyinRun {
	syllables: Syllable[];
	mark: boolean;
}

export interface SentenceParts {
	hanzi: HanziRun[];
	/** Null when the sentence's syllable count and character count disagree. */
	pinyin: PinyinRun[] | null;
	/** The stop the pinyin line ends on, printed after the last run. `''` when there is none. */
	stop: string;
}

/** A character that carries a syllable. Punctuation does not. */
const HAN = /\p{Script=Han}/u;

/** Which characters of `chars` fall inside any occurrence of `target`. */
export function markHeadword(chars: readonly string[], target: readonly string[]): boolean[] {
	const marks = new Array<boolean>(chars.length).fill(false);
	if (target.length === 0 || target.length > chars.length) return marks;

	for (let i = 0; i + target.length <= chars.length; i += 1) {
		let hit = true;
		for (let k = 0; k < target.length; k += 1) {
			if (chars[i + k] !== target[k]) {
				hit = false;
				break;
			}
		}
		if (!hit) continue;
		for (let k = 0; k < target.length; k += 1) marks[i + k] = true;
	}
	return marks;
}

/**
 * The leading capital, written into the first syllable of the first run.
 *
 * `Example.pinyin` ships bare syllables — `dà jiā dōu zài ān wèi shī qù gōng zuò de tóng shì` —
 * while the hanzi above it ends in 。 and the English below it in a full stop. Three lines,
 * three different ideas of what a sentence is. `sentenceCase` owns both rules, but it works on
 * one finished reading and the headword mark has already cut this one into runs, so the rules
 * are applied through it a piece at a time: the capital here, the stop by `terminalStop`.
 * Passing `''` as the hanzi is what asks it for the capital alone.
 */
function capitalise(runs: PinyinRun[]): void {
	const head = runs[0]?.syllables[0];
	if (head === undefined) return;
	head.py = sentenceCase([{ text: head.py, tone: head.tone }], '')[0].text;
}

/**
 * The Latin stop the sentence's own punctuation asks for — 。→ `.`, ？→ `?` — read out of
 * `sentenceCase` rather than restated here, so there is one table of them in the app.
 *
 * It is deliberately NOT appended to the last syllable. Two things break when it is: a run that
 * ends in erhua stops being erhua (`<Pinyin>` recognises the retroflex ending by the syllable
 * being exactly `r`, so `r.` printed 好玩儿 as `hǎo wán r.`), and a headword sitting at the end
 * of its own sentence — 1,151 of the 4,308 do — drags the full stop inside its mark's ground
 * and accent rule. The caller prints it after the last run instead.
 */
function terminalStop(hanzi: string): string {
	return sentenceCase([{ text: '', tone: 0 }], hanzi)[0].text;
}

/** Cut one sentence into hanzi runs and, when the two align, syllable runs. */
export function splitSentence(example: Example, headword: string): SentenceParts {
	const chars = [...example.hanzi];
	const marks = markHeadword(chars, [...headword]);

	const hanzi: HanziRun[] = [];
	for (let i = 0; i < chars.length; i += 1) {
		const last = hanzi[hanzi.length - 1];
		if (last !== undefined && last.mark === marks[i]) last.text += chars[i];
		else hanzi.push({ text: chars[i], mark: marks[i] });
	}

	const tokens = example.pinyin
		.trim()
		.split(/\s+/u)
		.filter((token) => token !== '');
	const carriers: number[] = [];
	for (let i = 0; i < chars.length; i += 1) {
		if (HAN.test(chars[i])) carriers.push(i);
	}
	const stop = terminalStop(example.hanzi);
	if (carriers.length !== tokens.length || tokens.length === 0) {
		return { hanzi, pinyin: null, stop: '' };
	}

	const pinyin: PinyinRun[] = [];
	for (let n = 0; n < tokens.length; n += 1) {
		const py = tokens[n];
		const mark = marks[carriers[n]];
		const last = pinyin[pinyin.length - 1];
		const erhua = py === 'r' && last !== undefined;
		if (last !== undefined && (last.mark === mark || erhua)) {
			last.syllables.push({ py, tone: toneOf(py) });
		} else {
			pinyin.push({ syllables: [{ py, tone: toneOf(py) }], mark });
		}
	}

	capitalise(pinyin);
	return { hanzi, pinyin, stop };
}
