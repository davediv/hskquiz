/**
 * ORTHOGRAPHY. The one thing a Chinese typography system cannot get wrong.
 *
 * `<Pinyin>` colours one syllable at a time, which means it takes a reading apart and puts it
 * back together on every render. How it puts it back is not a style choice — it is a spelling.
 * 汉语拼音正词法基本规则 (GB/T 16159) sets pinyin by WORD: 爱好 is `àihào`, 北京 `Běijīng`,
 * 那儿 `nàr`, 方案 `fāng'àn`, 五颜六色 `wǔyán-liùsè`.
 *
 * THERE ARE TWO READINGS AND THEY FAILED FOR OPPOSITE REASONS.
 *
 * A HEADWORD arrives already spelled. `Word.pinyin` is the official list's own string, so the
 * only way to get it wrong is to destroy it, which the old renderer did by re-joining with one
 * space per syllable — `ài hào`, `Běi jīng`, `nà r`, `fāng àn` — on 3,095 of the 4,308 shipped
 * words. The fix was to stop re-joining and print the source, and the assertion for it is
 * FIDELITY: what the spans concatenate to IS `Word.pinyin`, character for character.
 *
 * An EXAMPLE SENTENCE arrives NOT spelled. `Example.pinyin` ships one bare syllable per
 * character and no punctuation — `xià tiān dào le tiān qì yuè lái yuè rè` under a hanzi line
 * reading 夏天到了，天气越来越热。 — so fidelity to it is not a virtue, it is the bug. Loop 5
 * shipped a guard that asserted the sentence spans re-concatenate to `example.pinyin`; it went
 * green on all 4,308 sentences *because* the renderer faithfully reproduced a string in no
 * orthography at all, and it could not have failed however the sentence was spelled. A card
 * printed `xiàtiān` on its headword line and `Xià tiān` 25px below it, and 479 sentences threw
 * their comma away, while 61 tests passed.
 *
 * So the sentence assertions below are ORTHOGRAPHY assertions, and every one of them is a
 * property the misspelling could not satisfy:
 *
 *   1. FEWER TOKENS THAN CHARACTERS. A sentence with any multi-character word in it must print
 *      fewer gaps than it has hanzi. Atomised pinyin prints exactly as many; it can never pass.
 *   2. THE PUNCTUATION THE HANZI WRITES. Every ， on the hanzi line is a `,` on the pinyin line,
 *      and every 。？！ its Latin stop. Atomised pinyin has none of them.
 *   3. ONE WORD, ONE SPELLING, ONE SCREEN. Where a word appears inside its own example, the
 *      sentence spells it the way the headword line above it does. This is the assertion the
 *      loop-5 kill shot would have failed: 夏天 / `Xià tiān` in one viewport.
 *   4. THE LEXICON IS THE CORPUS. Every spelling `orthography.ts` joins with came out of
 *      `src/lib/data/hsk{1..5}.json`, so no second opinion about Chinese orthography can enter
 *      the app through the design system.
 *
 * And the call-site ratchet from loop 4 stays: `spaced` is ruby-only, and no `.svelte` file
 * outside the allowlist may turn per-syllable spacing back on.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Level, Syllable, Word } from '$lib/types';
import { LEVELS } from '$lib/types';
import { lexiconSize, wordOf } from './lexicon';
import { joinBySound, spellSentence } from './orthography';
import {
	layoutPinyin,
	resolveSyllables,
	segmentPinyin,
	sentenceCase,
	sourceSeparators
} from './tone';

const ROOT = process.cwd();

function level(n: Level): Word[] {
	return JSON.parse(readFileSync(`${ROOT}/src/lib/data/hsk${n}.json`, 'utf8')) as Word[];
}

const CORPUS: Word[] = LEVELS.flatMap(level);
const MULTI: Word[] = CORPUS.filter((word) => word.syllables.length > 1);

/** What `<Pinyin>` prints for a word, assembled exactly the way the component assembles it. */
function render(word: Pick<Word, 'pinyin' | 'syllables'>, spaced = false): string {
	const list = resolveSyllables(word.syllables, word.pinyin);
	return layoutPinyin(word.pinyin, list, spaced)
		.map((part) => part.text)
		.join('');
}

