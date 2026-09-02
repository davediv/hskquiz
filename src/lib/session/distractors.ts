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
 * Glosses that describe what a word *does* to a sentence instead of translating it.
 *
 * 第 ships as "makes 'one' into 'first'", 吗 as "makes a sentence a yes-no question", 瓶 as
 * "measure word: bottles". These are the right glosses — there is no English word for 第 — but
 * they are written in a different register from every other entry in the list, and register is
 * visible from across the room. Put 第 on a card against "it is raining", "half a year" and
 * "please come in" and the learner does not need to know a character: exactly one button is
 * talking about grammar. Measured over 600 sessions of L1–L3, **51.0% of hanzi→meaning cards
 * with a metalinguistic answer drew three ordinary-phrase distractors**, and every one of those
 * cards was free.
 *
 * Nothing else in `plausibility` can see it. `pos` is no help — 第 is the only `Prefix` in HSK 1
 * — and gloss length and the `to `-verb test are satisfied by any four-word phrase.
 *
 * Judged on `meanings[0]` alone, because `primaryGloss` is what goes on the button. The list is
 * the verbs the shipped glosses actually use to describe a function, plus the two shapes that
 * are metalinguistic by punctuation: "measure word: …" and a gloss with a "…" slot in it
 * ("don't ...!", "the more ... the more"). It matches 14/500 L1 words, 25/770 L2, 15/969 L3,
 * 10/999 L4, 9/1070 L5 — always more than the three distractors a card needs.
 */
const METALINGUISTIC =
	/^(?:makes|marks|shows|indicates|softens|expresses|denotes|introduces|links|connects|turns|used)\b|^(?:measure word|classifier|particle|prefix|suffix)\b/i;

/** Memoised on the gloss string: `plausibility` asks this once per candidate per question. */
const REGISTERS = new Map<string, boolean>();

