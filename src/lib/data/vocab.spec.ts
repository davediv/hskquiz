/**
 * The shipped word list is derived data. These tests are the contract that it still says
 * what the official HSK 3.0 standard says, and that every entry is answerable as a quiz
 * question.
 *
 * Files are read with `readFileSync` rather than imported: a static `import './hsk1.json'`
 * would drag 4,307 JSON entries into the TypeScript program and slow every `svelte-check`.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import type { Level, Word } from '$lib/types';
import { LEVEL_SIZES, LEVELS } from '$lib/types';

interface ShippedWord extends Word {
	/** Present only where two official rows collapsed into one card. */
	ids?: string[];
}

interface OfficialRow {
	id: string;
	simplified: string;
	pinyin: string;
	officialPinyin: string;
	level: number;
}

function readShipped(level: Level): ShippedWord[] {
	return JSON.parse(readFileSync(`src/lib/data/hsk${level}.json`, 'utf8')) as ShippedWord[];
}

function readOfficial(level: Level): OfficialRow[] {
	return JSON.parse(
		readFileSync(`reference/hsk/hsk30-official-L${level}.json`, 'utf8')
	) as OfficialRow[];
}

const shipped = LEVELS.flatMap(readShipped);
const official = LEVELS.flatMap(readOfficial);

/** Every official id, mapped to the shipped entry that represents it. */
const byOfficialId = new Map<string, ShippedWord>();
for (const word of shipped) {
	for (const id of word.ids ?? [word.id]) byOfficialId.set(id, word);
}

describe('shipped vocabulary vs. reference/hsk', () => {
	it('accounts for all 4,316 official entries', () => {
		expect(official).toHaveLength(4316);
		const missing = official.filter((row) => !byOfficialId.has(row.id));
		expect(missing.map((row) => `${row.id} ${row.simplified}`)).toEqual([]);
	});

	it('keeps every entry at the level the standard gives it', () => {
		const wrong = official.filter((row) => byOfficialId.get(row.id)?.level !== row.level);
		expect(wrong.map((row) => row.id)).toEqual([]);
	});

	it('ships one entry per official row, apart from same-level homographs', () => {
		const merged = shipped.filter((word) => (word.ids?.length ?? 1) > 1);
		expect(shipped).toHaveLength(official.length - merged.length);
		// A merge is only ever allowed between rows that are indistinguishable on a card.
		for (const word of merged) {
			const rows = word.ids!.map((id) => official.find((row) => row.id === id)!);
			expect(rows.every((row) => row.level === word.level)).toBe(true);
		}
	});

	it('matches the reference on hanzi and pinyin', () => {
		const clean = (text: string) =>
			text
				.split('|')[0]
				.replace(/[（(][^）)]*[）)]/g, ' ')
				.replace(/[0-9¹²³]+$/, '')
				.replace(/∥/g, ' ')
				.replace(/[…·]/g, '')
				.replace(/\s+/g, ' ')
				.trim();
		const wrong: string[] = [];
		for (const row of official) {
			const word = byOfficialId.get(row.id)!;
			if (word.hanzi !== clean(row.simplified).replace(/\s/g, '')) {
				wrong.push(`${row.id} hanzi ${word.hanzi} != ${row.simplified}`);
			}
			if (word.pinyin.toLowerCase() !== clean(row.officialPinyin || row.pinyin).toLowerCase()) {
				wrong.push(`${row.id} pinyin ${word.pinyin} != ${row.officialPinyin}`);
			}
		}
		expect(wrong).toEqual([]);
	});

	it('is exactly what scripts/build-vocab.mjs produces', () => {
		expect(() =>
			execFileSync('node', ['scripts/build-vocab.mjs', '--verify'], { stdio: 'pipe' })
		).not.toThrow();
	});
});

describe('every entry is quizzable', () => {
	it('shows a learner no source notation', () => {
		const notation = /[|｜（）()¹²³…∥·[\]{}]/;
		const leaked = shipped.filter(
			(word) =>
				notation.test(word.hanzi) ||
				notation.test(word.pinyin) ||
				/[0-9]/.test(word.hanzi) ||
				/[0-9]/.test(word.pinyin) ||
				word.meanings.some((meaning) => notation.test(meaning))
		);
		expect(leaked.map((word) => `${word.id} ${word.hanzi}`)).toEqual([]);
	});

	it('gives every word one to three short meanings', () => {
		const bad = shipped.filter(
			(word) =>
				word.meanings.length < 1 ||
				word.meanings.length > 3 ||
				word.meanings.some((meaning) => meaning.length === 0 || meaning.length > 34)
		);
		expect(bad.map((word) => `${word.id} ${word.hanzi}: ${word.meanings.join(' | ')}`)).toEqual([]);
	});

	it('never gives two words in a level the same primary meaning', () => {
		const clashes: string[] = [];
		for (const level of LEVELS) {
			const seen = new Map<string, ShippedWord>();
			for (const word of readShipped(level)) {
				const key = word.meanings[0].toLowerCase();
				const other = seen.get(key);
				if (other) clashes.push(`L${level} "${key}": ${other.hanzi} / ${word.hanzi}`);
				else seen.set(key, word);
			}
		}
		expect(clashes).toEqual([]);
	});

	it('has a unique id per entry', () => {
		expect(new Set(shipped.map((word) => word.id)).size).toBe(shipped.length);
	});
});

describe('level sizes', () => {
	it('covers the official count at every level', () => {
		for (const level of LEVELS) {
			expect(readOfficial(level)).toHaveLength(LEVEL_SIZES[level]);
		}
	});

	it('ships the official count minus only the merged homographs', () => {
		for (const level of LEVELS) {
			const rows = readShipped(level);
			const merged = rows.reduce((sum, word) => sum + ((word.ids?.length ?? 1) - 1), 0);
			expect(rows.length + merged).toBe(LEVEL_SIZES[level]);
		}
	});
});
