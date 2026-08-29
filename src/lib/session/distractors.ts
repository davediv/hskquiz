import type { Direction, Word } from '../types';
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

const ARTICLE = /^(?:to|a|an|the)\s+/;

/**
 * Split a gloss into comparable senses.
 *
 * The shipped meanings are semicolon-joined (`'to love; to be fond of; to like'`), so a
 * naive string compare would call 那 two different words. Normalising to a set of bare
 * senses — parentheticals dropped, articles and the verbal `to` stripped, punctuation and
 * case flattened — is what lets the picker tell "genuinely different word" from "the same
 * answer wearing a different gloss".
 */
export function senseSet(word: Word): Set<string> {
	const out = new Set<string>();
	for (const meaning of word.meanings ?? []) {
		for (const part of meaning.split(/[;/]/)) {
			const normalised = part
				.toLowerCase()
				.replace(/\([^)]*\)/g, ' ')
				.replace(/[.;,!?"'’“”()[\]]/g, ' ')
				.replace(/\s+/g, ' ')
				.trim()
				.replace(ARTICLE, '')
				.trim();
			if (normalised) out.add(normalised);
		}
	}
	return out;
}

function intersects(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
	const [small, large] = a.size <= b.size ? [a, b] : [b, a];
	for (const value of small) if (large.has(value)) return true;
	return false;
}

/** True when two entries share any sense — i.e. both would be right for the same prompt. */
export function sharesSense(a: Word, b: Word): boolean {
	return intersects(senseSet(a), senseSet(b));
}

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

function charSet(word: Word): Set<string> {
	return new Set([...word.hanzi]);
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
}

/** Precompute the sense sets once per session instead of once per comparison. */
export function makePool(words: readonly Word[]): DistractorPool {
	const usable = words.filter(isUsable);
	const senses = new Map<string, Set<string>>();
	for (const word of usable) senses.set(word.id, senseSet(word));
	return { words: usable, senses };
}

function sensesOf(pool: DistractorPool, word: Word): ReadonlySet<string> {
	return pool.senses.get(word.id) ?? senseSet(word);
}

/**
 * True when putting `candidate` on the same card as `answer` would create two right answers.
 *
 * Both axes are checked in both directions, on purpose. 85 hanzi repeat in the official list
 * (打 three times, as separate entries with separate senses), so a same-hanzi distractor is
 * also correct when the prompt is the hanzi. And ~40 words per level share a gloss with
 * another word, so a same-sense distractor is also correct when the prompt is the gloss.
 * Filtering on the displayed side only would leave the other half of the bug in place.
 */
export function isAmbiguousWith(pool: DistractorPool, answer: Word, candidate: Word): boolean {
	if (candidate.id === answer.id) return true;
	if (candidate.hanzi === answer.hanzi) return true;
	return intersects(sensesOf(pool, answer), sensesOf(pool, candidate));
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