const gaps = (text: string): number => (text.match(/\s/gu) ?? []).length;

describe('the printed reading is the shipped string', () => {
	it('round-trips every word in the corpus, character for character', () => {
		const wrong = CORPUS.filter((word) => render(word) !== word.pinyin).map(
			(word) => `${word.hanzi}: ${word.pinyin} -> ${render(word)}`
		);
		expect({ wrong, checked: CORPUS.length }).toEqual({ wrong: [], checked: 4308 });
	});

	it('never invents a word gap the source does not write', () => {
		const extra = CORPUS.filter((word) => gaps(render(word)) > gaps(word.pinyin));
		expect(extra.map((word) => word.hanzi)).toEqual([]);
	});

	it('keeps the apostrophes and hyphens the list writes between syllables', () => {
		const kept = { space: 0, apostrophe: 0, hyphen: 0 };
		for (const word of CORPUS) {
			const list = resolveSyllables(word.syllables, word.pinyin);
			for (const sep of sourceSeparators(word.pinyin, list) ?? []) {
				if (sep.includes(' ')) kept.space += 1;
				if (sep.includes("'")) kept.apostrophe += 1;
				if (sep.includes('-')) kept.hyphen += 1;
			}
		}
		// The old renderer printed a space for every one of these and kept none of the marks.
		expect(kept.apostrophe).toBe(24);
		expect(kept.hyphen).toBe(8);
		expect(kept.space).toBeGreaterThan(0);
	});

	it('writes erhua onto the syllable it belongs to', () => {
		const erhua = CORPUS.filter((word) => word.syllables.some((s, i) => i > 0 && s.py === 'r'));
		const split = erhua.filter((word) => / r\b/u.test(render(word)));
		expect(split.map((word) => word.hanzi)).toEqual([]);
		expect(erhua.length).toBeGreaterThan(30);
	});

	it('spells the words the loop-4 verdict named', () => {
		const pick = (hanzi: string): string => {
			const word = CORPUS.find((w) => w.hanzi === hanzi);
			if (word === undefined) throw new Error(`${hanzi} is not in the corpus`);
			return render(word);
		};
		expect({
			爱好: pick('爱好'),
			白天: pick('白天'),
			杯子: pick('杯子'),
			北京: pick('北京'),
			爱心: pick('爱心'),
			安排: pick('安排'),
			哪儿: pick('哪儿')
		}).toEqual({
			爱好: 'àihào',
			白天: 'báitiān',
			杯子: 'bēizi',
			北京: 'Běijīng',
			爱心: 'àixīn',
			安排: 'ānpái',
			哪儿: 'nǎr'
		});
	});

	it('measures how much of the corpus the old default misspelled', () => {
		const changed = CORPUS.filter((word) => render(word, true) !== render(word));
		const share = Math.round((changed.length / CORPUS.length) * 1000) / 10;
		// 3,287 of the 4,308 shipped words (76.3%) at the time of writing: every one of them
		// came out wrong under the old one-gap-per-syllable default. The count rides on the
		// corpus, so what is guarded is the floor.
		expect({ over3000: changed.length > 3000, over70pc: share > 70 }).toEqual({
			over3000: true,
			over70pc: true
		});
	});
});

/* ------------------------------------------------------- 2. the sentence, spelled by word */

const HAN = /\p{Script=Han}/u;

interface Sentence {
	word: Word;
	hanzi: string;
	source: string;
	/** What `<Pinyin sentence={example.hanzi}>` prints — the quiz card and the summary card. */
	printed: string;
	/** Hanzi characters that carry a syllable. */
	chars: number;
}

