/**
 * The font-stack guarantee, asserted instead of assumed.
 *
 * Tone-marked pinyin needs ǖ ǘ ǚ ǜ (U+01D5–U+01DC). Plenty of Latin UI faces do not have them
 * — Verdana has no ǚ — so if one of those leads the stack the browser silently swaps a
 * different face in for that one letter and `nǚ'ér` comes apart mid-word. The fix is that the
 * pinyin stack leads with Chinese faces, which carry the whole GB 18030 block.
 *
 * Loop 1 verified that by eye on one Mac. That is the wrong machine to verify it on: the
 * failure lands on a Windows or Linux learner, whose browser walks further down the stack. So
 * this reads the declared stacks out of `layout.css` and checks the property that holds on
 * every machine — that whatever face a platform picks first is one that has the glyphs.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const CSS = readFileSync(`${process.cwd()}/src/routes/layout.css`, 'utf8');

/** Read one `--token: …;` declaration out of the stylesheet as a list of families. */
function families(token: string): string[] {
	const match = new RegExp(`\\n\\t--${token}:([^;]*);`, 'u').exec(CSS);
	if (match === null) throw new Error(`--${token} is not declared in layout.css`);
	return match[1]
		.split(',')
		.map((name) => name.trim().replace(/^'|'$/gu, ''))
		.filter((name) => name !== '');
}

/**
 * Faces that carry the tone-marked vowels, one per platform we can actually be served on.
 * PingFang SC ships on macOS/iOS, Microsoft YaHei on Windows, Noto Sans SC/CJK on Linux and
 * Android, Hiragino Sans GB on older macOS.
 */
const HAS_TONE_MARKS = [
	'PingFang SC',
	'Hiragino Sans GB',
	'Noto Sans SC',
	'Noto Sans CJK SC',
	'Source Han Sans SC',
	'Microsoft YaHei',
	'Lucida Grande',
	'DejaVu Sans'
];

/** Faces known to be missing part of the block — none of these may lead a pinyin stack. */
const KNOWN_GAPS = ['Verdana', 'Tahoma', 'Arial', 'Helvetica', 'Helvetica Neue', 'Roboto', 'Inter'];

describe('--font-pinyin', () => {
	const stack = families('font-pinyin');

	it('is led by faces that carry ǖ ǘ ǚ ǜ, on every platform', () => {
		// Everything before the first generic keyword is a real face the browser may choose.
		const named = stack.slice(
			0,
			stack.findIndex((name) => name === 'system-ui' || name === 'sans-serif')
		);
		expect(named.length).toBeGreaterThan(0);
		expect(named.filter((name) => !HAS_TONE_MARKS.includes(name))).toEqual([]);
	});

	it('puts no known-incomplete face in front of them', () => {
		const firstGap = stack.findIndex((name) => KNOWN_GAPS.includes(name));
		expect(firstGap).toBe(-1);
	});

	it('names a face for each of macOS, Windows and Linux, so nobody falls through to generic', () => {
		expect(stack).toContain('PingFang SC');
		expect(stack).toContain('Microsoft YaHei');
		expect(stack).toContain('Noto Sans SC');
	});

	it('ends in a generic keyword so there is always something to render with', () => {
		expect(stack.at(-1)).toBe('sans-serif');
	});
});

describe('--font-hanzi', () => {
	const stack = families('font-hanzi');

	it('leads with the same face as the pinyin stack, so a headword and its reading match', () => {
		expect(stack[0]).toBe(families('font-pinyin')[0]);
	});

	it('carries a Chinese face for every platform', () => {
		for (const face of ['PingFang SC', 'Noto Sans SC', 'Microsoft YaHei', 'Heiti SC']) {
			expect(stack).toContain(face);
		}
	});
});

describe('--font-sans', () => {
	it('keeps CJK faces at the tail, so an inline 汉字 in English copy still gets a real face', () => {
		const stack = families('font-sans');
		expect(stack).toContain('PingFang SC');
		expect(stack.indexOf('PingFang SC')).toBeGreaterThan(stack.indexOf('Arial'));
	});
});

describe('the tone palette', () => {
	/** Relative luminance per WCAG 2.1. */
	function luminance(hex: string): number {
		const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
		const linear = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
		return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
	}

	function contrast(a: string, b: string): number {
		const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
		return (hi + 0.05) / (lo + 0.05);
	}

	/**
	 * Every surface a tone-coloured syllable is allowed to land on, in both themes. The two
	 * tinted ones matter because an answered choice card paints its background and the pinyin
	 * of the missed word sits on top of it.
	 */
	const SURFACES = {
		light: {
			tones: ['#5a6674', '#b8440c', '#356807', '#1f5fbf', '#7a3fa8'],
			grounds: ['#faf8f5', '#ffffff', '#f1ede6', '#fceaec', '#e4f2eb']
		},
		dark: {
			tones: ['#8fa0b4', '#ec6316', '#63ad24', '#7faeff', '#c08feb'],
			grounds: ['#100f0e', '#191714', '#211e1a', '#351a15', '#102b22']
		}
	};

	it('declares exactly the values these contrast numbers were measured against', () => {
		for (const [theme, { tones }] of Object.entries(SURFACES)) {
			for (const [i, value] of tones.entries()) {
				const declared = new RegExp(`--hq-tone-${i}: ${value};`, 'u').test(CSS);
				expect(declared, `${theme} --hq-tone-${i} should be ${value}`).toBe(true);
			}
		}
	});

	it('clears 4.5:1 on every surface, in both themes', () => {
		const failures: string[] = [];
		for (const [theme, { tones, grounds }] of Object.entries(SURFACES)) {
			for (const [i, tone] of tones.entries()) {
				for (const ground of grounds) {
					const ratio = contrast(tone, ground);
					if (ratio < 4.5) failures.push(`${theme} tone-${i} on ${ground}: ${ratio.toFixed(2)}`);
				}
			}
		}
		expect(failures).toEqual([]);
	});
});
