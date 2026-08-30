/**
 * The scale's half of the design system's contract, computed off the repo rather than
 * asserted in a comment.
 *
 * `palette.spec.ts` did this for colour a loop ago, and it worked: the tone hues stopped
 * drifting into the interface's reds and greys because a test read the declarations and
 * failed. Space and type had no equivalent, and it showed. For three loops `layout.css` said
 * "Every gap between blocks should be one of these, not a number somebody picked while looking
 * at one screen" over ~120 hand-written rem literals; `.stack` was documented in detail and
 * called zero times; `--spacing-block`, `--spacing-section` and `--text-hanzi-2xl` were
 * declared and consumed by nothing. None of it could fail, so none of it moved.
 *
 * Four rules live here. Two are absolute, two are ratchets.
 *
 *   1. SPACE IS ON THE RAMP. Every `gap` / `margin` / `padding` literal under `src/` resolves
 *      to a declared step — including through `calc(var(--spacing) * n)`, because a fractional
 *      n is a half-step wearing a token's clothes. Absolute (zero) for the files the design
 *      system owns; a falling ceiling for the screens, which carried 131 of these when the
 *      test landed.
 *
 *   2. EVERY DECLARED TOKEN HAS A CONSUMER. A step that nothing asks for is not a step, it is
 *      a paragraph. Covers every `@theme` family with a utility namespace — spacing, text,
 *      font, radius, shadow, container, ease, animate — and counts both `var()` references and
 *      the generated utility, the latter only where a class attribute actually names it. A
 *      `--text-hanzi-*` mentioned only by `Hanzi.svelte`'s own SIZE_CLASS lookup does not count
 *      as being asked for: that map names every size whether or not a screen ever picks one,
 *      which is exactly how `--text-hanzi-2xl` survived three reviews. Absolute.
 *
 *   3. A DILUTED BORDER IS NOT A CONTROL EDGE. `--color-line-strong` sits ON the 3:1 floor, so
 *      there is almost no room under it: this computes where a `color-mix` toward the page
 *      crosses, and then checks every such border in the repo against its own ground. One that
 *      lands under 3:1 has to belong to a state that fill and text also carry — the same
 *      "never the only channel" rule the ✕ on a wrong answer obeys.
 *
 *   4. EVERY OPT-IN CLASS HAS A CALLER. The set of classes `layout.css` declares and no
 *      component uses may only shrink. A ratchet rather than an absolute because the fix is to
 *      adopt the class in a screen, and screens are not this file's to edit.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrastRatio, parseHex } from './color';

const ROOT = process.cwd();
const LAYOUT = 'src/routes/layout.css';

/**
 * The files the design system itself owns. These carry no debt in either ratchet: a system
 * that breaks its own rules has no standing to hold anyone else to them.
 */
const SYSTEM = (path: string): boolean => path === LAYOUT || path.startsWith('src/lib/design/');

interface Source {
	path: string;
	code: string;
}

function walk(dir: string): string[] {
	const found: string[] = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) found.push(...walk(full));
		else if (/\.(?:svelte|css)$/u.test(entry)) found.push(full);
	}
	return found.sort();
}

/** Comments first: prose quotes numbers and hex values that are not declarations. */
const strip = (text: string): string =>
	text.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/<!--[\s\S]*?-->/gu, '');

const SOURCES: Source[] = walk(join(ROOT, 'src')).map((full) => ({
	path: relative(ROOT, full).replaceAll('\\', '/'),
	code: strip(readFileSync(full, 'utf8'))
}));

const CSS = SOURCES.find((source) => source.path === LAYOUT)?.code ?? '';
const THEME_AT = CSS.indexOf('@theme static');
const BASE_AT = CSS.indexOf('@layer base');

/* ------------------------------------------------------------------ 1. space is on the ramp */

/**
 * The ramp, in px, read off `layout.css` rather than retyped: the named steps plus the two
 * role aliases that are lengths in their own right (the 20px page gutter, the 44px tap
 * target). `0` is always fine — it is the absence of a gap, not a chosen one.
 */
const RAMP: ReadonlySet<number> = new Set(
	[0].concat(
		[...CSS.slice(THEME_AT, BASE_AT).matchAll(/--spacing-([a-z0-9]+):\s*([0-9.]+)rem\s*;/giu)].map(
			([, , rem]) => Number(rem) * 16
		)
	)
);

const SPACING_DECL =
	/(?:^|[;{}\s])((?:row-|column-)?gap|(?:margin|padding)(?:-(?:inline|block))?(?:-(?:start|end|top|right|bottom|left))?)\s*:\s*([^;}]+)/gu;
