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
 * The row is never given up for the progress meter: the level a learner is actually studying
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
 * the row is the evidence for the sentence above it — HSK 1 is "greetings, family, everyday
 * verbs" and shows 谢谢 / 妈妈 / 喜欢. Kept to one or two characters so three columns fit a
 * 375px card without the hanzi shrinking below the scale's floor, kept to a gloss short enough
 * to sit on one line in a third of the narrowest card (`academic study` was clipping at 1440),
 * and kept off the numerals: 八 is two strokes glossed "eight", so a third of the first card's
 * Chinese taught nothing.
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

/** Three columns of hanzi is what a 375px card holds; every source has to produce exactly this. */
export const PREVIEW_COUNT = 3;

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
 * `depth` extra ids are handed back on top of `wanted` so the caller can drop any that are not
 * in the shipped chunk — a record can survive for an official row that ships merged into
 * another card — and still fill three columns.
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
