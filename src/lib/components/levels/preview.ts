/**
 * Three real words from each level, shown on that level's card.
 *
 * The level list is the first screen of a Chinese app, so it has to contain Chinese. Before
 * this existed the only hanzi on it were five numerals in red squares — swap the copy for
 * Spanish CEFR bands and nothing on the page would have needed to change. These three words
 * are what HSK 4 actually *is*, said in the only language that can say it.
 *
 * Written out rather than loaded. `src/lib/data/index.ts` deliberately keeps all five JSON
 * chunks out of the landing page via `import.meta.glob`, and pulling 640KB of vocabulary to
 * render fifteen words would undo that — the same reason `sizes.ts` writes its counts out.
 * `preview.spec.ts` asserts every field here against the shipped files, so it cannot drift:
 * `hanzi`, `pinyin` and `gloss` are all verbatim, and `gloss` is one of that word's own
 * `meanings`, never a paraphrase.
 *
 * Choosing: one word per clause of `LEVEL_META.blurb`, in the same order, so the row is the
 * evidence for the sentence above it — HSK 1 is "greetings, numbers, family" and shows
 * 谢谢 / 八 / 妈妈. Kept to one or two characters so three columns fit a 375px card without
 * the hanzi shrinking below the scale's floor.
 */
import type { Level } from '$lib/types';

export interface PreviewWord {
	/** The shipped word's id, so the spec can find the row this was copied from. */
	id: string;
	hanzi: string;
	/** Tone-marked pinyin in the orthography the list ships: syllables joined within a word. */
	pinyin: string;
	/** One of the word's own `meanings`, verbatim. */
	gloss: string;
}

export const LEVEL_PREVIEW: Record<Level, readonly PreviewWord[]> = {
	1: [
		{ id: 'L1-0410', hanzi: '谢谢', pinyin: 'xièxie', gloss: 'thank you' },
		{ id: 'L1-0003', hanzi: '八', pinyin: 'bā', gloss: 'eight' },
		{ id: 'L1-0224', hanzi: '妈妈', pinyin: 'māma', gloss: 'mother' }
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
		{ id: 'L4-0833', hanzi: '学术', pinyin: 'xuéshù', gloss: 'academic study' },
		{ id: 'L4-0114', hanzi: '传统', pinyin: 'chuántǒng', gloss: 'tradition' }
	],
	5: [
		{ id: 'L5-0564', hanzi: '评论', pinyin: 'pínglùn', gloss: 'to comment on' },
		{ id: 'L5-0812', hanzi: '戏剧', pinyin: 'xìjù', gloss: 'drama' },
		{ id: 'L5-0031', hanzi: '毕竟', pinyin: 'bìjìng', gloss: 'after all' }
	]
};