const LENGTH = /(-?\d*\.?\d+)(rem|px)\b/gu;
/** `calc(var(--spacing) * 2.5)` is 10px however innocent the token makes it look. */
const SPACING_CALC = /calc\(\s*var\(--spacing\)\s*\*\s*(-?\d*\.?\d+)\s*\)/gu;

interface OffRamp {
	path: string;
	property: string;
	value: string;
	px: number;
}

function offRamp(): OffRamp[] {
	const found: OffRamp[] = [];
	for (const { path, code } of SOURCES) {
		for (const [, property, raw] of code.matchAll(SPACING_DECL)) {
			const value = raw.trim().replace(/\s+/gu, ' ');
			const sizes = [...value.matchAll(SPACING_CALC)].map(([, n]) => Number(n) * 4);
			for (const [, n, unit] of value.replace(SPACING_CALC, '').matchAll(LENGTH)) {
				sizes.push(unit === 'px' ? Number(n) : Number(n) * 16);
			}
			for (const px of sizes) {
				if (!RAMP.has(Math.abs(px))) found.push({ path, property, value, px });
			}
		}
	}
	return found;
}

/**
 * What the screens carry, measured: 135 literals in 21 files. EXACTLY the measurement, with no
 * slack over it — a ceiling with room in it is a budget, not a ratchet, and the loop-4 verdict
 * was right that nobody was required to pay the debt down while six spare units sat above it.
 * Zero slack means the next off-ramp gap anyone writes goes red on the change that writes it.
 * When it does: the failure message names the file and the count, and the fix is a
 * `--spacing-*` step, not a bigger number here. Lowering it as a file is cleaned up is the only
 * edit this line should ever get.
 */
const OFF_RAMP_CEILING = 135;

describe('space is on the ramp', () => {
	const violations = offRamp();

	it('reads the ramp out of layout.css', () => {
		expect([...RAMP].sort((a, b) => a - b)).toEqual([0, 4, 8, 12, 16, 20, 24, 32, 44, 48]);
	});

	it('is absolute for the design system itself', () => {
		const ours = violations
			.filter(({ path }) => SYSTEM(path))
			.map(({ path, property, value, px }) => `${path}: ${property}: ${value} → ${px}px`);
		expect(ours).toEqual([]);
	});

	it(`holds the screens to a falling ceiling (${OFF_RAMP_CEILING})`, () => {
		const byFile = new Map<string, number>();
		for (const { path } of violations) byFile.set(path, (byFile.get(path) ?? 0) + 1);
		const report = [...byFile]
			.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
			.map(([path, count]) => `${count} ${path}`);

		expect({ total: violations.length, report }).toEqual({
			total: Math.min(violations.length, OFF_RAMP_CEILING),
			report
		});
	});
});

/* ------------------------------------------------ 2. every declared token has a consumer */

/** Class names a file actually puts on an element, plus any `@apply` list. */
function classWords(code: string): string {
	const words: string[] = [];
	for (const match of code.matchAll(/class(?:Name)?\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([^}]*)\})/gu)) {
		words.push(match[1] ?? match[2] ?? match[3] ?? '');
	}
	for (const [, name] of code.matchAll(/class:([a-z0-9-]+)/giu)) words.push(name);
	for (const [, list] of code.matchAll(/@apply\s+([^;]+);/gu)) words.push(list);
	return words.join(' ');
}

const CLASS_WORDS = SOURCES.map(({ path, code }) => ({ path, words: classWords(code) }));

/**
 * The utility each token family generates, by the Tailwind v4 namespace rules. Spacing gets
 * the long prefix list; the rest are one prefix each. Matched only inside class attributes, so
 * the CSS property `inset-block` is never mistaken for an `inset-{step}` utility.
 *
 * `--color-*` is deliberately absent: `palette.spec.ts` owns those, and `toneColor()` builds
 * `var(--color-tone-${tone})` at runtime, which no static search can see.
 */
const SPACING_PREFIX =
	'(?:-?(?:p|px|py|pt|pb|pl|pr|ps|pe|m|mx|my|mt|mb|ml|mr|ms|me|gap|gap-x|gap-y|space-x|space-y|w|h|size|min-w|min-h|max-w|max-h|inset|inset-x|inset-y|top|right|bottom|left|start|end|basis|translate-x|translate-y|scroll-m|scroll-p|indent))';

const escapeRe = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

const UTILITY: Record<string, (step: string) => string> = {
	spacing: (step) => `${SPACING_PREFIX}-${escapeRe(step)}`,
	text: (step) => `text-${escapeRe(step)}`,
	font: (step) => `font-${escapeRe(step)}`,
	radius: (step) => `rounded-${escapeRe(step)}`,
	shadow: (step) => `(?:shadow|inset-shadow)-${escapeRe(step)}`,
	container: (step) => `max-w-${escapeRe(step)}`,
	ease: (step) => `ease-${escapeRe(step)}`,
	animate: (step) => `animate-${escapeRe(step)}`
};

