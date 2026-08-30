/**
 * The shipped word list is derived data. These tests are the contract that it still says
 * what the official HSK 3.0 standard says, and that every entry is answerable as a quiz
 * question.
 *
 * The `gloss gates` blocks mirror the gates in scripts/build-vocab.mjs. The *checks* are
 * deliberately duplicated rather than imported: the build gate stops a bad gloss being
 * written, and this one stops a bad gloss being checked in by hand or surviving a build
 * that was never re-run. Loop 1 shipped four such defects with this suite green, because
 * nothing here looked at what a gloss actually said.
 *
 * What is *not* duplicated is the comparison itself. Both sides call `$lib/data/senses`,
 * because loop 2's two hand-kept-identical copies of that normaliser were identical in the
 * wrong way — neither knew the word "or" — and 38 same-level pairs shipped answering to the
 * same English.
 *
 * Files are read with `readFileSync` rather than imported: a static `import './hsk1.json'`
 * would drag 4,308 JSON entries into the TypeScript program and slow every `svelte-check`.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Level, Word } from '$lib/types';
import { LEVEL_SIZES, LEVELS } from '$lib/types';
import { buttonKeys, intersects, qualifierOf, senseKey, senseKeys } from '$lib/data/senses';
import { SHIPPED_SIZES, SHIPPED_TOTAL } from './sizes';

interface ShippedWord extends Word {
	/** Present only where two official rows collapsed into one card. */
	ids?: string[];
}

interface OfficialRow {
	id: string;
	simplified: string;
	pinyin: string;
	officialPinyin: string;
	level: number;
}

function readShipped(level: Level): ShippedWord[] {
	return JSON.parse(readFileSync(`src/lib/data/hsk${level}.json`, 'utf8')) as ShippedWord[];
}

function readOfficial(level: Level): OfficialRow[] {
	return JSON.parse(
		readFileSync(`reference/hsk/hsk30-official-L${level}.json`, 'utf8')
	) as OfficialRow[];
}

const shipped = LEVELS.flatMap(readShipped);
const official = LEVELS.flatMap(readOfficial);

/** Every official id, mapped to the shipped entry that represents it. */
const byOfficialId = new Map<string, ShippedWord>();
for (const word of shipped) {
	for (const id of word.ids ?? [word.id]) byOfficialId.set(id, word);
}

const label = (word: ShippedWord) => `${word.id} ${word.hanzi} ${word.pinyin}`;

describe('shipped vocabulary vs. reference/hsk', () => {
	it('accounts for all 4,316 official entries', () => {
		expect(official).toHaveLength(4316);
		const missing = official.filter((row) => !byOfficialId.has(row.id));
		expect(missing.map((row) => `${row.id} ${row.simplified}`)).toEqual([]);
	});

	it('keeps every entry at the level the standard gives it', () => {
		const wrong = official.filter((row) => byOfficialId.get(row.id)?.level !== row.level);
		expect(wrong.map((row) => row.id)).toEqual([]);
	});

	it('ships one entry per official row, apart from same-level homographs', () => {
		const merged = shipped.filter((word) => (word.ids?.length ?? 1) > 1);
		expect(shipped).toHaveLength(official.length - merged.length);
		// A merge is only ever allowed between rows that are indistinguishable on a card.
		for (const word of merged) {
			const rows = word.ids!.map((id) => official.find((row) => row.id === id)!);
			expect(rows.every((row) => row.level === word.level)).toBe(true);
		}
	});

	it('matches the reference on hanzi and pinyin', () => {
		const clean = (text: string) =>
			text
				.split('|')[0]
				.replace(/[（(][^）)]*[）)]/g, ' ')
				.replace(/[0-9¹²³]+$/, '')
				.replace(/∥/g, ' ')
				.replace(/[…·]/g, '')
				.replace(/\s+/g, ' ')
				.trim();
		const wrong: string[] = [];
		for (const row of official) {
			const word = byOfficialId.get(row.id)!;
			if (word.hanzi !== clean(row.simplified).replace(/\s/g, '')) {
				wrong.push(`${row.id} hanzi ${word.hanzi} != ${row.simplified}`);
			}
			if (word.pinyin.toLowerCase() !== clean(row.officialPinyin || row.pinyin).toLowerCase()) {
				wrong.push(`${row.id} pinyin ${word.pinyin} != ${row.officialPinyin}`);
			}
		}
		expect(wrong).toEqual([]);
	});

	it('keeps 面1 and 面2 apart', () => {
		// 面|面[mian4] (face, surface, classifier) and 麵|面[mian4] (flour, noodles) are two
		// words the simplified script happens to spell the same. Loop 1 merged them and
		// shipped a card asserting that noodles is a measure word for flat things.
		const mian = shipped.filter((word) => word.hanzi === '面' && word.level === 2);
		expect(mian.map((word) => word.id).sort()).toEqual(['L2-0377', 'L2-0378']);
		expect(mian.find((word) => word.id === 'L2-0378')?.traditional).toBe('麵');
	});

	it('is exactly what scripts/build-vocab.mjs produces', () => {
		expect(() =>
			execFileSync('node', ['scripts/build-vocab.mjs', '--verify'], { stdio: 'pipe' })
		).not.toThrow();
	});
});

