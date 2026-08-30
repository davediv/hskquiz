/**
 * ORTHOGRAPHY. The one thing a Chinese typography system cannot get wrong.
 *
 * `<Pinyin>` colours one syllable at a time, which means it takes `Word.pinyin` apart and puts
 * it back together on every render. For four loops it put it back together with one space per
 * syllable, and that is not a style choice — it is a spelling. 汉语拼音正词法基本规则
 * (GB/T 16159) sets pinyin by WORD: 爱好 is `àihào`, 北京 `Běijīng`, 那儿 `nàr`, 方案 `fāng'àn`,
 * 五颜六色 `wǔyán-liùsè`. The old default printed `ài hào`, `Běi jīng`, `nà r` and `fāng àn` —
 * on 3,095 of the 4,308 shipped words, including every one of the 4,308 browse rows — and the
 * apostrophe it dropped in the last of those is the only mark distinguishing `fāngàn` from
 * `fāng'àn`.
 *
 * Nothing about that was visible by reading a diff: the misspelling lived in ONE default value
 * on a prop, and the two call sites that overrode it did so under a comment that stated the
 * rule the other 22 were breaking. So the rule is measured here instead, on the real corpus and
 * on the real call sites:
 *
 *   1. THE RENDER IS THE SOURCE. Concatenating what `<Pinyin>` prints reproduces `Word.pinyin`
 *      character for character, over all 4,308 words and all 4,308 example sentences. Not "has
 *      no more gaps than" — identical, which also covers the apostrophes and hyphens a
 *      gap-counting test would let through.
 *   2. NO CALL SITE CAN OPT BACK IN by accident. `spaced` is ruby-only, so a `.svelte` file
 *      that passes it has to be on the allowlist below and has to be positioning syllables over
 *      individual characters. That is the check the spacing scale went three loops without.
 *   3. SENTENCES ARE SENTENCES. Capital, terminal stop, matching the hanzi above them.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Level, Word } from '$lib/types';
import { LEVELS } from '$lib/types';
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
		expect(kept).toEqual({ space: 314, apostrophe: 24, hyphen: 8 });
	});

	it('writes erhua onto the syllable it belongs to', () => {
		const erhua = CORPUS.filter((word) => word.syllables.some((s, i) => i > 0 && s.py === 'r'));
		const split = erhua.filter((word) => / r\b/u.test(render(word)));
		expect({ count: erhua.length, split: split.map((word) => word.hanzi) }).toEqual({
			count: 36,
			split: []
		});
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
			不客气: pick('不客气'),
			回来: pick('回来'),
			哪儿: pick('哪儿')
		}).toEqual({
			爱好: 'àihào',
			白天: 'báitiān',
			杯子: 'bēizi',
			北京: 'Běijīng',
			爱心: 'àixīn',
			安排: 'ānpái',
			不客气: 'bú kèqì',
			回来: 'huí lái',
			哪儿: 'nǎr'
		});
	});

	it('measures how much of the corpus the old default misspelled', () => {
		const changed = CORPUS.filter((word) => render(word, true) !== render(word));
		expect({
			changed: changed.length,
			share: Math.round((changed.length / CORPUS.length) * 1000) / 10
		}).toEqual({ changed: 3095, share: 71.8 });
	});
});

describe('example sentences', () => {
	const SENTENCES = CORPUS.flatMap((word) => (word.example ? [word.example] : []));

	it('ships one for every word', () => {
		expect(SENTENCES.length).toBe(CORPUS.length);
	});

	it('round-trips the sentence reading too', () => {
		const wrong = SENTENCES.filter((example) => {
			const list = segmentPinyin(example.pinyin);
			return (
				layoutPinyin(example.pinyin, list, false)
					.map((part) => part.text)
					.join('') !== example.pinyin
			);
		});
		expect(wrong.map((example) => example.pinyin)).toEqual([]);
	});

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

describe('syllables with no string to read', () => {
	it('falls back to one gap per syllable — ruby callers pass no source', () => {
		const list = [
			{ py: 'wǒ', tone: 3 },
			{ py: 'ài', tone: 4 }
		] as const;
		expect(
			layoutPinyin('', list, false)
				.map((part) => part.text)
				.join('')
		).toBe('wǒ ài');
	});

	it('still attaches erhua when there is no source either', () => {
		const list = [
			{ py: 'nǎ', tone: 3 },
			{ py: 'r', tone: 0 }
		] as const;
		const run = layoutPinyin('', list, false);
		expect({ text: run.map((part) => part.text).join(''), tone: run[1].tone }).toEqual({
			text: 'nǎr',
			tone: 3
		});
	});
});

/* ---------------------------------------------------------------- 2. the call-site ratchet */

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
});
