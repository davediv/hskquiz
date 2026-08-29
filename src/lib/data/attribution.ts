/**
 * Credits that have to appear somewhere a learner can reach.
 *
 * The word list itself (hanzi, pinyin, level) comes from the official HSK 3.0 standard and
 * carries no licence obligation. The English meanings were written from CC-CEDICT, which is
 * CC-BY-SA 4.0 — so attribution is not optional, and anything derived from those meanings
 * has to stay under the same licence.
 *
 * Render `VOCAB_ATTRIBUTION` in the app shell: an "About" or footer line on the level-select
 * screen is enough. Keep the licence name and its link intact.
 */
export interface Credit {
	/** What this source provided. */
	role: string;
	/** Human-readable name of the source. */
	name: string;
	/** Canonical home page for the source. */
	url: string;
	/** Licence name, or null where none applies. */
	license: string | null;
	/** Link to the licence text, or null. */
	licenseUrl: string | null;
}

export const VOCAB_ATTRIBUTION: readonly Credit[] = [
	{
		role: 'Word list, pinyin and levels',
		name: '国际中文教育中文水平等级标准 (GF 0025-2021), HSK 3.0 levels 1–5',
		url: 'https://www.chinesetest.cn/',
		license: null,
		licenseUrl: null
	},
	{
		role: 'English meanings, adapted',
		name: 'CC-CEDICT, published by MDBG',
		url: 'https://www.mdbg.net/chinese/dictionary?page=cc-cedict',
		license: 'CC BY-SA 4.0',
		licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/'
	}
];

/** One-line form, for a footer with no room for a list. */
export const VOCAB_ATTRIBUTION_LINE =
	'Vocabulary from the official HSK 3.0 standard. English meanings adapted from CC-CEDICT (CC BY-SA 4.0).';
