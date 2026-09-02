/**
 * The three words a level card shows — and, once someone has practised there, whose three.
 *
 * The level list is the first screen of a Chinese app, so it has to contain Chinese. Before
 * this existed the only hanzi on it were five numerals in red squares — swap the copy for
 * Spanish CEFR bands and nothing on the page would have needed to change. These three words
 * are what HSK 4 actually *is*, said in the only language that can say it.
 *
 * TWO SOURCES, ONE SLOT.
 *   · Nobody has practised this level yet → `LEVEL_PREVIEW`, the static three below.
 *   · They have, and have missed at least three words here → `weakestIds`, their own worst
 *     three, most recently missed first. The card then says "here is what you keep missing in
 *     HSK 4" instead of showing 效率 / 学术 / 传统 forever, which is what the screen's own
 *     tagline promises a session will do.
 * The list is never given up for the progress meter: the level a learner is actually studying
 * is the last one that should be the card with no Chinese on it.
 *
 * The static three are written out rather than loaded. `src/lib/data/index.ts` deliberately
 * keeps all five JSON chunks out of the landing page via `import.meta.glob`, and pulling 640KB
 * of vocabulary to render fifteen words would undo that — the same reason `sizes.ts` writes
 * its counts out. The weak-word path does load one chunk, but only the chunk for a level this
 * learner has already practised, and only after hydration: a first-time visitor still fetches
 * no vocabulary at all from this screen.
 *
 * `preview.spec.ts` asserts every field here against the shipped files, so it cannot drift:
 * `hanzi`, `pinyin` and `gloss` are all verbatim, and `gloss` is one of that word's own
 * `meanings`, never a paraphrase.
 *
 * Choosing the static three: one word per clause of `LEVEL_META.blurb`, in the same order, so
 * the list is the evidence for the sentence above it — HSK 1 is "greetings, family, everyday
 * verbs" and shows 谢谢 / 妈妈 / 喜欢. Kept short enough that hanzi and pinyin share one line
 * on the narrowest card this layout builds, and glossed in a phrase that sets on one line under
 * them there too, which is what makes five untouched cards read as one list; and kept off the
 * numerals: 八 is two strokes glossed "eight", so a third of the first card's Chinese taught
 * nothing.
 */
import type { Level, ProgressState, Syllable, Word, WordProgress } from '$lib/types';

export interface PreviewWord {
	/** The shipped word's id, so the spec can find the row this was copied from. */
	id: string;
	hanzi: string;
	/** Tone-marked pinyin in the orthography the list ships: syllables joined within a word. */
	pinyin: string;
	/** One of the word's own `meanings`, verbatim. */
	gloss: string;
	/**
	 * Build-time syllables, when the word came from the loaded chunk rather than the table
	 * below. `<Pinyin>` re-derives them from the string when they are absent, which it does
	 * correctly for all fifteen static words — this is here so the weak-word path, which can
	 * surface any of 4,308 rows, is exact rather than nearly always exact.
	 */
	syllables?: readonly Syllable[];
}

/** Three words is what a card shows; every source has to produce exactly this. */
export const PREVIEW_COUNT = 3;

/**
 * ---------------------------------------------------------------- fitting an entry --
 *
 * Each preview word is one full-width entry: its hanzi and its pinyin on the first line, its
 * own gloss on the second. So the only width question left is whether *one* word's hanzi and
 * pinyin sit beside each other at this card's width — not whether three of them share a row,
 * which is what this file measured for three loops and what kept dropping 大学生 / 教学楼 /
 * 图书馆 (346px abreast, 130px stacked) down to two columns.
 *
 * Nothing is ever cut either way. The hanzi is held at one size on every card in every state,
 * the pinyin is `nowrap`, and a word too wide for one line wraps its pinyin under its own
 * characters. What this fit buys is uniformity, not safety: it prefers the worst words that
 * keep every entry to two lines, so a card with history is the same height as one without.
 *
 * The widths below are advances, measured in the app at the sizes the list actually uses —
 * they are not guesses:
 *
 *   hanzi   `--text-hanzi-md` 36px + `.hanzi` tracking 0.015em = 36.55px, *exactly*, for
 *           every character (a Han face is monospaced by construction).
 *   pinyin  `--text-pinyin-sm` 14px medium: 5.99px/char (`dìtiě`) to 8.90px (`zhōumò`)
 *           across the shipped list. 8.8 is taken as the ceiling, so the estimate is never
 *           under the truth by more than a rounding error.
 *
 * `LevelCard` measures the real list width and feeds it in, so the budget is the card's, not
 * a constant. 10 of the 4,308 shipped words exceed 246px on their first line — all of them
 * four-character idioms, and only on a 320px phone.
 */
const HANZI_ADVANCE = 36.55;
const PINYIN_ADVANCE = 8.8;

/** Gap between the hanzi and its pinyin, in px. Kept next to the widths it is added to. */
export const PREVIEW_GAP = 8;

/** How wide this word's first line is: its characters, the gap, and its pinyin. */
export function previewWidth(word: PreviewWord): number {
	const glyphs = [...word.hanzi].length * HANZI_ADVANCE;
	// `<Pinyin spaced={false}>` prints the source's own word-internal spaces (回来 is `huí lái`)
	// and adds none of its own, so the printed string is the string — runs of whitespace are
	// collapsed to the single space the line will actually set.
	const latin = word.pinyin.trim().replace(/\s+/g, ' ').length * PINYIN_ADVANCE;
	return glyphs + PREVIEW_GAP + latin;
}