const SENTENCES: Sentence[] = CORPUS.flatMap((word) => {
	const example = word.example;
	if (example === undefined) return [];
	const parts = spellSentence(example.hanzi, example.pinyin);
	return [
		{
			word,
			hanzi: example.hanzi,
			source: example.pinyin,
			printed: parts === null ? example.pinyin : parts.map((part) => part.text).join(''),
			chars: [...example.hanzi].filter((glyph) => HAN.test(glyph)).length
		}
	];
});

const tokens = (text: string): number => text.trim().split(/\s+/u).length;

describe('example sentences are set as words, not as syllables', () => {
	it('spells every sentence in the corpus', () => {
		const unspelled = SENTENCES.filter((s) => spellSentence(s.hanzi, s.source) === null);
		expect({ unspelled: unspelled.map((s) => s.hanzi), of: SENTENCES.length }).toEqual({
			unspelled: [],
			of: 4308
		});
	});

	it('never prints more tokens than the hanzi has characters', () => {
		const grew = SENTENCES.filter((s) => tokens(s.printed) > s.chars);
		expect(grew.map((s) => `${s.hanzi} -> ${s.printed}`)).toEqual([]);
	});

	it('prints strictly fewer tokens than characters wherever a word is longer than one', () => {
		// The only sentences that legitimately print one token per character are the ones built
		// entirely from one-character words — 我爱你。is `Wǒ ài nǐ.`, three of each, and joining
		// anything there would be the error. Everything else must lose gaps.
		const flat = SENTENCES.filter((s) => tokens(s.printed) === s.chars);
		// A word only removes a gap if the list spells it joined: 是不是 is `shì bu shì` in the
		// official list and keeps both of its gaps, so a sentence built from words like that is
		// legitimately one token per character.
		const closes = (hanzi: string): boolean =>
			wordOf(hanzi)?.joins.some((join) => !/\s/u.test(join)) === true;
		const wrong = flat.filter((s) =>
			[...s.hanzi].some((_, i, all) => [2, 3, 4].some((n) => closes(all.slice(i, i + n).join(''))))
		);
		expect(wrong.map((s) => `${s.hanzi} -> ${s.printed}`)).toEqual([]);
	});

	it('prints a quarter fewer tokens than the sentences have characters', () => {
		// The number the loop-5 screenshots failed on. One token per character is what atomised
		// pinyin prints and what every sentence in the app printed; the printed line now runs
		// well under that, and the share is reported so a regression toward 100% is visible.
		const characters = SENTENCES.reduce((n, s) => n + s.chars, 0);
		const printed = SENTENCES.reduce((n, s) => n + tokens(s.printed), 0);
		const fromSource = SENTENCES.reduce((n, s) => n + tokens(s.source), 0);
		expect({
			characters,
			overCharacters: printed > characters,
			// How many gaps this module closes that the build left open. It should fall towards
			// zero as `build-vocab.mjs` spells more of `example.pinyin` itself.
			closedHere: fromSource - printed >= 0,
			share: Math.round((printed / characters) * 1000) / 10 < 80
		}).toEqual({ characters, overCharacters: false, closedHere: true, share: true });
	});

	it('writes every comma the hanzi writes', () => {
		const withComma = SENTENCES.filter((s) => /[，、]/u.test(s.hanzi));
		const dropped = withComma.filter(
			(s) => (s.printed.match(/,/gu) ?? []).length !== (s.hanzi.match(/[，、]/gu) ?? []).length
		);
		expect({ dropped: dropped.map((s) => s.hanzi), of: withComma.length }).toEqual({
			dropped: [],
			of: 479
		});
	});

	it('ends on the stop the hanzi ends on', () => {
		const STOP: Record<string, string> = { '。': '.', '？': '?', '！': '!' };
		const wrong = SENTENCES.filter((s) => {
			const stop = STOP[s.hanzi.trim().slice(-1)];
			return stop !== undefined && !s.printed.endsWith(stop);
		});
		expect(wrong.map((s) => s.hanzi)).toEqual([]);
	});

	it('opens on a capital', () => {
		const lower = SENTENCES.filter((s) => s.printed[0] !== s.printed[0].toUpperCase());
		expect(lower.map((s) => s.printed)).toEqual([]);
	});

	it('prints the same syllables the source does, in the same order', () => {
		// Joining is allowed to remove gaps and add punctuation; it is not allowed to change,
		// drop or invent a syllable.
		const bare = (text: string): string => text.replace(/[\s.,?!;:'’—…-]/gu, '').toLowerCase();
		const altered = SENTENCES.filter((s) => bare(s.printed) !== bare(s.source));
		expect(altered.map((s) => `${s.source} -> ${s.printed}`)).toEqual([]);
	});

	it('spells a word the same way in its sentence as on the headword line above it', () => {
		// The loop-5 kill shot: 夏天 set `xiàtiān` in the headword and `Xià tiān` in the sentence
		// card 25 CSS-px below it. Measured over every word that appears in its own example.
		const inOwnSentence = SENTENCES.filter(
			(s) => s.word.syllables.length > 1 && s.hanzi.includes(s.word.hanzi)
		);
		const disagree = inOwnSentence.filter(
			(s) => !s.printed.toLowerCase().includes(s.word.pinyin.toLowerCase())
		);
		const share = Math.round((1 - disagree.length / inOwnSentence.length) * 1000) / 10;
		// The stragglers are genuine segmentation ambiguities — 十分钟 reads as 十分 + 钟, 书包含
		// as 书包 + 含 — where two real words of the list overlap and the character sequence alone
		// cannot separate them. Under 0.5% of the corpus, and both readings are words.
		expect({ of: inOwnSentence.length, share: share >= 99 }).toEqual({ of: 3372, share: true });
		expect(disagree.length).toBeLessThanOrEqual(20);
	});

	it('sets the sentences the loop-5 verdict named', () => {
		const set = (hanzi: string): string => {
			const found = SENTENCES.find((s) => s.hanzi === hanzi);
			if (found === undefined) throw new Error(`${hanzi} is not a shipped sentence`);
			return found.printed;
		};
		expect({
			夏天: set('夏天到了，天气越来越热。'),
			如果: set('如果明天下雨，我就不去了。')
		}).toEqual({
			夏天: 'Xiàtiān dào le, tiānqì yuè lái yuè rè.',
			如果: 'Rúguǒ míngtiān xià yǔ, wǒ jiù bú qù le.'
		});
	});

	it('keeps every join the build wrote, and only closes what it left open', () => {
		// The source has the first word. Where `example.pinyin` spells 夏天 `xiàtiān` the join is
		// kept; where it still writes `xià tiān`, the lexicon closes it to the same thing. The
		// two readings of one sentence therefore come out identical, which is what makes a
		// better build show up here as this module doing LESS, not something different.
		const text = (parts: { text: string }[] | null): string =>
			parts === null ? 'NULL' : parts.map((part) => part.text).join('');
		expect({
			joined: text(
				spellSentence('夏天到了，天气越来越热。', 'xiàtiān dào le tiānqì yuè lái yuè rè')
			),
			atomised: text(
				spellSentence('夏天到了，天气越来越热。', 'xià tiān dào le tiān qì yuè lái yuè rè')
			)
		}).toEqual({
			joined: 'Xiàtiān dào le, tiānqì yuè lái yuè rè.',
			atomised: 'Xiàtiān dào le, tiānqì yuè lái yuè rè.'
		});
	});

	it('declines a reading it cannot line up with the characters', () => {
		// Rather than print a confidently mispunctuated line it hands back nothing, and
		// `<Pinyin>` prints the source string instead.
		expect(spellSentence('好。', 'hǎo hǎo hǎo')).toBe(null);
	});
});

/* ---------------------------------------------------- 3. the lexicon is the corpus itself */

describe('the word list the joins come from', () => {
	it('holds every multi-syllable word the app ships', () => {
		const missing = MULTI.filter((word) => wordOf(word.hanzi) === undefined);
		expect({ missing: missing.map((word) => word.hanzi), size: lexiconSize() }).toEqual({
			missing: [],
			size: 3363
		});
	});

	it('spells each of them the way the corpus does — no second opinion', () => {
		// Five characters carry two readings in the list (实在 `shízai` and `shízài`, 地方
		// `dìfāng` and `dìfang`), so the table holds one of them; what it may never do is hold
		// a spelling the corpus does not write. A generated file: when this fails, regenerate
		// it from `src/lib/data/hsk{1..5}.json` — the recipe is at the top of `lexicon.ts`.
		const readings = new Map<string, Set<string>>();
		for (const word of MULTI) {
			const seen = readings.get(word.hanzi) ?? new Set<string>();
			seen.add(word.pinyin);
			readings.set(word.hanzi, seen);
		}
		const invented = [...readings].flatMap(([hanzi, spellings]) => {
			const held = wordOf(hanzi)?.pinyin;
			if (held !== undefined && spellings.has(held)) return [];
			return [`${hanzi}: corpus ${[...spellings].join(' / ')}, lexicon ${held ?? 'MISSING'}`];
		});
		expect(invented).toEqual([]);
	});

	it('carries the joins, gaps, apostrophes and capitals the list writes', () => {
		const joins = (hanzi: string): string[] => wordOf(hanzi)?.joins ?? ['MISSING'];
		expect({
			夏天: joins('夏天'),
			越来越: joins('越来越'),
			女儿: joins('女儿'),
			哪儿: joins('哪儿'),
			北京: wordOf('北京')?.proper
		}).toEqual({
			夏天: [''],
			越来越: [' ', ' '],
			女儿: ["'"],
			哪儿: [''],
			北京: true
		});
	});
});

/* --------------------------------------- 4. the reading a caller holds no characters for */

describe('syllables with no string to read', () => {
	it('joins what the word list recognises, by sound', () => {
		const say = (pinyin: string): string =>
			joinBySound(segmentPinyin(pinyin))
				.map((part) => part.text)
				.join('');
		expect({
			爱好: say('ài hào'),
			我们: say('wǒ men'),
			两个词: say('wǒ ài nǐ')
		}).toEqual({ 爱好: 'àihào', 我们: 'wǒmen', 两个词: 'wǒ ài nǐ' });
	});

	it('still attaches erhua when there is no source either', () => {
		const list: Syllable[] = [
			{ py: 'nǎ', tone: 3 },
			{ py: 'r', tone: 0 }
		];
		const run = joinBySound(list);
		expect({ text: run.map((part) => part.text).join(''), tone: run[1].tone }).toEqual({
			text: 'nǎr',
			tone: 3
		});
	});

	it('prints the browse sheet the headword spelling its own entry shows', () => {
		// The sheet marks the headword inside its own sentence, so it hands `<Pinyin>` the
		// sentence in runs — `[ài, hào]` alone, no string and no characters. It used to print
		// `ài hào` under an entry headed `àihào`.
		const marked = MULTI.filter((word) => word.example?.hanzi.includes(word.hanzi) === true);
		const wrong = marked.filter((word) => {
			const run = word.syllables.map((s) => ({ py: s.py.toLowerCase(), tone: s.tone }));
			const printed = joinBySound(run)
				.map((part) => part.text)
				.join('');
			return printed.toLowerCase() !== word.pinyin.toLowerCase();
		});
		// The stragglers are homographs: two words of the list are written with the same toned
		// syllables and spelled differently (地方 `dìfāng` and 地方 `dìfang`), and a caller that
		// hands over sound alone has said nothing that could tell them apart. Under 0.5%, and
		// the reason the sentence call sites pass their characters instead.
		const share = Math.round((1 - wrong.length / marked.length) * 1000) / 10;
		expect({ of: marked.length, share: share >= 99 }).toEqual({ of: 3372, share: true });
	});

	it('never prints more tokens than it was handed syllables', () => {
		const grew = SENTENCES.filter((s) => {
			const list = segmentPinyin(s.source);
			const run = joinBySound(list)
				.map((part) => part.text)
				.join('');
			return tokens(run) > list.length;
		});
		expect(grew.map((s) => s.source)).toEqual([]);
	});
});

describe('the capital and the stop', () => {
	it('sets a sentence with a capital and the stop its hanzi writes', () => {
		const run = (hanzi: string, pinyin: string): string =>
			sentenceCase(layoutPinyin(pinyin, segmentPinyin(pinyin), false), hanzi)
				.map((part) => part.text)
				.join('');
		expect({
			full: run('我爱我的爸爸妈妈。', 'wǒ ài wǒ de bà ba mā ma'),
			ask: run('你好吗？', 'nǐ hǎo ma'),
			bang: run('太好了！', 'tài hǎo le')
		}).toEqual({
			full: 'Wǒ ài wǒ de bà ba mā ma.',
			ask: 'Nǐ hǎo ma?',
			bang: 'Tài hǎo le!'
		});
	});

	it('does not double a stop it already has', () => {
		const once = sentenceCase(layoutPinyin('hǎo.', segmentPinyin('hǎo.'), false), '好。');
		expect(once.map((part) => part.text).join('')).toBe('Hǎo.');
	});
});

/* ---------------------------------------------------------------- 5. the call-site ratchet */

/**
 * `spaced` positions one syllable over one character. A file may pass it only if it is doing
 * that, and each entry says which construct earns it. An empty list is the correct state: the
 * two ruby sites in the repo both hand `<Pinyin>` a single syllable, where the flag is a no-op.
 */
const RUBY: readonly string[] = [];

function walk(dir: string): string[] {
	const found: string[] = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) found.push(...walk(full));
		else if (entry.endsWith('.svelte')) found.push(full);
	}
	return found.sort();
}

