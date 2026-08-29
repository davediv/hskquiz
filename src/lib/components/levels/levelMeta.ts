import type { Level } from '$lib/types';

export interface LevelMeta {
	/** The Chinese numeral, used as the level's mark. */
	numeral: string;
	/** HSK 3.0 band: levels 1–3 are 初等, 4–6 中等 (GF 0025-2021). */
	band: string;
	bandHanzi: string;
	/** What a learner actually meets at this level, in a phrase. */
	blurb: string;
}

export const LEVEL_META: Record<Level, LevelMeta> = {
	1: {
		numeral: '一',
		band: 'Elementary',
		bandHanzi: '初等',
		blurb: 'Greetings, numbers, family'
	},
	2: {
		numeral: '二',
		band: 'Elementary',
		bandHanzi: '初等',
		blurb: 'Daily life, time, getting around'
	},
	3: {
		numeral: '三',
		band: 'Elementary',
		bandHanzi: '初等',
		blurb: 'Opinions, plans, comparisons'
	},
	4: {
		numeral: '四',
		band: 'Intermediate',
		bandHanzi: '中等',
		blurb: 'Work, study, abstract ideas'
	},
	5: {
		numeral: '五',
		band: 'Intermediate',
		bandHanzi: '中等',
		blurb: 'News, culture, shades of meaning'
	}
};
