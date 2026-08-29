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
import { intersects, senseKey, senseKeys } from '$lib/data/senses';
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

/** The senses the app's own distractor guard compares on — see src/lib/data/senses.ts. */
const primarySenses = (word: ShippedWord) => senseKeys(word.meanings.slice(0, 1));
const senseSetKey = (word: ShippedWord) => senseKey(senseKeys(word.meanings));

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

	it('(e) closes every quotation it opens', () => {
		// L3 老百姓 shipped `the "person in the street` — a CC-CEDICT sense truncated inside
		// its own quotation marks — straight onto an answer button.
		const bad: string[] = [];
		for (const word of shipped) {
			for (const meaning of word.meanings) {
				if ((meaning.match(/"/g) ?? []).length % 2 || /[\u201c\u201d]/.test(meaning)) {
					bad.push(`${label(word)}: ${JSON.stringify(meaning)}`);
				}
			}
		}
		expect(bad).toEqual([]);
	});

	it('(d) leads with a gloss that agrees with the official part of speech', () => {
		const bad: string[] = [];
		for (const word of shipped) {
			if (!word.pos.length) continue;
			const lead = word.meanings[0] ?? '';
			if (word.pos.every((code) => NOMINAL_ONLY.includes(code)) && /^to\b/i.test(lead)) {
				bad.push(`${label(word)} [${word.pos.join('/')}]: verb gloss "${lead}"`);
			}
			if (word.pos.length === 1 && word.pos[0] === 'V' && isBareNounGloss(lead)) {
				bad.push(`${label(word)} [V]: noun gloss "${lead}"`);
			}
		}
		expect(bad).toEqual([]);
	});
});

describe('every entry is quizzable', () => {
	it('shows a learner no source notation', () => {
		const notation = /[|｜（）()¹²³…∥·[\]{}]/;
		const leaked = shipped.filter(
			(word) =>
				notation.test(word.hanzi) ||
				notation.test(word.pinyin) ||
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

	it('never gives two words in a level a primary meaning that means the same thing', () => {
		// `meanings[0]` is the text on the answer button, so a shared sense here is a card
		// where the learner presses a button that says exactly what the prompt asked for and
		// is marked wrong. Compared on src/lib/data/senses.ts, which knows that "a shirt or
		// blouse" contains "shirt" — loop 2 compared whole strings and could not see it.
		const clashes: string[] = [];
		for (const level of LEVELS) {
			const rows = readShipped(level);
			const senses = new Map(rows.map((word) => [word.id, primarySenses(word)]));
			for (let i = 0; i < rows.length; i++) {
				for (let j = i + 1; j < rows.length; j++) {
					const [a, b] = [rows[i], rows[j]];
					if (!intersects(senses.get(a.id)!, senses.get(b.id)!)) continue;
					clashes.push(`L${level}: ${a.hanzi} "${a.meanings[0]}" / ${b.hanzi} "${b.meanings[0]}"`);
				}
			}
		}
		expect(clashes).toEqual([]);
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