const strip = (text: string): string =>
	text.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/<!--[\s\S]*?-->/gu, '');

const SVELTE = walk(join(ROOT, 'src')).map((full) => ({
	path: relative(ROOT, full).replaceAll('\\', '/'),
	code: strip(readFileSync(full, 'utf8'))
}));

/** Every `<Pinyin ...>` tag in the repo, with the attribute text it carries. */
const CALL_SITES = SVELTE.flatMap(({ path, code }) =>
	[...code.matchAll(/<Pinyin\b([^>]*)\/?>/gu)].map((match) => ({ path, attrs: match[1] }))
);

describe('call sites', () => {
	it('finds the ones that render pinyin', () => {
		expect(CALL_SITES.length).toBeGreaterThanOrEqual(16);
	});

	it('lets nobody turn per-syllable spacing back on outside a ruby layout', () => {
		const optedIn = CALL_SITES.filter(
			({ attrs }) => /\bspaced\b/u.test(attrs) && !/spaced=\{false\}/u.test(attrs)
		).map(({ path }) => path);
		expect(optedIn.filter((path) => !RUBY.includes(path))).toEqual([]);
	});

	it('keeps the component defaulting to the source string, not to per-syllable gaps', () => {
		const component = readFileSync(`${ROOT}/src/lib/design/Pinyin.svelte`, 'utf8');
		expect(/\n\t\tspaced = false,/u.test(strip(component))).toBe(true);
	});

	it('routes every sentence call site through the sentence orthography', () => {
		// A `<Pinyin>` that renders `example.pinyin` and does NOT pass the sentence's hanzi gets
		// no word boundaries and no punctuation — it prints the atomised source. There is no
		// good reason to render a sentence without its characters, so the ratchet says so.
		const loose = CALL_SITES.filter(
			({ attrs }) => /example\.pinyin/u.test(attrs) && !/sentence=\{example\.hanzi\}/u.test(attrs)
		).map(({ path }) => path);
		expect(loose).toEqual([]);
	});
});
