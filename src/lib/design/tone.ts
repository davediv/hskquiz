/**
 * Tone helpers.
 *
 * WHERE TONE COMES FROM. Every `Word` the app ships carries `syllables: Syllable[]`, one
 * `{ py, tone }` per hanzi character, derived at BUILD time from the reference CEDICT keys
 * (`爸爸|爸爸[ba4 ba5]` → `bà`/4, `ba`/0) and gated so the build refuses to emit a row whose
 * syllable count and character count disagree. That array is the source of truth: pass it to
 * `<Pinyin>` / `<Hanzi>` and nothing here has to infer anything.
 *
 * `segmentPinyin` exists for the callers that only hold a pinyin string. It is not the old
 * "colour it only if we are sure" hedge — it is a complete segmenter, and its output is
 * asserted against all 7,905 shipped syllables in `tone.spec.ts`. It resolves the classic
 * ambiguity (`fǎngǎn` = `fǎn gǎn`, not `fǎng ǎn`) the way pinyin orthography does: a syllable
 * that begins with a, e or o takes an apostrophe when it follows another syllable
 * (`fāng'àn`), so an unapostrophed string never splits before a bare vowel.
 *
 * Measured against the shipped corpus: 4,306 of 4,308 words segment exactly as the build
 * recorded them. The 2 misses are the alternate-reading rows (`shéi/shuí`, `shú/shóu`), where
 * one character carries two printed readings — both readings still segment and colour
 * correctly, there are simply two of them for one character.
 *
 * TONE NUMBERING. `Tone` is `0 | 1 | 2 | 3 | 4`, exactly `Syllable['tone']` — 0 is the neutral
 * tone. `--color-tone-0` … `--color-tone-4` in `layout.css` hold the palette: Pleco's families
 * (1 red, 2 green, 3 blue, 4 purple, 0 neutral) shifted onto values no state, text or border
 * token holds — a vermilion, a leaf green, a blue, a violet and a cool slate. `toneColor`
 * returns the `var()`, so this module never carries a hex.
 *
 * WHERE THE COLOUR GOES. On the pinyin, not the hanzi: `<Pinyin>` paints by default and
 * `<Hanzi>` does not. `palette.spec.ts` holds the palette's half of that contract.
 */

import type { Syllable } from '$lib/types';

/** 1–4 are the marked tones; 0 is the neutral (unmarked) tone. Mirrors `Syllable['tone']`. */
export type Tone = Syllable['tone'];

/**
 * Every precomposed tone-marked letter pinyin uses, mapped to its unmarked base and its tone.
 * Only single-code-point forms are listed: `m̌` and `m̀` exist solely as base + combining caron,
 * and treating a bare `m` as toned would mis-read every ordinary syllable that contains one.
 */
const MARKED: ReadonlyMap<string, readonly [string, Tone]> = new Map([
	['ā', ['a', 1]],
	['á', ['a', 2]],
	['ǎ', ['a', 3]],
	['à', ['a', 4]],
	['ē', ['e', 1]],
	['é', ['e', 2]],
	['ě', ['e', 3]],
	['è', ['e', 4]],
	['ī', ['i', 1]],
	['í', ['i', 2]],
	['ǐ', ['i', 3]],
	['ì', ['i', 4]],
	['ō', ['o', 1]],
	['ó', ['o', 2]],
	['ǒ', ['o', 3]],
	['ò', ['o', 4]],
	['ū', ['u', 1]],
	['ú', ['u', 2]],
	['ǔ', ['u', 3]],
	['ù', ['u', 4]],
	['ǖ', ['ü', 1]],
	['ǘ', ['ü', 2]],
	['ǚ', ['ü', 3]],
	['ǜ', ['ü', 4]],
	['ḿ', ['m', 2]],
	['ń', ['n', 2]],
	['ň', ['n', 3]],
	['ǹ', ['n', 4]]
]);

