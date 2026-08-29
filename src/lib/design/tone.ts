/**
 * Tone helpers for tone-marked pinyin.
 *
 * Pleco colours pinyin by tone (1 red, 2 green, 3 blue, 4 purple, 5 grey) and learners who
 * already use it read that colouring fluently, so the design system ships the same mapping as
 * `--color-tone-1` … `--color-tone-5`.
 *
 * The one rule these helpers exist to enforce: **never show a tone colour we are not sure of.**
 * `Word.pinyin` is not reliably syllable-spaced (`àihào` as often as `ài hào`), and splitting an
 * unspaced string into syllables is genuinely ambiguous — `fǎngǎn` is `fǎn gǎn`, but `fāng'àn` is
 * `fāng àn`, and nothing in the letters distinguishes them. So `toneOf` returns a tone only when
 * the token it is given is unmistakably one syllable: at most one tone-marked vowel, and a base
 * form that appears in the standard pinyin syllable inventory. Otherwise it returns `null` and
 * the caller falls back to plain ink. Missing colour is fine; wrong colour teaches a wrong tone.
 */

/** 1–4 are the marked tones; 5 is the neutral (unmarked) tone. */
export type Tone = 1 | 2 | 3 | 4 | 5;

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

/** Whitespace, the syllable apostrophe, the interpunct, and the separable-verb marker. */
const SEPARATORS = /[\s'’·∥]+/u;

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

/**
 * The tone of a single pinyin syllable, or `null` when the token is not confidently one
 * syllable (unspaced compounds, punctuation, anything outside the inventory). Render `null`
 * in plain ink rather than guessing.
 */
export function toneOf(token: string): Tone | null {
	const trimmed = token.trim().toLowerCase();
	if (trimmed === '') return null;

	let tone: Tone | null = null;
	for (const char of trimmed) {
		const marked = MARKED.get(char);
		if (marked === undefined) continue;
		// A second marked vowel means two syllables glued together — not safely splittable.
		if (tone !== null) return null;
		tone = marked[1];
	}

	const base = stripTone(trimmed).replace(/ü/gu, 'v');
	if (!SYLLABLES.has(base)) return null;

	return tone ?? 5;
}

/**
 * Split a pinyin string into the tokens we are willing to treat as syllables. Splits on
 * whitespace, apostrophes and the separable-verb marker; it deliberately does not try to break
 * an unspaced compound apart.
 */
export function splitPinyin(pinyin: string): string[] {
	return pinyin
		.trim()
		.split(SEPARATORS)
		.filter((token) => token !== '');
}

/** The design-system colour for a tone, ready to drop into a `style` attribute. */
export function toneColor(tone: Tone | null): string {
	return tone === null ? 'inherit' : `var(--color-tone-${tone})`;
}
