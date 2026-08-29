import type { Level } from '$lib/types';

export interface LevelMeta {
	/** HSK 3.0 band: levels 1–3 are 初等, 4–6 中等 (GF 0025-2021). */
	band: string;
	bandHanzi: string;
	/**
	 * What a learner actually meets at this level, in three clauses. The order matches
	 * `LEVEL_PREVIEW` for the same level, so the words below the line are the evidence for
	 * this sentence rather than an unrelated sample.
	 */
	blurb: string;
}

export const LEVEL_META: Record<Level, LevelMeta> = {
	1: {
		band: 'Elementary',
		bandHanzi: '初等',
		blurb: 'Greetings, family, everyday verbs'
	},
	2: {
		band: 'Elementary',
		bandHanzi: '初等',
		blurb: 'Daily life, time, getting around'
	},
	3: {
		band: 'Elementary',
		bandHanzi: '初等',
		blurb: 'Opinions, plans, comparisons'
	},
	4: {
		band: 'Intermediate',
		bandHanzi: '中等',
		blurb: 'Work, study, abstract ideas'
	},
	5: {
		band: 'Intermediate',
		bandHanzi: '中等',
		blurb: 'Society, culture, shades of meaning'
	}
};

export interface LevelBand {
	/** Slug, used for the section heading's id. */
	key: string;
	hanzi: string;
	name: string;
	levels: readonly Level[];
}

/**
 * The two bands the standard groups these levels into, in order.
 *
 * The band belongs to the group, not to each card: printing ELEMENTARY above HSK 1, HSK 2 and
 * HSK 3 in turn spends three eyebrows saying one thing, and made the cards look more alike
 * than they are. As a heading it also gets to carry 初等 / 中等 at a size hanzi can be read at.
 */
export const LEVEL_BANDS: readonly LevelBand[] = [
	{ key: 'elementary', hanzi: '初等', name: 'Elementary', levels: [1, 2, 3] },
	{ key: 'intermediate', hanzi: '中等', name: 'Intermediate', levels: [4, 5] }
];
