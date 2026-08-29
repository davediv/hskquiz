/**
 * `LEVEL_PREVIEW` is vocabulary copied out of the shipped JSON by hand so the landing page
 * can show real words without loading 640KB of it. That copy is exactly the kind of constant
 * that rots silently — a rebuild renumbers an id, a gloss gets rewritten, and the first screen
 * of the app starts teaching something the rest of it no longer says.
 *
 * `readFileSync` rather than `import`: a static JSON import would drag 4,308 entries into the
 * TypeScript program, which is the thing `src/lib/data/index.ts` exists to avoid.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Level, Word } from '$lib/types';
import { LEVELS } from '$lib/types';
import { LEVEL_META } from './levelMeta';
import { LEVEL_PREVIEW } from './preview';

function readShipped(level: Level): Word[] {
	return JSON.parse(readFileSync(`src/lib/data/hsk${level}.json`, 'utf8')) as Word[];
}

const shipped = new Map<string, Word>();
for (const level of LEVELS) {
	for (const word of readShipped(level)) shipped.set(word.id, word);
}

describe('level card previews', () => {
	it.each([...LEVELS])('HSK %i previews three words', (level) => {
		expect(LEVEL_PREVIEW[level]).toHaveLength(3);
	});

	it('quotes the shipped word list verbatim', () => {
		for (const level of LEVELS) {
			for (const preview of LEVEL_PREVIEW[level]) {
				const word = shipped.get(preview.id);
				expect(word, `${preview.id} (${preview.hanzi}) is not a shipped word`).toBeDefined();
				expect(word?.level).toBe(level);
				expect(word?.hanzi).toBe(preview.hanzi);
				expect(word?.pinyin).toBe(preview.pinyin);
				// A gloss the word does not claim is a gloss this screen invented.
				expect(word?.meanings, `gloss for ${preview.hanzi}`).toContain(preview.gloss);
			}
		}
	});

	it('shows a different word on every card', () => {
		const ids = LEVELS.flatMap((level) => LEVEL_PREVIEW[level].map((word) => word.id));
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('keeps previews short enough for three columns on a phone', () => {
		for (const level of LEVELS) {
			for (const preview of LEVEL_PREVIEW[level]) {
				// Three 36px hanzi cells share ~93px each inside a 375px card, so a third
				// character would either overflow or force the hanzi below the scale's floor.
				expect([...preview.hanzi].length, `${preview.hanzi} is too wide`).toBeLessThanOrEqual(2);
			}
		}
	});

	it('covers every level the menu lists', () => {
		expect(Object.keys(LEVEL_PREVIEW).map(Number)).toEqual([...LEVELS]);
		expect(Object.keys(LEVEL_META).map(Number)).toEqual([...LEVELS]);
	});
});
