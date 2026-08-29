/**
 * The one place the app decides whether two English glosses say the same thing.
 *
 * Everything downstream of this file — the build's uniqueness gates, the quiz's distractor
 * guard — is answering the same question: *if both of these words were on one card, would
 * the learner have two right answers?* Loop 2 shipped that question answered twice, by
 * `senseKeys()` in `scripts/build-vocab.mjs` and a deliberately identical `senseSet()` in
 * `src/lib/session/distractors.ts`, and the two copies could only drift. There is now one
 * copy and both import it: the node build reads this `.ts` directly (Node strips the types),
 * and the app imports it as `$lib/data/senses`.
 *
 * What it normalises away, and why each one is a real collision the learner would see:
 *
 *   `;` `/`      the joiners CC-CEDICT uses between senses of one headword.
 *   ` or `       the *house* joiner. 衬衣 ships "a shirt or blouse" and 衬衫 ships "shirt";
 *                loop 2's splitter did not know the word "or", so the two cards could land
 *                on one question with the prompt "shirt" and both buttons correct.
 *   articles     the app already treats "a crowd" and "crowd" as one answer, so the gates
 *                have to as well or they are checking something the app does not believe.
 *   contractions 就是 "it's just that" and 只是 "it is just that" are the same English.
 *   plurals      感情 "emotions" against 情感 "emotion" is not a distinction a button can
 *                carry. Only the head word is folded, and only by regular rules.
 *
 * It deliberately does **not** try to be a thesaurus. "shore" and "coast" stay two senses;
 * this file only collapses spellings of one sense.
 */

/** The shape both a shipped `Word` and a half-built entry satisfy. */
export interface Glossed {
	readonly meanings?: readonly string[];
}

/** Leading noise that carries no sense: the verbal `to` and the articles. */
const LEAD = /^(?:to|a|an|the)\s+/;

