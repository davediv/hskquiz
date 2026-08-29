import type { Direction, Word } from '../types';
import { intersects, senseSet } from '$lib/data/senses';
import { shuffle, type Rng } from './rng';

/**
 * Four choices per question.
 *
 * Three is too generous — a 33% coin flip on a ten-question session means three free
 * points. Six either shrinks the hanzi (the whole point of the card) or pushes the last
 * option below the fold on a 375×812 phone. Four full-width buttons sit under a 96px
 * headword with room to spare, and hold the guess rate to 25%.
 */
export const CHOICE_COUNT = 4;

/**
 * Sense normalisation is `$lib/data/senses`, and only ever that.
 *
 * This file used to carry its own `senseSet`, deliberately written to match `senseKeys()` in
 * `scripts/build-vocab.mjs` line for line. Two copies of one rule is one copy too many: the
 * build gate that guarantees no two shipped words share a sense, and the picker that keeps
 * two such words off one card, have to be asking the *same* question or the guarantee is
 * about a different app than the one that ships. Both import the one module now.
 */
export { senseSet, sharesSense } from '$lib/data/senses';

/** A word the app can actually put on a card: it needs a headword and at least one gloss. */
export function isUsable(word: Word): boolean {
	return Boolean(word.hanzi) && (word.meanings?.length ?? 0) > 0 && Boolean(word.meanings[0]);
}

function hanziLength(word: Word): number {
	return [...word.hanzi].length;
}

/** Short / medium / long gloss. Matching the shape stops the long option being the tell. */
function glossBucket(word: Word): number {
	const words = (word.meanings[0] ?? '').split(/\s+/).filter(Boolean).length;
	return words <= 2 ? 0 : words <= 5 ? 1 : 2;
}

/** Whether the gloss reads as a verb (`'to run'`). Survives the 15% of entries with no POS. */
function isVerbal(word: Word): boolean {
	return /^to\s/i.test(word.meanings[0] ?? '');
}

/**
 * Characters of a word, memoised.
 *
 * `sharesCharacter` runs once per candidate per question in `plausibility` and again in the
 * nesting test, which is ~10,000 calls a session on a 500-word level; rebuilding two sets on
 * every one of them made a full session measurably slower than picking its distractors.
 * Keyed by the string, so entries that render identically share an entry and the map is
 * bounded by the vocabulary rather than by the number of sessions.
 */
const CHARS = new Map<string, Set<string>>();

function charSet(word: Word): Set<string> {
	const cached = CHARS.get(word.hanzi);
	if (cached) return cached;
	const made = new Set([...word.hanzi]);
	CHARS.set(word.hanzi, made);
	return made;
}

function sharesCharacter(a: Word, b: Word): boolean {
	return intersects(charSet(a), charSet(b));
}

/**
 * Plausibility weights, tuned per direction by what the learner can actually *see*.
 *
 * In hanzi-to-meaning the four buttons hold English, so gloss shape is the giveaway and
 * hanzi length is invisible. In meaning-to-hanzi it is the other way round: the buttons hold
 * characters, so a one-character answer among three two-character distractors is free.
 */
const SIGNALS: Record<
	Direction,
	{ pos: number; verbal: number; gloss: [number, number]; hanzi: [number, number]; share: number }
> = {
	'hanzi-to-meaning': { pos: 6, verbal: 4, gloss: [4, 2], hanzi: [2, 1], share: 0 },
	'meaning-to-hanzi': { pos: 6, verbal: 2, gloss: [1, 0], hanzi: [6, 3], share: 3 }
};

/** At most one distractor per question may share a character with the answer. */
const MAX_CHARACTER_ECHOES = 1;

function plausibility(answer: Word, candidate: Word, direction: Direction): number {
	const signal = SIGNALS[direction];
	let score = 0;

	const answerPos = answer.pos ?? [];
	const candidatePos = candidate.pos ?? [];
	if (answerPos.length === 0 || candidatePos.length === 0) {
		// ~15% of the official list carries no POS annotation. Neither reward nor punish —
		// the gloss-shape signals below still separate 'to leave hospital' from 'passport'.
		score += Math.round(signal.pos / 3);
	} else if (answerPos.some((p) => candidatePos.includes(p))) {
		score += signal.pos;
	}

	if (isVerbal(answer) === isVerbal(candidate)) score += signal.verbal;

	const glossGap = Math.abs(glossBucket(answer) - glossBucket(candidate));
	score += glossGap === 0 ? signal.gloss[0] : glossGap === 1 ? signal.gloss[1] : 0;

	const hanziGap = Math.abs(hanziLength(answer) - hanziLength(candidate));
	score += hanziGap === 0 ? signal.hanzi[0] : hanziGap === 1 ? signal.hanzi[1] : 0;

	// Producing 开机 when asked for 开学 is the mistake a real learner makes. Worth points
	// when the characters are on screen; meaningless when they aren't.
	if (signal.share > 0 && sharesCharacter(answer, candidate)) score += signal.share;

	return score;
}

export interface DistractorPool {
	/** Every word eligible to appear as a wrong answer, already filtered for usability. */
	readonly words: readonly Word[];
	readonly senses: ReadonlyMap<string, Set<string>>;
	/** The same senses, split into words, for the nesting test below. */
	readonly phrases: ReadonlyMap<string, string[][]>;
}