/** The ~400 valid toneless pinyin syllables, with `ü` written as `v`. */
const SYLLABLES: ReadonlySet<string> = new Set(
	(
		'a ai an ang ao ba bai ban bang bao bei ben bi bian biao bie bin bing bo bu ca cai can cao ce ' +
		'cen ceng cha chai chan chang chao che chen cheng chi chong chou chu chua chuai chuan chuang ' +
		'chui chun chuo ci cong cu cuan cui cun cuo da dai dan dang dao de dei den deng di dia dian ' +
		'diao ding diu dong dou du duan dui dun duo e eng er fa fan fang fei fen feng fiao fou fu gai ' +
		'gan gang gao ge gei gen geng gong gou gu gua guai guan guang gui gun guo ha hai han hang hao ' +
		'he hei hen hm hng hong hou hu hua huai huan huang hui hun huo ji jia jian jiang jiao jie jin ' +
		'jing jiu ju juan jue jun ka kai kan kang kao ke kei ken kong kou ku kuai kuan kuang kui kun ' +
		'kuo la lai lan lang lao le lei leng li lia lian liang liao lie lin ling liu lo long lou lu ' +
		'luan lun luo lv lve ma mai man mang mao me mei men meng mi mian miao min ming miu mo mou mu ' +
		'n na nai nan nao ne nei nen neng ng ni nian niang niao nin ning niu nong nou nu nuan nun nuo ' +
		'nv nve o ou pa pai pan pang pao pei pen peng pi pian piao pin ping po pu qi qian qiang qiao ' +
		'qie qin qing qiong qiu qu quan que qun r ran rang rao re ren reng ri rong rou ru rua ruan ' +
		'run ruo sa sai san sang sao se sen seng sha shai shan shang shao she shei shen sheng shi ' +
		'shou shu shua shuai shuang shui shun shuo si song sou su suan sui sun suo ta tai tan tang ' +
		'tao te tei teng ti tian tiao tie ting tong tou tu tuan tui tun tuo wa wai wan wang wei wen ' +
		'weng wo wu xi xia xian xiang xiao xie xin xing xiong xiu xu xuan xue xun ya yai yan yang yao ' +
		'ye yi yin ying yo yong you yu yuan yue yun za zai zan zang zao ze zei zen zeng zhai zhan ' +
		'zhang zhao zhe zhei zhen zheng zhi zhong zhou zhu zhua zhuai zhuan zhuang zhui zhun zhuo zi ' +
		'zong zou zu zui zun zuo'
	).split(' ')
);

/** No pinyin syllable is longer than six letters (`chuang`, `shuang`, `zhuang`). */
const MAX_SYLLABLE = 6;

/**
 * Anything the source may put between syllables: whitespace, the syllable apostrophe in both
 * quote shapes, the interpunct, the separable-verb marker, the hyphens the official list uses
 * in four-character idioms (`wǔyán-liùsè`), and the slash between alternate readings.
 */