describe('authored glosses in scripts/overrides/', () => {
	const files = readdirSync('scripts/overrides').filter((name) => name.endsWith('.json'));

	it('has at least one override file', () => {
		expect(files.length).toBeGreaterThan(0);
	});

	it('never lets two files claim the same official id', () => {
		// Several authors work the audit list in parallel, one file each. A duplicate id is a
		// silent last-writer-wins, so it has to be an error in the suite as well as the build.
		const owner = new Map<string, string>();
		const clashes: string[] = [];
		for (const name of files) {
			const parsed = JSON.parse(readFileSync(join('scripts/overrides', name), 'utf8')) as Record<
				string,
				unknown
			>;
			for (const id of Object.keys(parsed)) {
				if (owner.has(id)) clashes.push(`${id}: ${owner.get(id)} and ${name}`);
				else owner.set(id, name);
			}
		}
		expect(clashes).toEqual([]);
	});

	it('gives every override a meaning and a reason', () => {
		const bad: string[] = [];
		for (const name of files) {
			const parsed = JSON.parse(readFileSync(join('scripts/overrides', name), 'utf8')) as Record<
				string,
				{ meanings?: unknown; note?: unknown }
			>;
			for (const [id, value] of Object.entries(parsed)) {
				if (!/^L[1-5]-\d{4}$/.test(id)) bad.push(`${name} ${id}: not an official row id`);
				const meanings = value?.meanings;
				if (!Array.isArray(meanings) || !meanings.length) bad.push(`${name} ${id}: no meanings`);
				if (!value?.note || typeof value.note !== 'string') bad.push(`${name} ${id}: no note`);
			}
		}
		expect(bad).toEqual([]);
	});
});