/** The size lookup in `<Hanzi>` / `<Pinyin>` names every step; naming is not asking. */
const SIZE_MAP = /const SIZE_CLASS[\s\S]*?\n\t\};/u;
const IS_SIZE_COMPONENT = /design\/(?:Hanzi|Pinyin)\.svelte$/u;

function consumers(family: string, step: string): number {
	const token = `${family}-${step}`;
	const utility = new RegExp(`(?<![a-z0-9-])${UTILITY[family](step)}(?![a-z0-9-])`, 'gu');
	const reference = new RegExp(`var\\(--${escapeRe(token)}[),]`, 'gu');

	let count = 0;
	for (const { path, code } of SOURCES) {
		// The `@theme` block is the declaration, not a use of it.
		let hay = path === LAYOUT ? code.slice(0, THEME_AT) + code.slice(BASE_AT) : code;
		if (IS_SIZE_COMPONENT.test(path)) hay = hay.replace(SIZE_MAP, '');
		count += (hay.match(reference) ?? []).length;
	}
	for (const { path, words } of CLASS_WORDS) {
		if (IS_SIZE_COMPONENT.test(path)) continue;
		count += (words.match(utility) ?? []).length;
	}
	if (/^text-(?:hanzi|pinyin)-/u.test(token)) {
		const component = token.startsWith('text-hanzi') ? 'Hanzi' : 'Pinyin';
		const prop = new RegExp(
			`<${component}\\b[^>]*?size="${escapeRe(step.split('-').pop() ?? '')}"`,
			'gu'
		);
		for (const { code } of SOURCES) count += (code.match(prop) ?? []).length;
	}
	return count;
}

/**
 * Every token declared in `@theme`, minus the `--text-x--line-height` modifiers, which ride
 * their step rather than being one.
 */
const TOKENS = [...CSS.slice(THEME_AT).matchAll(/\n\t--([a-z]+)-([a-z0-9-]+):/gu)]
	.map(([, family, step]) => ({ family, step, token: `${family}-${step}` }))
	.filter(({ family, step }) => UTILITY[family] !== undefined && !step.includes('--'))
	.filter((one, i, all) => all.findIndex((other) => other.token === one.token) === i);

describe('every declared token has a consumer', () => {
	it('finds the tokens', () => {
		expect(TOKENS.length).toBeGreaterThan(40);
	});

	it('has something asking for each one', () => {
		const dead = TOKENS.filter(({ family, step }) => consumers(family, step) === 0).map(
			({ token }) => token
		);
		expect(dead).toEqual([]);
	});
});

/* -------------------------------------------- 3. a diluted border is not a control edge */