function isMetalinguistic(word: Word): boolean {
	const gloss = word.meanings[0] ?? '';
	const cached = REGISTERS.get(gloss);
	if (cached !== undefined) return cached;
	const made = METALINGUISTIC.test(gloss.trim()) || gloss.includes('...') || gloss.includes('…');
	REGISTERS.set(gloss, made);
	return made;
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
	{
		pos: number;
		verbal: number;
		gloss: [number, number];
		hanzi: [number, number];
		share: number;
		register: number;
	}
> = {
	'hanzi-to-meaning': { pos: 6, verbal: 4, gloss: [4, 2], hanzi: [2, 1], share: 0, register: 20 },
	'meaning-to-hanzi': { pos: 6, verbal: 2, gloss: [1, 0], hanzi: [6, 3], share: 3, register: 0 }
};

/** At most one distractor per question may share a character with the answer. */
const MAX_CHARACTER_ECHOES = 1;

function plausibility(answer: Word, candidate: Word, direction: Direction): number {
	const signal = SIGNALS[direction];

	// A metalinguistic answer is scored on register and nothing else, and it is scored first
	// because for that answer register is not a term in a sum — it is the entire ranking.
	//
	// The partition below is right and stays. What was wrong is what happened *inside* it. L1
	// ships 14 glosses that describe a grammatical function, so a measure word's same-register
	// pool is 13 candidates, and pos/verbal/gloss/hanzi then split those 13 into score buckets
	// that `pickDistractors` empties strictly from the top down — a four-deep top bucket is a
	// closed carousel. Measured over 400 draws each: 间, 的, 次, 杯, 本 and 吧 drew **exactly 4
	// distinct distractors, ever**, against 29 for an ordinary control (好). The finer signals
	// cannot usefully sort thirteen function words; all they do is freeze which three appear.
	//
	// So inside the partition every other function word is one bucket and the shuffle is the
	// whole draw. The signals are not lost — they are simply not consulted on the ~3% of cards
	// where they have nothing left to separate.
	if (signal.register > 0 && isMetalinguistic(answer)) {
		return isMetalinguistic(candidate) ? signal.register : 0;
	}

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

	// The other half of the partition: an ordinary answer keeps every function-word gloss off
	// its buttons. 20 is deliberately larger than every other signal in this function added
	// together (6 + 4 + 4 + 2 = 16), so "measure word: for flat objects" can never sit beside
	// three real meanings and announce which one is the odd one out. It costs ordinary cards
	// nothing — ~97% of the list is ordinary, so this is a constant added to almost every
	// candidate, which changes no ranking among them. It degrades rather than fails: a level
	// too small to spare three same-register candidates falls through to the next bucket, the
	// same way every other signal does.
	//
	// Only in hanzi→meaning. In the other direction the glosses are the *prompt* and the buttons
	// hold characters, so the register of a candidate's gloss is not on screen to leak anything.
	if (signal.register > 0 && !isMetalinguistic(candidate)) score += signal.register;

	return score;
}

export interface DistractorPool {
	/** Every word eligible to appear as a wrong answer, already filtered for usability. */
	readonly words: readonly Word[];
	readonly senses: ReadonlyMap<string, Set<string>>;
	/** The same senses, split into words, for the nesting test below. */
	readonly phrases: ReadonlyMap<string, string[][]>;
}

/**
 * A word's senses as this file compares them: `senseSet`, with hyphens read as spaces.
 *
 * `senseSet` normalises five things and not the hyphen — its character class is `[^a-z0-9-]`,
 * so `-` survives into the comparable form and `senseSet('快速') = {'high-speed','rapid'}` does
 * not intersect `senseSet('高速') = {'high speed','expressway'}`. Both ship, at HSK 3, and both
 * can land on one card: prompt "high-speed · rapid", with "high speed" on screen as a wrong
 * answer that is not wrong. A hyphen is orthography, not sense — "high-speed" and "high speed"
 * are the same English — so it is folded here before anything compares or splits.
 *
 * This is the card-side half of the fix and it is complete for the picker. The other half is
 * `scripts/build-vocab.mjs`, which imports the same `senseSet` for its "no two shipped words
 * share a sense" gate and inherits the same hole; folding it there belongs to whoever owns
 * `src/lib/data/senses.ts`, and until it happens the corpus can still ship such a pair — which
 * is precisely why the picker refuses it independently rather than trusting the gate.
 */
/**
 * The modal auxiliaries, whose English glosses are one sense written several ways.
 *
 * `senses.ts` is right to refuse to be a thesaurus — "shore" and "coast" must stay two senses,
 * and a general synonym table is how a picker starts refusing candidates it has no business
 * refusing. The modals are the one place that argument does not hold, because they are a closed
 * grammatical class of about a dozen words whose glosses the list itself writes interchangeably:
 * 会 ships "to know how to", 能 ships "to be able to", 能够 ships "to be capable of", 可以 ships
 * "to be allowed to". All four are *can*. Loop 4 put 能's "to be able to" on a 会 card as a wrong
 * answer, and it was not wrong.
 *
 * Every phrase here was read off the shipped glosses; the whole table reaches 13 words across
 * the five levels, and the pairs it newly separates are 会/能 at HSK 1, 懂得/可以/能够 at HSK 2,
 * 得/应 at HSK 4 and 必/不能不 at HSK 5. It matches a *whole* normalised sense and never a word
 * inside one, so it cannot reach into an ordinary gloss that happens to contain "can".
 *
 * Bare "may" is deliberately absent even though 可以 ships it: it would fold the month onto a
 * modal the day a list ships 五月 as "May". 可以 lands in the family through "to be allowed to"
 * anyway, so the risky key buys nothing.
 */
const MODAL_FAMILIES: readonly (readonly string[])[] = [
	['can', 'be able to', 'know how to', 'be allowed to', 'be capable of', 'manage to'],
	['must', 'have to', 'need to', 'should', 'ought to']
];

/** Every phrase above, pointing at the first member of its family. Built once at load. */
const MODAL_KEY = new Map<string, string>();
for (const family of MODAL_FAMILIES) {
	for (const phrase of family) MODAL_KEY.set(phrase, family[0]);
}

function comparableSenses(word: Word): Set<string> {
	const out = new Set<string>();
	for (const sense of senseSet(word)) {
		const flat = sense.replace(/-+/g, ' ').replace(/\s+/g, ' ').trim();
		out.add(MODAL_KEY.get(flat) ?? flat);
	}
	return out;
}

/** Precompute the sense sets once per session instead of once per comparison. */
export function makePool(words: readonly Word[]): DistractorPool {
	const usable = words.filter(isUsable);
	const senses = new Map<string, Set<string>>();
	const phrases = new Map<string, string[][]>();
	for (const word of usable) {
		const set = comparableSenses(word);
		senses.set(word.id, set);
		phrases.set(word.id, [...set].map(splitWords));
	}
	return { words: usable, senses, phrases };
}

function splitWords(sense: string): string[] {
	return sense.split(' ').filter(Boolean);
}

function sensesOf(pool: DistractorPool, word: Word): ReadonlySet<string> {
	return pool.senses.get(word.id) ?? comparableSenses(word);
}

function phrasesOf(pool: DistractorPool, word: Word): readonly string[][] {
	return pool.phrases.get(word.id) ?? [...comparableSenses(word)].map(splitWords);
}

/**
 * Is `short` a whole run of words inside `long`? Equal phrases are `sharesSense`'s business.
 *
 * This used to compare from index 0 only, which is where a nested gloss happens to sit about a
 * third of the time and nowhere else. 去 "to go" does open 出去 "to go out" — but 半 "half" ends
 * 一半 "one half", 年 "year" ends 半年 "half a year", 人 "person" ends 别人 "other people", and
 * every one of those sailed through onto a card next to the word that contains it. Counted over
 * the five shipped lists, restricted (as `nestsWith` restricts itself) to same-level pairs that
 * also share a character: **the prefix test found 227 pairs and containment finds 525**, so the
 * guard was missing more traps than it caught, in exactly the ratio the loop-4 audit measured.
 *
 * Word-aligned rather than substring: `['ear']` must not match inside `['early','morning']`,
 * and comparing raw strings would say it does.
 */
function sitsInside(short: readonly string[], long: readonly string[]): boolean {
	if (short.length === 0 || short.length >= long.length) return false;
	const last = long.length - short.length;
	outer: for (let start = 0; start <= last; start++) {
		for (let i = 0; i < short.length; i++) {
			if (short[i] !== long[start + i]) continue outer;
		}
		return true;
	}
	return false;
}

/**
 * True when one word's gloss sits whole inside the other's *and* the two share a character.
 *
 * Neither half is enough on its own. Nested glosses alone catch thousands of same-level pairs,
 * most of them unrelated words that merely overlap ("not" inside "not very much"), and throwing
 * that many candidates out of the picker costs more than it buys. A shared character alone is a
 * *feature*: producing 开机 "to switch on a machine" when asked for 开学 "to start school" is the
 * mistake a real learner makes, and `SIGNALS.share` deliberately rewards it.
 *
 * Together they are the trap. 半 "half" beside 一半 "one half", 年 "year" beside 半年 "half a
 * year", 去 "to go" beside 出去 "to go out", 大学 "university" beside 大学生 "university student"
 * — same character, and a gloss the learner cannot tell apart from the prompt they were given.
 * The learner picks the shorter one, is told they are wrong, and is right. 525 such pairs across
 * the five shipped levels; each one loses one candidate out of hundreds.
 *
 * What this cannot see is a synonym that shares no spelling: 没关系 "it does not matter" beside
 * 没事儿 "it is all right", or 记住 "memorize" beside 记得 "remember". Those need a thesaurus,
 * not a string compare, and pretending otherwise is how the thousand-pair version happened.
 */
function nestsWith(pool: DistractorPool, a: Word, b: Word): boolean {
	if (!sharesCharacter(a, b)) return false;
	for (const x of phrasesOf(pool, a)) {
		for (const y of phrasesOf(pool, b)) {
			if (sitsInside(x, y) || sitsInside(y, x)) return true;
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