describe('syllables', () => {
	// Every tone-marked vowel, mapped to the tone its diacritic carries.
	const TONE_OF = new Map<string, number>();
	for (const marks of ['āáǎà', 'ēéěè', 'īíǐì', 'ōóǒò', 'ūúǔù', 'ǖǘǚǜ']) {
		[...marks].forEach((mark, index) => TONE_OF.set(mark, index + 1));
	}
	const printedTone = (syllable: string) => {
		for (const character of syllable) {
			const tone = TONE_OF.get(character);
			if (tone) return tone;
		}
		return 0;
	};

	it('gives every card one syllable per character', () => {
		const wrong = shipped.filter(
			(word) => (word.syllables?.length ?? 0) !== [...word.hanzi].length
		);
		expect(
			wrong.map((word) => `${label(word)}: ${word.syllables?.length ?? 0} for ${word.hanzi.length}`)
		).toEqual([]);
	});

	it('carries the tone the syllable is printed with', () => {
		// Neutral tone has no diacritic, so a renderer cannot infer it — that is the whole
		// reason `tone` is carried as data. It still has to agree with what is on the page.
		const wrong: string[] = [];
		for (const word of shipped) {
			for (const syllable of word.syllables ?? []) {
				if (!syllable.py?.trim()) wrong.push(`${label(word)}: empty syllable`);
				else if (printedTone(syllable.py) !== syllable.tone) {
					wrong.push(`${label(word)}: "${syllable.py}" is tone ${printedTone(syllable.py)}`);
				}
			}
		}
		expect(wrong).toEqual([]);
	});

	it('joins back to the pinyin the standard prints', () => {
		const wrong: string[] = [];
		for (const word of shipped) {
			const joined = (word.syllables ?? []).map((syllable) => syllable.py).join('');
			// 谁 and 熟 are printed with two readings ("shéi/shuí"); the card takes the first.
			const printed = word.pinyin.split('/')[0].replace(/[\s'’\-·]/g, '');
			if (joined.toLowerCase() !== printed.toLowerCase()) {
				wrong.push(`${label(word)}: "${joined}" != "${printed}"`);
			}
		}
		expect(wrong).toEqual([]);
	});
});

/* ------------------------------------------------------------------ gates */

/**
 * Content that must never reach a learner-facing gloss, whatever produced it. Kept in step
 * with `FORBIDDEN_GLOSS` in scripts/build-vocab.mjs.
 */
const FORBIDDEN_GLOSS =
	/\b(?:fig|dial|vulg|derog|coll)\.|\b(slang|vulgar|taboo|derogatory|offensive|dialect|figurative|figuratively|variant|erhua|sexual|erotic|porn|pornography|pornographic|homosexual|prostitute|whore|slut|penis|vagina|genitals|genitalia|testicles|damn|damned|goddamn|fuck|fucking|shit|cunt|bastard|bitch)\b/i;

const TONELESS = new Map<string, string>();
for (const [plain, marks] of Object.entries({
	a: 'āáǎà',
	e: 'ēéěè',
	i: 'īíǐì',
	o: 'ōóǒò',
	u: 'ūúǔù',
	u2: 'ǖǘǚǜ'
})) {
	for (const mark of marks) TONELESS.set(mark, plain === 'u2' ? 'u' : plain);
}

/** The word's own pinyin with the tones and the spacing taken off: 包子 becomes "baozi". */
const romanization = (pinyin: string) =>
	[...pinyin.toLowerCase()]
		.map((character) => TONELESS.get(character) ?? character)
		.join('')
		.replace(/ü/g, 'u')
		.replace(/[^a-z]/g, '');

const asLetters = (text: string) => text.toLowerCase().replace(/[^a-z]/g, '');

const NOMINAL_ONLY = ['N', 'Adj', 'Adv'];
const NOUN_SUFFIX = /(tion|sion|ment|ness|ity|ship|ance|ence|ism|ology|ics|ing)$/;

/** A gloss that names a thing rather than an action: "shopping", "a contest", "aviation". */
function isBareNounGloss(text: string): boolean {
	const trimmed = text.trim();
	if (/^to\b/i.test(trimmed)) return false;
	if (/^(a|an|the)\s/i.test(trimmed)) return true;
	const words = trimmed
		.toLowerCase()
		.split(/[\s-]+/)
		.filter(Boolean);
	const head = words[words.length - 1] ?? '';
	if (/^(during|following|regarding|including|according|concerning|owing)$/.test(head))
		return false;
	return NOUN_SUFFIX.test(head);
}

/** Kept in step with `NOT_ADVERB` in scripts/build-vocab.mjs — -ly words that are not adverbs. */
const NOT_ADVERB = new Set(
	`early only ugly silly lovely lonely friendly likely lively timely costly deadly orderly
	 elderly curly burly jolly holy daily weekly monthly yearly hourly nightly quarterly
	 leisurely smelly chilly hilly oily homely manly worldly kindly stately saintly sickly
	 portly scholarly brotherly motherly fatherly sisterly cowardly miserly unruly surly
	 wobbly prickly ghastly godly comely seemly family ally belly jelly rally tally bully
	 folly fly butterfly dragonfly supply reply apply assembly monopoly anomaly melancholy
	 italy july`.split(/\s+/)
);

/** One -ly adverb and nothing else: "recently", "generally", "frequently". */
function isAdverbGloss(text: string): boolean {
	const words = text
		.toLowerCase()
		.split(/[\s-]+/)
		.filter(Boolean);
	return words.length === 1 && /ly$/.test(words[0]) && !NOT_ADVERB.has(words[0]);
}

/** One unmistakable noun: "darkness", "longevity". Never an -ing participle. */
function isNounWordGloss(text: string): boolean {
	const words = text
		.toLowerCase()
		.split(/[\s-]+/)
		.filter(Boolean);
	return words.length === 1 && NOUN_SUFFIX.test(words[0]) && !/ing$/.test(words[0]);
}

/** The gloss the part-of-speech gate reads: the qualifier describes, it does not lead. */
const leadOf = (word: ShippedWord) =>
	(word.meanings[0] ?? '')
		.replace(/\([^)]*\)/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

/** The senses the app's own distractor guard compares on — see src/lib/data/senses.ts. */
const primarySenses = (word: ShippedWord) => senseKeys(word.meanings.slice(0, 1));
/** What the button reads, qualifier and all — the other question senses.ts answers. */
const senseSetKey = (word: ShippedWord) => senseKey(buttonKeys(word.meanings));

describe('gloss gates', () => {
	it('(a) ships no slang, vulgar, dialect, figurative or variant-character gloss', () => {
		// HSK 1's 开车 shipped "to post sexual content online"; 鸟 shipped "damned"; 玻璃 and
		// 鸭子 shipped theirs. All four came from a CC-CEDICT sense that was ranked down and
		// then shipped anyway, with the "(slang)" marker stripped off on the way.
		const bad: string[] = [];
		for (const word of shipped) {
			for (const meaning of word.meanings) {
				const hit = FORBIDDEN_GLOSS.exec(meaning);
				if (hit) bad.push(`${label(word)}: "${meaning}" carries "${hit[0]}"`);
			}
		}
		expect(bad).toEqual([]);
	});

	it('(b) never gives two levels of the same word a gloss that means the same thing', () => {
		// 白, 才, 牛, 火, 头, 称, 好, 多, 一会儿 and 出口 each appear at two levels. Shipping
		// the same sense at both makes the pair indistinguishable to a learner and guarantees
		// that one of the two is wrong for its level. Compared on any shared sense, not on
		// primary-gloss equality: L2 米 "meter" was L3 米's *second* gloss word for word.
		const byWord = new Map<string, ShippedWord[]>();
		for (const word of shipped) {
			const key = `${word.hanzi} ${word.pinyin.toLowerCase()}`;
			byWord.set(key, [...(byWord.get(key) ?? []), word]);
		}
		const clashes: string[] = [];
		for (const [key, group] of byWord) {
			if (group.length < 2) continue;
			const senses = new Map(group.map((word) => [word.id, senseKeys(word.meanings)]));
			for (let i = 0; i < group.length; i++) {
				for (let j = i + 1; j < group.length; j++) {
					const [a, b] = [group[i], group[j]];
					if (a.level === b.level) continue;
					const shared = [...senses.get(a.id)!].filter((sense) => senses.get(b.id)!.has(sense));
					if (shared.length)
						clashes.push(`${key}: L${a.level} and L${b.level} both "${shared[0]}"`);
				}
			}
		}
		expect(clashes).toEqual([]);
	});

	it('(c) never glosses a word with its own romanization', () => {
		// `meanings[0]` is the quiz prompt, so 包子 glossed "baozi" asks "baozi" and answers 包子.
		const bad: string[] = [];
		for (const word of shipped) {
			const rom = romanization(word.pinyin);
			for (const meaning of word.meanings) {
				if (rom && asLetters(meaning) === rom) bad.push(`${label(word)}: "${meaning}"`);
			}
		}
		expect(bad).toEqual([]);
	});

	it('(e) closes every quotation and every qualifier it opens', () => {
		// L3 老百姓 shipped `the "person in the street` — a CC-CEDICT sense truncated inside
		// its own quotation marks — straight onto an answer button. Parentheses now carry the
		// qualifier that resolves a shared sense, so they are held to the same standard:
		// balanced, never nested, never empty, never the whole gloss.
		const bad: string[] = [];
		for (const word of shipped) {
			for (const meaning of word.meanings) {
				if ((meaning.match(/"/g) ?? []).length % 2 || /[\u201c\u201d]/.test(meaning)) {
					bad.push(`${label(word)}: ${JSON.stringify(meaning)}`);
				}
				const opens = (meaning.match(/\(/g) ?? []).length;
				const closes = (meaning.match(/\)/g) ?? []).length;
				const wellFormed =
					opens === closes &&
					!/\([^)]*\(/.test(meaning) &&
					!/\(\s*\)/.test(meaning) &&
					(opens === 0 || meaning.replace(/\([^)]*\)/g, ' ').trim() !== '');
				if (!wellFormed) bad.push(`${label(word)}: ${JSON.stringify(meaning)}`);
			}
		}
		expect(bad).toEqual([]);
	});

	it('(d) leads with a gloss that agrees with the official part of speech', () => {
		// Loop 3 tested two of the four shapes, so an adjective or noun card leading with an
		// adverb shipped green: 最近 [N] "recently", 近来 [N] "recently", 原先 [N] "originally",
		// 一般 [Adj] "generally", 频繁 [Adj] "frequently", 长寿 [Adj] "longevity".
		const bad: string[] = [];
		for (const word of shipped) {
			if (!word.pos.length) continue;
			const lead = leadOf(word);
			if (word.pos.every((code) => NOMINAL_ONLY.includes(code)) && /^to\b/i.test(lead)) {
				bad.push(`${label(word)} [${word.pos.join('/')}]: verb gloss "${lead}"`);
			}
			if (word.pos.length === 1 && word.pos[0] === 'V' && isBareNounGloss(lead)) {
				bad.push(`${label(word)} [V]: noun gloss "${lead}"`);
			}
			if (word.pos.every((code) => code === 'Adj') && isNounWordGloss(lead)) {
				bad.push(`${label(word)} [Adj]: noun gloss "${lead}"`);
			}
			if (word.pos.every((code) => code === 'N' || code === 'Adj') && isAdverbGloss(lead)) {
				bad.push(`${label(word)} [${word.pos.join('/')}]: adverb gloss "${lead}"`);
			}
		}
		expect(bad).toEqual([]);
	});
});

describe('every entry is quizzable', () => {
	it('shows a learner no source notation', () => {
		// ASCII parentheses are the qualifier syntax — "shirt (dress shirt)" — and gate (e)
		// checks they are well formed. The full-width pair only ever arrives from the
		// reference's own notation, so it stays banned, in a gloss as in a headword.
		const notation = /[|｜（）¹²³…∥·[\]{}]/;
		const headwordNotation = /[|｜（）()¹²³…∥·[\]{}]/;
		const leaked = shipped.filter(
			(word) =>
				headwordNotation.test(word.hanzi) ||
				headwordNotation.test(word.pinyin) ||
				/[0-9]/.test(word.hanzi) ||
				/[0-9]/.test(word.pinyin) ||
				word.meanings.some((meaning) => notation.test(meaning))
		);
		expect(leaked.map((word) => `${word.id} ${word.hanzi}`)).toEqual([]);
	});

	it('gives every word one to three short meanings', () => {
		const bad = shipped.filter(
			(word) =>
				word.meanings.length < 1 ||
				word.meanings.length > 3 ||
				word.meanings.some((meaning) => meaning.length === 0 || meaning.length > 34)
		);
		expect(bad.map((word) => `${word.id} ${word.hanzi}: ${word.meanings.join(' | ')}`)).toEqual([]);
	});

	it('never gives two words in a level a primary meaning that reads the same', () => {
		// `meanings[0]` is the text on the answer button, so a shared sense here is a card
		// where the learner presses a button that says exactly what the prompt asked for and
		// is marked wrong. Compared on src/lib/data/senses.ts, which knows that "a shirt or
		// blouse" contains "shirt" — loop 2 compared whole strings and could not see it.
		//
		// A pair that shares the sense but qualifies it on BOTH sides is resolved, not hidden:
		// 衬衫 "shirt (dress shirt)" and 衬衣 "shirt (general word)" still both answer to
		// `shirt`, so the runtime guard still refuses to put them on one card, and the buttons
		// still read differently. Loop 3 resolved 38 of these by moving both cards off the
		// shared word instead, which blinded the guard and deleted the word from search.
		const clashes: string[] = [];
		for (const level of LEVELS) {
			const rows = readShipped(level);
			const senses = new Map(rows.map((word) => [word.id, primarySenses(word)]));
			for (let i = 0; i < rows.length; i++) {
				for (let j = i + 1; j < rows.length; j++) {
					const [a, b] = [rows[i], rows[j]];
					if (!intersects(senses.get(a.id)!, senses.get(b.id)!)) continue;
					const qa = qualifierOf(a.meanings[0] ?? '');
					const qb = qualifierOf(b.meanings[0] ?? '');
					if (qa && qb && qa !== qb) continue;
					clashes.push(`L${level}: ${a.hanzi} "${a.meanings[0]}" / ${b.hanzi} "${b.meanings[0]}"`);
				}
			}
		}
		expect(clashes).toEqual([]);
	});

	it('keeps every qualified pair visible to the runtime distractor guard', () => {
		// The point of qualifying rather than replacing: the shared sense is still there, so
		// `isAmbiguousWith` in src/lib/session/distractors.ts still refuses the pair, and
		// /browse/1?q=hear still finds 听见. Each row is a collision loop 3 concealed.
		const pairs: [string, string, string][] = [
			['听见', '听到', 'hear'],
			['看见', '看到', 'see'],
			['衬衫', '衬衣', 'shirt'],
			['可是', '但是', 'but'],
			['该', '应该', 'should'],
			['孩子', '小朋友', 'child'],
			['植物', '种', 'plant'],
			['法', '法律', 'law']
		];
		const broken: string[] = [];
		for (const [left, right, sense] of pairs) {
			const a = shipped.find((word) => word.hanzi === left && senseKeys(word.meanings).has(sense));
			const b = shipped.find((word) => word.hanzi === right && senseKeys(word.meanings).has(sense));
			if (!a || !b) {
				broken.push(`${left}/${right}: "${sense}" is gone from one of the pair`);
				continue;
			}
			if (a.level !== b.level) broken.push(`${left}/${right}: not the same level`);
			if (!intersects(senseKeys(a.meanings), senseKeys(b.meanings))) {
				broken.push(`${left}/${right}: the guard can no longer see the shared sense`);
			}
			if (qualifierOf(a.meanings[0]) === qualifierOf(b.meanings[0])) {
				broken.push(`${left}/${right}: nothing on the button tells them apart`);
			}
		}
		expect(broken).toEqual([]);
	});

	it('never gives two words in a level the same set of meanings', () => {
		// L2 平常/普通, L3 根本/基本, L4 纯/单纯 and L5 此刻/此时 each shipped one identical
		// meaning set in two orders, which satisfied a primary-gloss-only test on purpose.
		const clashes: string[] = [];
		for (const level of LEVELS) {
			const seen = new Map<string, ShippedWord>();
			for (const word of readShipped(level)) {
				const key = senseSetKey(word);
				const other = seen.get(key);
				if (other) clashes.push(`L${level} "${key}": ${other.hanzi} / ${word.hanzi}`);
				else seen.set(key, word);
			}
		}
		expect(clashes).toEqual([]);
	});

	it('has a unique id per entry', () => {
		expect(new Set(shipped.map((word) => word.id)).size).toBe(shipped.length);
	});
});

describe('gloss survival', () => {
	// Gate (f) in scripts/build-vocab.mjs: a card has to still say what the reference says the
	// word means. Deriving the reference's short senses again here would be a second copy of
	// the CC-CEDICT reader, so `is exactly what scripts/build-vocab.mjs produces` above is what
	// re-runs the gate. What this block owns is the part a rebuild cannot check — the reviewed
	// exemption list, and the words the loop-3 verdict named as the ones it must never cover.
	const allow = JSON.parse(readFileSync('scripts/gloss-survival-allow.json', 'utf8')) as Record<
		string,
		unknown
	>;

	it('gives every exemption an official id and a one-line reason', () => {
		const bad: string[] = [];
		for (const [id, note] of Object.entries(allow)) {
			if (!/^L[1-5]-\d{4}$/.test(id)) bad.push(`${id}: not an official row id`);
			else if (!byOfficialId.has(id)) bad.push(`${id}: no shipped card`);
			if (typeof note !== 'string' || !note.trim()) bad.push(`${id}: no reason`);
		}
		expect(bad).toEqual([]);
	});

	it('never exempts a word whose own English is the thing at stake', () => {
		// Loop 3 shipped 听见 as "to catch a sound" and 衬衣 as "underclothes" to dodge a
		// same-level collision. The gate exists to catch that class; exempting one of these
		// would be the concealment again, one file further down.
		const named: [string, string][] = [
			['L1-0363', 'hear'],
			['L3-0087', 'shirt'],
			['L2-0172', 'should'],
			['L2-0321', 'but'],
			['L1-0404', 'child'],
			['L2-0458', 'all'],
			['L4-0953', 'plant'],
			['L4-0222', 'law']
		];
		const bad: string[] = [];
		for (const [id, word] of named) {
			if (id in allow) bad.push(`${id}: exempted from gate (f), which it may never be`);
			const card = byOfficialId.get(id)!;
			const words = new Set([...senseKeys(card.meanings)].flatMap((sense) => sense.split(' ')));
			if (!words.has(word)) bad.push(`${id} ${card.hanzi}: no longer says "${word}"`);
		}
		expect(bad).toEqual([]);
	});
});

describe('example sentences', () => {
	// Gate (g) in scripts/build-vocab.mjs. Duplicated here for the same reason as the gloss
	// gates: the build gate stops a bad sentence being written, this one stops a bad sentence
	// being checked in by hand or surviving a build nobody re-ran. `example` stays optional on
	// `Word` even now that every card carries one, so the per-sentence assertions below still
	// run over the ones that exist and coverage is asserted separately.
	const SENTENCE_PUNCT = /[，。！？]/;
	const SENTENCE_HAN = /[㐀-鿿豈-﫿]/;
	const sentenceChars = (hanzi: string) =>
		[...hanzi].filter((character) => !SENTENCE_PUNCT.test(character));

	/** The same nesting sets the build derives: allowed at L if written at L or below. */
	const allowedAt = new Map<Level, Set<string>>();
	{
		let seen = new Set<string>();
		for (const level of LEVELS) {
			for (const word of shipped) {
				if (word.level !== level) continue;
				for (const character of word.hanzi) if (SENTENCE_HAN.test(character)) seen.add(character);
			}
			allowedAt.set(level, new Set(seen));
			seen = new Set(seen);
		}
	}

	const withExample = shipped.filter((word) => word.example);

	it('ships a sentence for every card at every level', () => {
		const perLevel = Object.fromEntries(
			LEVELS.map((level) => [level, withExample.filter((word) => word.level === level).length])
		);
		expect(perLevel).toEqual({ 1: 500, 2: 770, 3: 969, 4: 999, 5: 1070 });
		expect(withExample.length).toBe(shipped.length);
	});

	it('leaves the field off entirely where no sentence was authored', () => {
		// `example` is optional on `Word`, and nothing in the app may assume it is there. An
		// empty object or empty strings would satisfy a naive truthiness check and then render
		// as a blank row, so a card without a sentence carries no key at all.
		const empty = shipped.filter((word) => 'example' in word && !word.example?.hanzi?.trim());
		expect(empty.map(label)).toEqual([]);
	});

	it('gives every sentence all three fields', () => {
		const bad = withExample.filter(
			(word) =>
				!word.example!.hanzi.trim() || !word.example!.pinyin.trim() || !word.example!.english.trim()
		);
		expect(bad.map(label)).toEqual([]);
	});

	it('writes every sentence in characters at or below its own card level', () => {
		// The whole point of a per-level example: an HSK 1 card explained with an HSK 5
		// character swaps one unknown word for two.
		const bad: string[] = [];
		for (const word of withExample) {
			const allowed = allowedAt.get(word.level)!;
			const above = [
				...new Set(
					sentenceChars(word.example!.hanzi).filter(
						(character) => SENTENCE_HAN.test(character) && !allowed.has(character)
					)
				)
			];
			if (above.length)
				bad.push(`${label(word)}: "${word.example!.hanzi}" uses ${above.join(' ')}`);
		}
		expect(bad).toEqual([]);
	});

	it('prints one pinyin syllable per character', () => {
		// Erhua is one token per character — `wán r`, matching the card's own `syllables`.
		const bad: string[] = [];
		for (const word of withExample) {
			const characters = sentenceChars(word.example!.hanzi).length;
			const syllables = word.example!.pinyin.trim().split(/\s+/).filter(Boolean).length;
			if (characters !== syllables) {
				bad.push(`${label(word)}: ${characters} character(s), ${syllables} syllable(s)`);
			}
		}
		expect(bad).toEqual([]);
	});

	it('carries no punctuation in the pinyin', () => {
		// The headword's own `pinyin` never carries any, and the authors split two to one on
		// whether a sentence's should, so the build strips it rather than shipping both styles.
		const bad = withExample.filter((word) => /[.,!?;:]/.test(word.example!.pinyin));
		expect(bad.map(label)).toEqual([]);
	});

	it('writes the sentence in hanzi and full-width punctuation only', () => {
		const bad: string[] = [];
		for (const word of withExample) {
			const stray = sentenceChars(word.example!.hanzi).filter(
				(character) => !SENTENCE_HAN.test(character)
			);
			if (stray.length) bad.push(`${label(word)}: "${stray.join('')}"`);
		}
		expect(bad).toEqual([]);
	});

	it('actually uses the word it is an example of', () => {
		const bad = withExample.filter((word) => !word.example!.hanzi.includes(word.hanzi));
		expect(bad.map((word) => `${label(word)}: ${word.example!.hanzi}`)).toEqual([]);
	});

	it('keeps every sentence short enough to read on a card', () => {
		const bad = withExample
			.map((word) => ({ word, length: sentenceChars(word.example!.hanzi).length }))
			.filter(({ length }) => length > 20);
		expect(bad.map(({ word, length }) => `${label(word)}: ${length}`)).toEqual([]);
	});

	it('never lets two files author the same card, or author a card that does not exist', () => {
		// The merge in scripts/build-vocab.mjs is order-independent across 26 authors, so a
		// second sentence for one id is a build failure rather than a last-writer-wins.
		const dir = 'scripts/sentences';
		const owner = new Map<string, string>();
		const bad: string[] = [];
		for (const file of readdirSync(dir).filter((name) => name.endsWith('.json'))) {
			const parsed = JSON.parse(readFileSync(join(dir, file), 'utf8')) as Record<string, unknown>;
			for (const id of Object.keys(parsed)) {
				if (owner.has(id)) bad.push(`${id}: ${owner.get(id)} and ${file}`);
				else owner.set(id, file);
				if (!byOfficialId.has(id)) bad.push(`${id}: no such card (${file})`);
			}
		}
		expect(bad).toEqual([]);
		expect(owner.size).toBe(withExample.length);
	});

	it('ships exactly what the authors wrote, sentence for sentence', () => {
		// The pinyin is normalised on the way through; the hanzi and the English are not, and
		// a build that quietly rewrote either would be a build that edits an author's work.
		const dir = 'scripts/sentences';
		const authored = new Map<string, { hanzi: string; english: string }>();
		for (const file of readdirSync(dir).filter((name) => name.endsWith('.json'))) {
			const parsed = JSON.parse(readFileSync(join(dir, file), 'utf8')) as Record<
				string,
				{ hanzi: string; english: string }
			>;
			for (const [id, value] of Object.entries(parsed)) authored.set(id, value);
		}
		const bad: string[] = [];
		for (const word of withExample) {
			const source = authored.get(word.id);
			if (!source) bad.push(`${label(word)}: shipped an example nobody authored`);
			else if (source.hanzi.trim() !== word.example!.hanzi)
				bad.push(`${label(word)}: hanzi differs`);
			else if (source.english.trim() !== word.example!.english) {
				bad.push(`${label(word)}: english differs`);
			}
		}
		expect(bad).toEqual([]);
	});
});

describe('level sizes', () => {
	it('covers the official count at every level', () => {
		for (const level of LEVELS) {
			expect(readOfficial(level)).toHaveLength(LEVEL_SIZES[level]);
		}
	});

	it('ships the official count minus only the merged homographs', () => {
		for (const level of LEVELS) {
			const rows = readShipped(level);
			const merged = rows.reduce((sum, word) => sum + ((word.ids?.length ?? 1) - 1), 0);
			expect(rows.length + merged).toBe(LEVEL_SIZES[level]);
		}
	});

	// `SHIPPED_SIZES` is what the level cards, the browse header and the summary arc all count
	// with. It is written out rather than derived, so that a screen can name a count without
	// loading 640KB of JSON — which makes this the test that stops it drifting from the box.
	it('matches the counts the screens are built on', () => {
		const actual = Object.fromEntries(LEVELS.map((level) => [level, readShipped(level).length]));
		expect(actual).toEqual(SHIPPED_SIZES);
		expect(SHIPPED_TOTAL).toBe(shipped.length);
	});
});
