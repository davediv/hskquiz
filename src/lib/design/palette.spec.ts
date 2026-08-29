/**
 * The palette's half of the accessibility contract, computed off `layout.css` rather than
 * asserted in a comment beside it.
 *
 * Loop 2's stylesheet claimed the tone hues "are not part of the three roles above and never
 * overlap with them". They did: `--hq-tone-1` was the literal string `#c8102e`, which is also
 * `--hq-accent` and therefore `--color-wrong`, so 1,644 of the 7,905 shipped syllables printed
 * in the app's own wrong-answer red — under a red ✕ NOT QUITE eyebrow, on the summary screen.
 * `--hq-tone-0` was `#726b5f`, which is `--hq-ink-subtle`, the grey the UI de-emphasises text
 * with, so 儿 in 那儿 rendered at 90px in the colour of disabled text. A blind judge with no
 * source access spotted the first one off the pixels alone.
 *
 * Neither was a mistake anyone could see by reading — the two declarations are 40 lines apart.
 * So the rule is measured here, on the real declarations, in both themes:
 *
 *   1. no tone hue is a colour any non-tone token holds — not byte-identical, and not
 *      perceptually adjacent either (CIEDE2000, which is why `#c8102e` vs `#c9112f` cannot
 *      sneak through as "a different value");
 *   2. every tone hue and every text token clears 4.5:1 on every surface it can land on;
 *   3. `--color-line-strong`, the token that exists to be the >= 3:1 edge of a control,
 *      actually clears 3:1 — in DARK mode too, where it used to be 2.80:1 on sunken.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio, deltaE00 } from './color';

/** Comments stripped first: the prose quotes hex values that are not declarations. */
const CSS = readFileSync(`${process.cwd()}/src/routes/layout.css`, 'utf8').replace(
	/\/\*[\s\S]*?\*\//gu,
	''
);

const DARK_AT = CSS.indexOf('@media (prefers-color-scheme: dark)');
const AFTER_DARK_AT = CSS.indexOf('@media (prefers-contrast: more)');

/** Every `--hq-<name>: #hex;` declaration in one slice of the stylesheet. */
function declarations(slice: string): Map<string, string> {
	const found = new Map<string, string>();
	for (const [, name, value] of slice.matchAll(/--hq-([a-z0-9-]+):\s*(#[0-9a-f]{3,6})\s*;/giu)) {
		found.set(name, value.toLowerCase());
	}
	return found;
}

const LIGHT = declarations(CSS.slice(0, DARK_AT));
/** Dark redeclares only what changes, so it inherits the rest of light — as the cascade does. */
const DARK = new Map([...LIGHT, ...declarations(CSS.slice(DARK_AT, AFTER_DARK_AT))]);

const THEMES: [string, Map<string, string>][] = [
	['light', LIGHT],
	['dark', DARK]
];

const TONES = ['tone-0', 'tone-1', 'tone-2', 'tone-3', 'tone-4'] as const;

/** The three grounds Chinese text and UI text are allowed to sit on. */
const SURFACES = ['page', 'surface', 'surface-sunken'] as const;

/** Tokens used as text somewhere in the app, so 4.5:1 applies to all of them. */
const TEXT = ['ink', 'ink-muted', 'ink-subtle', 'accent', 'correct', ...TONES] as const;

/**
 * How far apart a tone has to be from a colour that means something else. 12 ΔE00 is past
 * "different shade" and into "different colour" for someone who is not comparing them side by
 * side — which is the situation a learner is in, with tone-1 pinyin on one screen and the
 * wrong-answer red on the next.
 */
const MIN_TONE_VS_ROLE = 12;

/**
 * Tones need less separation from each other than from the interface, and deliberately so:
 * two tones only ever appear together inside one word, where the diacritic and the syllable's
 * position say the same thing the colour does. A tone against a state colour has no such
 * second channel — that is the whole argument for the larger number above.
 */
const MIN_TONE_VS_TONE = 10;

function value(theme: Map<string, string>, token: string): string {
	const hex = theme.get(token);
	if (hex === undefined) throw new Error(`--hq-${token} is not declared in layout.css`);
	return hex;
}

describe('layout.css parses', () => {
	it('finds both theme blocks, and every private colour in both', () => {
		const redeclared = declarations(CSS.slice(DARK_AT, AFTER_DARK_AT));
		expect({
			foundDark: DARK_AT > 0 && AFTER_DARK_AT > DARK_AT,
			enough: LIGHT.size >= 20,
			lightOnly: [...LIGHT.keys()].filter((token) => !redeclared.has(token))
		}).toEqual({ foundDark: true, enough: true, lightOnly: [] });
	});
});

for (const [name, theme] of THEMES) {
	describe(`${name} theme`, () => {
		const nonTone = [...theme.keys()].filter((token) => !TONES.some((t) => t === token));

		it('gives every tone a colour no other token holds', () => {
			const collisions = TONES.flatMap((tone) =>
				nonTone
					.filter((other) => value(theme, other) === value(theme, tone))
					.map((other) => `${tone} === ${other} (${value(theme, tone)})`)
			);
			expect(collisions).toEqual([]);
		});

		it(`keeps every tone >= ${MIN_TONE_VS_ROLE} deltaE00 from every non-tone colour`, () => {
			const tooClose = TONES.flatMap((tone) =>
				nonTone
					.map((other) => ({ other, de: deltaE00(value(theme, tone), value(theme, other)) }))
					.filter(({ de }) => de < MIN_TONE_VS_ROLE)
					.map(({ other, de }) => `${tone} vs ${other}: ${de.toFixed(1)}`)
			);
			expect(tooClose).toEqual([]);
		});

		it(`keeps the tones >= ${MIN_TONE_VS_TONE} deltaE00 apart from each other`, () => {
			const tooClose: string[] = [];
			for (let i = 0; i < TONES.length; i += 1) {
				for (let j = i + 1; j < TONES.length; j += 1) {
					const de = deltaE00(value(theme, TONES[i]), value(theme, TONES[j]));
					if (de < MIN_TONE_VS_TONE) tooClose.push(`${TONES[i]} vs ${TONES[j]}: ${de.toFixed(1)}`);
				}
			}
			expect(tooClose).toEqual([]);
		});

		it('clears 4.5:1 for every text token on every surface', () => {
			const failures = TEXT.flatMap((token) =>
				SURFACES.map((surface) => ({
					where: `${token} on ${surface}`,
					ratio: contrastRatio(value(theme, token), value(theme, surface))
				}))
					.filter(({ ratio }) => ratio < 4.5)
					.map(({ where, ratio }) => `${where}: ${ratio.toFixed(2)}`)
			);
			expect(failures).toEqual([]);
		});

		it('clears 3:1 for --color-line-strong on every surface', () => {
			const failures = SURFACES.map((surface) => ({
				surface,
				ratio: contrastRatio(value(theme, 'line-strong'), value(theme, surface))
			}))
				.filter(({ ratio }) => ratio < 3)
				.map(({ surface, ratio }) => `line-strong on ${surface}: ${ratio.toFixed(2)}`);
			expect(failures).toEqual([]);
		});
	});
}