const SEPARATORS = /[\s'’·∥\-–—/]+/u;

/** A syllable opening on a bare vowel — the shape that needs an apostrophe when it follows. */
const VOWEL_INITIAL = /^[aeoāáǎàēéěèōóǒò]/u;

/**
 * Standalone finals. They are real syllables (嗯 `ǹg`, 儿 `r`) but almost never the right way
 * to cut a compound, so they cost extra and only win when nothing else fits.
 */
const RARE_ALONE: ReadonlySet<string> = new Set(['n', 'ng', 'r', 'm', 'hm', 'hng', 'o', 'e']);

/**
 * Replace every tone-marked letter with its unmarked base, leaving everything else alone.
 * `zhōng` → `zhong`, `nǚ` → `nü`.
 */
export function stripTone(text: string): string {
	let out = '';
	for (const char of text) {
		out += MARKED.get(char)?.[0] ?? char;
	}
	return out;
}

/** Inventory key for a candidate syllable: unmarked, lower-cased, `ü` written as `v`. */
function inventoryKey(piece: string): string {
	return stripTone(piece.toLowerCase()).replace(/ü/gu, 'v');
}

/**
 * The tone of one syllable, read off its diacritic. A syllable with no mark is the neutral
 * tone (0) — which is why this takes a single syllable and never a whole word: in `bàba` the
 * absent second mark is meaningful, in `bàba` treated as one token it is invisible.
 */
export function toneOf(syllable: string): Tone {
	let tone: Tone = 0;
	for (const char of syllable.toLowerCase()) {
		const marked = MARKED.get(char);
		if (marked !== undefined) tone = marked[1];
	}
	return tone;
}

/** True when `piece` is one syllable of the standard inventory carrying at most one tone mark. */
function isSyllable(piece: string): boolean {
	let marks = 0;
	for (const char of piece.toLowerCase()) {
		if (MARKED.has(char)) marks += 1;
	}
	if (marks > 1) return false;
	return SYLLABLES.has(inventoryKey(piece));
}

interface Cut {
	cost: number;
	parts: string[];
}

/**
 * Cheapest segmentation of one separator-free token, or `null` when the token is not pinyin.
 *
 * The cost model is the whole algorithm, and each term is an orthographic rule rather than a
 * tuning knob:
 *   +1    per syllable — between two otherwise legal cuts, the one with fewer, longer
 *         syllables is the intended reading (`nán`, not `n` + `án`).
 *   +64   for a non-initial syllable that opens on a bare vowel — standard orthography would
 *         have written an apostrophe there (`fāng'àn`), and this token has none, so that cut
 *         is not what the source meant. This is what makes `fǎngǎn` come out `fǎn gǎn`.
 *   +16   for a standalone final (`n`, `ng`, `r`, …), which is a real syllable but a poor cut.
 */
function cut(token: string): Cut | null {
	const chars = [...token];
	const memo = new Map<number, Cut | null>();

	function from(start: number): Cut | null {
		if (start === chars.length) return { cost: 0, parts: [] };
		const seen = memo.get(start);
		if (seen !== undefined) return seen;

		// Written before the recursion so a pathological token cannot re-enter this index.
		memo.set(start, null);

		let best: Cut | null = null;
		for (let len = Math.min(MAX_SYLLABLE, chars.length - start); len >= 1; len -= 1) {
			const piece = chars.slice(start, start + len).join('');
			if (!isSyllable(piece)) continue;

			const rest = from(start + len);
			if (rest === null) continue;

			let cost = rest.cost + 1;
			if (start > 0 && VOWEL_INITIAL.test(piece)) cost += 64;
			if (RARE_ALONE.has(inventoryKey(piece))) cost += 16;

			if (best === null || cost < best.cost) best = { cost, parts: [piece, ...rest.parts] };
		}

		memo.set(start, best);
		return best;
	}

	return from(0);
}

/**
 * A pinyin string as syllables — the same shape the build writes onto `Word.syllables`, so a
 * component can take either and render one code path.
 *
 * A token that is not pinyin at all (a stray gloss, punctuation) is kept whole rather than
 * dropped: losing the learner's text is worse than not colouring it, and an unrecognised token
 * simply comes back as neutral tone.
 */
export function segmentPinyin(pinyin: string): Syllable[] {
	const out: Syllable[] = [];
	for (const token of pinyin.trim().split(SEPARATORS)) {
		if (token === '') continue;
		const parts = cut(token)?.parts ?? [token];
		for (const py of parts) out.push({ py, tone: toneOf(py) });
	}
	return out;
}

/**
 * Just the syllable text — the tokens `segmentPinyin` decided on, without the tones. Used by
 * search, which wants to match `zhong` against `zhōngguó`.
 */
export function splitPinyin(pinyin: string): string[] {
	return segmentPinyin(pinyin).map((syllable) => syllable.py);
}

/** The design-system colour for a tone, ready to drop into a `style` attribute. */
export function toneColor(tone: Tone): string {
	return `var(--color-tone-${tone})`;
}

/**
 * The syllables to render for a word: the build's array when the caller has it, otherwise a
 * segmentation of the printed pinyin. Kept in one place so `<Pinyin>` and `<Hanzi>` resolve
 * their input identically.
 */
export function resolveSyllables(
	syllables: readonly Syllable[] | undefined,
	pinyin: string | undefined
): Syllable[] {
	if (syllables !== undefined && syllables.length > 0) return [...syllables];
	return segmentPinyin(pinyin ?? '');
}