/** Precompute the sense sets once per session instead of once per comparison. */
export function makePool(words: readonly Word[]): DistractorPool {
	const usable = words.filter(isUsable);
	const senses = new Map<string, Set<string>>();
	const phrases = new Map<string, string[][]>();
	for (const word of usable) {
		const set = senseSet(word);
		senses.set(word.id, set);
		phrases.set(word.id, [...set].map(splitWords));
	}
	return { words: usable, senses, phrases };
}

function splitWords(sense: string): string[] {
	return sense.split(' ').filter(Boolean);
}

function sensesOf(pool: DistractorPool, word: Word): ReadonlySet<string> {
	return pool.senses.get(word.id) ?? senseSet(word);
}

function phrasesOf(pool: DistractorPool, word: Word): readonly string[][] {
	return pool.phrases.get(word.id) ?? [...senseSet(word)].map(splitWords);
}

/** `['to','go']` opens `['to','go','out']`. Equal phrases are `sharesSense`'s business. */
function opens(short: readonly string[], long: readonly string[]): boolean {
	if (short.length === 0 || short.length >= long.length) return false;
	for (let i = 0; i < short.length; i++) if (short[i] !== long[i]) return false;
	return true;
}

/**
 * True when one word's gloss is the opening of the other's *and* the two share a character.
 *
 * Neither half is enough on its own. Nested glosses alone catch 827 same-level pairs, most of
 * them unrelated words that happen to start the same way ("not" inside "not very much"), and
 * throwing that many candidates out of the picker costs more than it buys. A shared character
 * alone is a *feature*: producing 开机 "to switch on a machine" when asked for 开学 "to start
 * school" is the mistake a real learner makes, and `SIGNALS.share` deliberately rewards it.
 *
 * Together they are the trap. 出去 "to go out" beside 去 "to go", 回来 "to come back" beside 来
 * "to come", 唱歌 "to sing a song" beside 唱 "to sing", 大学生 "university student" beside 大学
 * "university" — same character, and a gloss the learner cannot tell apart from the prompt
 * they were given. The learner picks the shorter one, is told they are wrong, and is right.
 * 243 such pairs across the five shipped levels; each one loses one candidate out of hundreds.
 *
 * What this cannot see is a synonym that shares no spelling: 没关系 "it does not matter" beside
 * 没事儿 "it is all right", or 记住 "memorize" beside 记得 "remember". Those need a thesaurus,
 * not a string compare, and pretending otherwise is how the 827-pair version happened.
 */
function nestsWith(pool: DistractorPool, a: Word, b: Word): boolean {
	if (!sharesCharacter(a, b)) return false;
	for (const x of phrasesOf(pool, a)) {
		for (const y of phrasesOf(pool, b)) {
			if (opens(x, y) || opens(y, x)) return true;
		}
	}
	return false;
}

/**
 * True when putting `candidate` on the same card as `answer` would create two right answers.
 *
 * Both axes are checked in both directions, on purpose. 85 hanzi repeat in the official list
 * (打 three times, as separate entries with separate senses), so a same-hanzi distractor is
 * also correct when the prompt is the hanzi. And ~40 words per level share a gloss with
 * another word, so a same-sense distractor is also correct when the prompt is the gloss.
 * Filtering on the displayed side only would leave the other half of the bug in place.
 *
 * The last clause is not ambiguity in the strict sense — 去 is not a correct answer to "to go
 * out" — but it is indistinguishable from one at the moment of choosing, which is the only
 * moment that matters. See `nestsWith`.
 */
export function isAmbiguousWith(pool: DistractorPool, answer: Word, candidate: Word): boolean {
	if (candidate.id === answer.id) return true;
	if (candidate.hanzi === answer.hanzi) return true;
	if (intersects(sensesOf(pool, answer), sensesOf(pool, candidate))) return true;
	return nestsWith(pool, answer, candidate);
}

/**
 * Pick `count` wrong answers for `answer`.
 *
 * Candidates are bucketed by plausibility score, each bucket is shuffled, and buckets are
 * consumed best-first. Bucketing rather than taking a strict top-N matters: a word has
 * hundreds of equally plausible distractors, and picking deterministically would show the
 * learner the same three wrong answers every time 服务 came up.
 */
export function pickDistractors(
	pool: DistractorPool,
	answer: Word,
	direction: Direction,
	count: number,
	rng: Rng,
	exclude: ReadonlySet<string> = new Set()
): Word[] {
	const buckets = new Map<number, Word[]>();
	for (const candidate of pool.words) {
		if (exclude.has(candidate.id)) continue;
		if (isAmbiguousWith(pool, answer, candidate)) continue;
		const score = plausibility(answer, candidate, direction);
		const bucket = buckets.get(score);
		if (bucket) bucket.push(candidate);
		else buckets.set(score, [candidate]);
	}

	const chosen: Word[] = [];
	let echoes = 0;
	for (const score of [...buckets.keys()].sort((a, b) => b - a)) {
		if (chosen.length >= count) break;
		for (const candidate of shuffle(buckets.get(score) ?? [], rng)) {
			if (chosen.length >= count) break;
			// Distractors must be unambiguous against each other too, not just the answer.
			if (chosen.some((picked) => isAmbiguousWith(pool, picked, candidate))) continue;
			if (sharesCharacter(answer, candidate)) {
				if (echoes >= MAX_CHARACTER_ECHOES) continue;
				echoes++;
			}
			chosen.push(candidate);
		}
	}
	return chosen;
}