/**
 * The worst `count` words from `words` whose first line fits `budget`, in the order given.
 *
 * It skips rather than stops: given 酸甜苦辣 / 地点 / 电 at 246px it drops the idiom and takes
 * the two short ones plus whatever comes next. Null when fewer than `count` of them fit, and
 * the caller then shows the worst `count` regardless — a two-line entry is a smaller loss than
 * showing somebody a word they have never got wrong.
 */
export function fitPreview(
	words: readonly PreviewWord[],
	budget: number,
	count: number = PREVIEW_COUNT
): PreviewWord[] | null {
	if (words.length < count || budget <= 0) return null;
	const chosen = words.filter((word) => previewWidth(word) <= budget).slice(0, count);
	return chosen.length === count ? chosen : null;
}

export const LEVEL_PREVIEW: Record<Level, readonly PreviewWord[]> = {
	1: [
		{ id: 'L1-0410', hanzi: '谢谢', pinyin: 'xièxie', gloss: 'thank you' },
		{ id: 'L1-0224', hanzi: '妈妈', pinyin: 'māma', gloss: 'mother' },
		{ id: 'L1-0388', hanzi: '喜欢', pinyin: 'xǐhuan', gloss: 'to like' }
	],
	2: [
		{ id: 'L2-0060', hanzi: '超市', pinyin: 'chāoshì', gloss: 'supermarket' },
		{ id: 'L2-0743', hanzi: '周末', pinyin: 'zhōumò', gloss: 'weekend' },
		{ id: 'L2-0125', hanzi: '地铁', pinyin: 'dìtiě', gloss: 'subway' }
	],
	3: [
		{ id: 'L3-0721', hanzi: '同意', pinyin: 'tóngyì', gloss: 'to agree' },
		{ id: 'L3-0498', hanzi: '目标', pinyin: 'mùbiāo', gloss: 'goal' },
		{ id: 'L3-0571', hanzi: '区别', pinyin: 'qūbié', gloss: 'difference' }
	],
	4: [
		{ id: 'L4-0811', hanzi: '效率', pinyin: 'xiàolǜ', gloss: 'efficiency' },
		{ id: 'L4-0834', hanzi: '学问', pinyin: 'xuéwen', gloss: 'knowledge' },
		{ id: 'L4-0114', hanzi: '传统', pinyin: 'chuántǒng', gloss: 'tradition' }
	],
	5: [
		{ id: 'L5-0658', hanzi: '社区', pinyin: 'shèqū', gloss: 'community' },
		{ id: 'L5-0812', hanzi: '戏剧', pinyin: 'xìjù', gloss: 'drama' },
		{ id: 'L5-0031', hanzi: '毕竟', pinyin: 'bìjìng', gloss: 'after all' }
	]
};

/**
 * A shipped word cut down to what the card prints.
 *
 * `meanings[0]` is the list's own best gloss, so a learner's weak word is captioned by exactly
 * the same text the static three are — one render path, no second vocabulary of English.
 */
export function toPreview(word: Word): PreviewWord {
	return {
		id: word.id,
		hanzi: word.hanzi,
		pinyin: word.pinyin,
		gloss: word.meanings[0] ?? '',
		syllables: word.syllables
	};
}

/** Word ids are `L{level}-{n}`, so a level's records are selectable by prefix alone. */
function prefixOf(level: Level): string {
	return `L${level}-`;
}

/**
 * Worst first: most recently missed, then least accurate, then by id so the row is stable
 * between renders rather than reshuffling on every keystroke of progress.
 */
function weakerFirst(a: WordProgress, b: WordProgress): number {
	if (b.lastMissed !== a.lastMissed) return b.lastMissed - a.lastMissed;
	const accuracyA = a.seen > 0 ? a.correct / a.seen : 0;
	const accuracyB = b.seen > 0 ? b.correct / b.seen : 0;
	if (accuracyA !== accuracyB) return accuracyA - accuracyB;
	return a.wordId < b.wordId ? -1 : a.wordId > b.wordId ? 1 : 0;
}

/**
 * This learner's weakest words at one level, worst first — or nothing.
 *
 * Only words they have actually got wrong are candidates, because the label the card puts over
 * this row says so. Returns `[]` unless there are at least `wanted` of them, and the card falls
 * back to the static three: "you keep missing" over two misses and a word they have never seen
 * would be a sentence the data does not support.
 *
 * `depth` extra ids are handed back on top of `wanted` so the caller has spares: a record can
 * survive for an official row that ships merged into another card, and `fitPreview` skips a
 * word whose hanzi and pinyin will not share a line at the card's width. Both drop candidates,
 * and the list still has to end up with three, so the caller asks for double.
 */
export function weakestIds(
	state: ProgressState | null | undefined,
	level: Level,
	wanted: number = PREVIEW_COUNT,
	depth: number = PREVIEW_COUNT
): string[] {
	const byWord = state?.byWord;
	if (!byWord) return [];

	const prefix = prefixOf(level);
	const missed: WordProgress[] = [];
	for (const record of Object.values(byWord)) {
		if (!record?.wordId?.startsWith(prefix)) continue;
		if (record.seen <= 0 || record.lastMissed <= 0) continue;
		missed.push(record);
	}
	if (missed.length < wanted) return [];

	missed.sort(weakerFirst);
	return missed.slice(0, wanted + depth).map((record) => record.wordId);
}