/** Straight and curly apostrophes, so `it’s` and `it's` normalise identically. */
const APOSTROPHE = /['’‘`´]/g;

/**
 * Fixed phrases that merely *contain* "or" — splitting them invents senses.
 *
 * "whether or not" would otherwise donate the sense "not" to 是否 and 无论, and "more or
 * less" would give 大致 the senses "more" and "less". Ordered longest-first so
 * `whether or not` is consumed before the bare `or not` alternative can match inside it.
 */
const FIXED_OR =
	/\b(?:whether\s+or\s+not|more\s+or\s+less|sooner\s+or\s+later|now\s+or\s+never|all\s+or\s+nothing|yes\s+or\s+no|or\s+not|or\s+so|or\s+more|or\s+less|or\s+other|or\s+otherwise|or\s+two|or\s+three|or\s+four)\b/gi;

/** Stands in for a protected "or" while the splitter runs. Never survives normalisation. */
const GUARD = '\u0001';

/** Plurals whose singular is a different word, or which are not plurals at all. */
const KEEP_AS_IS = new Set([
	'news',
	'series',
	'species',
	'means',
	'goods',
	'customs',
	'arms',
	'glasses',
	'clothes',
	'underclothes',
	'manners',
	'savings',
	'surroundings',
	'belongings',
	'stairs',
	'pants',
	'trousers',
	'scissors',
	'works',
	'spirits',
	'sports',
	'mathematics',
	'physics',
	'politics',
	'economics',
	'statistics',
	'ethics',
	'athletics',
	'gymnastics',
	'always',
	'perhaps',
	'various',
	'previous',
	'serious',
	'obvious',
	'anxious',
	'nervous',
	'famous',
	'delicious',
	'gas',
	'atlas',
	'canvas',
	'chaos',
	'does',
	'yes'
]);

/** Irregular plurals worth knowing, because their singular shows up on another card. */
const IRREGULAR_PLURAL: Record<string, string> = {
	buses: 'bus',
	gases: 'gas',
	shoes: 'shoe',
	children: 'child',
	men: 'man',
	women: 'woman',
	feet: 'foot',
	teeth: 'tooth',
	mice: 'mouse',
	geese: 'goose',
	knives: 'knife',
	leaves: 'leaf',
	lives: 'life',
	wives: 'wife',
	wolves: 'wolf',
	shelves: 'shelf',
	halves: 'half',
	thieves: 'thief'
};

/**
 * Contractions, expanded before punctuation is flattened.
 *
 * Loop 2's normaliser turned every apostrophe into a space, so "it's just that" became
 * `it s just that` and could never match "it is just that" — the collision hid behind a
 * typographic choice. `can't` / `won't` / `shan't` come first because the generic `n't`
 * rule would otherwise leave "ca not".
 *
 * `one's` is absent on purpose: 该 ships "to be one's turn", and `one is turn` is worse
 * than the apostrophe was. Bare possessives fall through to the apostrophe strip below,
 * where "father's" becomes "fathers" and the plural fold takes it from there.
 */
const CONTRACTIONS: readonly (readonly [RegExp, string])[] = [
	[/\bcan't\b/g, 'cannot'],
	[/\bwon't\b/g, 'will not'],
	[/\bshan't\b/g, 'shall not'],
	[/n't\b/g, ' not'],
	[/\bi'm\b/g, 'i am'],
	[/\blet's\b/g, 'let us'],
	[/\b(it|that|this|there|here|what|he|she)'s\b/g, '$1 is'],
	[/\b(i|you|we|they)'re\b/g, '$1 are'],
	[/\b(i|you|we|they)'ve\b/g, '$1 have'],
	[/\b(i|you|we|they|he|she|it)'ll\b/g, '$1 will'],
	[/\b(i|you|we|they|he|she|it)'d\b/g, '$1 would']
];

/** Fold a regular English plural onto its singular. Head words only — see `splitSenses`. */
export function singularise(word: string): string {
	const irregular = IRREGULAR_PLURAL[word];
	if (irregular) return irregular;
	if (word.length <= 3 || KEEP_AS_IS.has(word)) return word;
	if (/ies$/.test(word) && word.length > 4) return word.slice(0, -3) + 'y';
	if (/(?:ch|sh|ss|x|z)es$/.test(word)) return word.slice(0, -2);
	if (/oes$/.test(word) && word.length >= 6) return word.slice(0, -2);
	if (/s$/.test(word) && !/(?:ss|us|is)$/.test(word)) return word.slice(0, -1);
	return word;
}

/**
 * True when `text` is one term — optionally behind `to` or an article.
 *
 * This is the whole "or" heuristic. "shore or coast" and "a shirt or blouse" list two
 * senses of one word; "to wear glasses or a hat" and "to close a book or the eyes" list two
 * *objects* of one sense, and splitting those would hand 戴 the sense "hat" and 合 the sense
 * "eyes". A single-word left operand separates the two shapes across the whole corpus.
 */
function isSingleTerm(text: string): boolean {
	const bare = text.trim().replace(LEAD, '').trim();
	return bare.length > 0 && !/\s/.test(bare);
}

/** Split on ` or ` only where the left side is one term. Recurses down a chain of them. */
function splitOr(text: string): string[] {
	const at = /\s+or\s+/i.exec(text);
	if (!at) return [text];
	const head = text.slice(0, at.index);
	if (!isSingleTerm(head)) return [text];
	return [head, ...splitOr(text.slice(at.index + at[0].length))];
}

/** Flatten one already-split clause to its comparable form. Empty when it says nothing. */
function normalise(part: string): string {
	const flat = part
		.replace(APOSTROPHE, '')
		.replace(/[^a-z0-9-]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(LEAD, '')
		.trim();
	if (!flat) return '';
	const words = flat.split(' ');
	words[words.length - 1] = singularise(words[words.length - 1]);
	return words.join(' ');
}

/**
 * One gloss in, its comparable senses out. `'a shirt or blouse'` → `['shirt', 'blouse']`.
 *
 * Parentheticals go first, before any splitting, so a `;` or an `or` inside one cannot cut
 * the gloss in the wrong place. (The build forbids parentheses in a shipped gloss outright;
 * this is here because the app runs the same function over data it did not build.)
 */
export function splitSenses(meaning: string): string[] {
	let text = String(meaning)
		.toLowerCase()
		.replace(APOSTROPHE, "'")
		.replace(/\([^)]*\)/g, ' ');
	for (const [pattern, replacement] of CONTRACTIONS) text = text.replace(pattern, replacement);
	text = text.replace(FIXED_OR, (fixed) => fixed.replace(/\s+or\s+/gi, GUARD));

	const out: string[] = [];
	for (const clause of text.split(/[;/]/)) {
		for (const part of splitOr(clause)) {
			const sense = normalise(part.split(GUARD).join(' or '));
			if (sense) out.push(sense);
		}
	}
	return out;
}

/** Every distinct sense a list of glosses answers to. */
export function senseKeys(meanings: readonly string[] | null | undefined): Set<string> {
	const out = new Set<string>();
	for (const meaning of meanings ?? []) for (const sense of splitSenses(meaning)) out.add(sense);
	return out;
}

/** Every distinct sense a word answers to — what a learner could rightly type for it. */
export function senseSet(word: Glossed): Set<string> {
	return senseKeys(word.meanings);
}

/** The senses of a word's primary gloss alone — the text that goes on an answer button. */
export function primarySenses(word: Glossed): Set<string> {
	return senseKeys((word.meanings ?? []).slice(0, 1));
}

/** True when two sets have any member in common. Walks the smaller one. */
export function intersects<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean {
	const [small, large] = a.size <= b.size ? [a, b] : [b, a];
	for (const value of small) if (large.has(value)) return true;
	return false;
}

/** True when two entries share any sense — i.e. both would be right for the same prompt. */
export function sharesSense(a: Glossed, b: Glossed): boolean {
	return intersects(senseSet(a), senseSet(b));
}

/** A stable, order-independent key for a set of senses, for grouping and for messages. */
export function senseKey(senses: Iterable<string>): string {
	return [...senses].sort().join(' / ');
}