/** `--hq-<name>: #hex` in one slice of the stylesheet, exactly as `palette.spec.ts` reads it. */
function privateColours(slice: string): Map<string, string> {
	const found = new Map<string, string>();
	for (const [, name, hex] of slice.matchAll(/--hq-([a-z0-9-]+):\s*(#[0-9a-f]{3,6})\s*;/giu)) {
		found.set(name, hex.toLowerCase());
	}
	return found;
}

const DARK_AT = CSS.indexOf('@media (prefers-color-scheme: dark)');
const CONTRAST_AT = CSS.indexOf('@media (prefers-contrast: more)');
const LIGHT = privateColours(CSS.slice(0, DARK_AT));
const DARK = new Map([...LIGHT, ...privateColours(CSS.slice(DARK_AT, CONTRAST_AT))]);
const THEMES: [string, Map<string, string>][] = [
	['light', LIGHT],
	['dark', DARK]
];

/** `--color-surface: var(--hq-surface)` — the public name a component actually writes. */
const SEMANTIC = new Map(
	[...CSS.slice(THEME_AT).matchAll(/--color-([a-z0-9-]+):\s*var\(--hq-([a-z0-9-]+)\)/giu)].map(
		([, name, target]) => [name, target]
	)
);

function resolve(theme: Map<string, string>, reference: string): string | null {
	const token = /var\(--color-([a-z0-9-]+)\)/u.exec(reference)?.[1];
	if (token === undefined) return /^#[0-9a-f]{3,6}$/iu.test(reference.trim()) ? reference : null;
	const target = SEMANTIC.get(token);
	return target === undefined ? null : (theme.get(target) ?? null);
}

/** sRGB mix, which is what `color-mix(in srgb, …)` computes. */
function mix(a: string, b: string, percent: number): string {
	const [ar, ag, ab] = parseHex(a);
	const [br, bg, bb] = parseHex(b);
	const t = percent / 100;
	return `#${[
		[ar, br],
		[ag, bg],
		[ab, bb]
	]
		.map(([one, two]) => Math.round(one * t + two * (1 - t)))
		.map((channel) => channel.toString(16).padStart(2, '0'))
		.join('')}`;
}

const SURFACES = ['page', 'surface', 'surface-sunken'] as const;

describe('a diluted border is not a control edge', () => {
	it('has almost no room under --color-line-strong: 20% of dilution is already illegal', () => {
		const floors = THEMES.flatMap(([name, theme]) =>
			SURFACES.map((surface) => {
				const strong = theme.get('line-strong') ?? '';
				const ground = theme.get(surface) ?? '';
				let lowest = 100;
				for (let percent = 100; percent >= 1; percent -= 1) {
					if (contrastRatio(mix(strong, ground, percent), ground) < 3) break;
					lowest = percent;
				}
				return { where: `${name}/${surface}`, lowest };
			})
		);
		// Measured: 93 / 89 / 99 light and 83 / 86 / 91 dark on page / surface / sunken. So the
		// widest room anywhere is 17%, and "70% of the strong line" — the mix that shipped —
		// cannot be a control edge on any surface in either theme. Asserted as a bound rather
		// than as six numbers so a palette tweak that WIDENS the room reads as a real change
		// instead of as churn in the test.
		expect(floors.filter(({ lowest }) => lowest < 80)).toEqual([]);
	});

	it('checks every color-mix border in the repo against its own ground', () => {
		const failures: string[] = [];
		for (const { path, code } of SOURCES) {
			for (const match of code.matchAll(
				/border(?:-(?:inline|block))?(?:-(?:start|end|top|right|bottom|left))?(?:-color)?\s*:[^;}]*?(color-mix\((?:[^()]|\([^()]*\))*\))/gu
			)) {
				const open = code.lastIndexOf('{', match.index);
				const close = code.indexOf('}', match.index);
				const rule = code.slice(open + 1, close === -1 ? undefined : close);
				const parts = /color-mix\(\s*in srgb\s*,\s*([^,]+?)\s+(\d+)%\s*,\s*([^)]+)\)/u.exec(
					match[1]
				);
				if (parts === null) continue;
				const [, from, percent, to] = parts;
				const declaredGround = /background-color\s*:\s*(var\(--color-[a-z0-9-]+\))/u.exec(
					rule
				)?.[1];
				const multiChannel =
					/background-color\s*:/u.test(rule) && /(?:^|[;{\s])color\s*:/u.test(rule);

				for (const [name, theme] of THEMES) {
					const a = resolve(theme, from);
					const b = resolve(theme, to.trim() === 'transparent' ? from : to);
					const ground = resolve(theme, declaredGround ?? 'var(--color-page)');
					if (a === null || b === null || ground === null) continue;
					const ratio = contrastRatio(mix(a, b, Number(percent)), ground);
					if (ratio >= 3 || multiChannel) continue;
					failures.push(
						`${path} (${name}): ${match[1]} is ${ratio.toFixed(2)}:1 and the rule carries no other channel`
					);
				}
			}
		}
		expect(failures).toEqual([]);
	});
});

/* ------------------------------------------------------ 4. every opt-in class has a caller */

/**
 * Declared and never called on the day this test landed. The set may only shrink: adopting one
 * of these in a screen is the fix, and adding a new orphan is the failure. `.app-shell` and
 * `.stack` are the expensive two — between them they are the whole documented rhythm, and no
 * screen has taken them yet, which is why the quiz column's 206px void is still an accident of
 * `justify-content: center` rather than `--spacing-section` said out loud.
 */
const UNADOPTED: readonly string[] = [
	'app-shell',
	'btn-accent',
	'meter',
	'no-select',
	'stack',
	'stack-2xl',
	'stack-2xs',
	'stack-lg',
	'stack-md',
	'stack-sm',
	'stack-xl',
	'stack-xs',
	'tap'
];

describe('every opt-in class has a caller', () => {
	const declared = new Set<string>();
	for (const [, name] of CSS.matchAll(/@utility\s+([a-z0-9-]+)/gu)) declared.add(name);
	const components = CSS.slice(CSS.indexOf('@layer components'));
	for (const [, name] of components.matchAll(/(?:^|[,\s])\.([a-z][a-z0-9-]*)/gmu)) {
		declared.add(name);
	}

	const orphans = [...declared]
		.filter(
			(name) =>
				!CLASS_WORDS.some(
					({ path, words }) =>
						path.endsWith('.svelte') &&
						new RegExp(`(?<![a-z0-9-])${name}(?![a-z0-9-])`, 'u').test(words)
				)
		)
		.sort();

	it('declares a real set of classes', () => {
		expect(declared.size).toBeGreaterThan(15);
	});

	it('adds no new orphan, and loses them over time', () => {
		expect(orphans.filter((name) => !UNADOPTED.includes(name))).toEqual([]);
	});
});
