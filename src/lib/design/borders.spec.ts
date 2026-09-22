/**
 * The consumer half of the line-token contract.
 *
 * `palette.spec.ts` proves `--color-line-strong` clears 3:1 on every surface, in both themes,
 * and that is not enough: for four loops the Listen pill, the Entry pill and `.card` sat on
 * `--color-line` at 1.23:1 (light) / 1.34:1 (dark) while the token that measured 3:1 was the
 * border on the choice buttons, the search field and `.btn-quiet`. A token that clears 3:1 in
 * a test and 1.23:1 on screen is the same class of defect as a fidelity assertion that never
 * looked at a consumer.
 *
 * This file reads every `.svelte` and `.css` under `src/`, collects each
 * `border*: … var(--color-line…)` declaration, and fails any whose selector is not on the
 * allow-list of inside-a-surface rules. `--color-line-strong` is the on-page edge and does
 * not need a hall pass. `--color-line` / `--hq-line` is the hairline for a rule *inside* a
 * surface — WordRow, YOU PICKED, the sheet's section rules — and for a handful of on-page
 * controls this piece is not allowed to edit, which the list names and which may only shrink.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

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

/** CSS comments only — an HTML `<!--` strip would eat a Svelte `<style>` that follows `-->` in markup. */
const stripCss = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//gu, '');

const SOURCES: Source[] = walk(join(ROOT, 'src')).map((full) => ({
	path: relative(ROOT, full).replaceAll('\\', '/'),
	code: readFileSync(full, 'utf8')
}));

/** A Svelte file's borders live in `<style>`; the markup above it is not a selector. */
function styleSheets(path: string, code: string): string[] {
	const blocks = path.endsWith('.svelte')
		? [...code.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gu)].map((match) => match[1])
		: [code];
	return blocks.map(stripCss);
}

function selectorAt(css: string, index: number): string {
	const open = css.lastIndexOf('{', index);
	if (open < 0) return '';
	const prev = Math.max(css.lastIndexOf('{', open - 1), css.lastIndexOf('}', open - 1));
	return css
		.slice(prev + 1, open)
		.replace(/\s+/gu, ' ')
		.trim();
}

interface Border {
	id: string;
	path: string;
	selector: string;
	property: string;
	value: string;
	strong: boolean;
}

const BORDER =
	/((?:border)(?:-[\w]+)*)\s*:\s*([^;}]*?var\(--(?:color|hq)-line(?:-strong)?\)[^;}]*)/gu;

function collect(): Border[] {
	const found: Border[] = [];
	for (const { path, code } of SOURCES) {
		for (const css of styleSheets(path, code)) {
			for (const match of css.matchAll(BORDER)) {
				if (match.index === undefined) continue;
				const property = match[1];
				if (property === 'border-radius' || property.startsWith('border-spacing')) continue;
				const value = match[2].replace(/\s+/gu, ' ').trim();
				const selector = selectorAt(css, match.index);
				if (selector.startsWith('@')) continue;
				found.push({
					id: `${path} ${selector}`,
					path,
					selector,
					property,
					value,
					strong: /line-strong/u.test(value)
				});
			}
		}
	}
	return found;
}

const BORDERS = collect();

/**
 * Selectors allowed to paint `var(--color-line)` (the 1.23:1 hairline) as a border. Everything
 * else that sits on the page has to use `--color-line-strong`.
 *
 * Two kinds of entry, and they are not the same:
 *
 *   1. INSIDE A SURFACE — WordRow, YOU PICKED, sheet section rules, chrome hairlines, the
 *      keyboard glyph inside a choice button. A hairline is the whole point. These stay.
 *   2. ON-PAGE DEBT — controls this piece cannot edit. The fix is one token swap to
 *      `--color-line-strong`. The set may only shrink: a stale entry (the rule already uses
 *      the strong token, or the selector is gone) fails so the list is taken in, and a new
 *      hairline on a new control is not on this list so it fails too.
 */
const ALLOW: readonly string[] = [
	// --- inside a surface -------------------------------------------------------
	'src/lib/components/browse/CharacterCard.svelte .card',
	'src/lib/components/browse/CharacterCard.svelte .more',
	'src/lib/components/browse/CharacterCard.svelte .rows > li + li .row',
	'src/lib/components/browse/ExampleSentence.svelte .example',
	'src/lib/components/browse/WordRow.svelte .row',
	'src/lib/components/browse/WordSheet.svelte .chars',
	'src/lib/components/browse/WordSheet.svelte .record',
	'src/lib/components/quiz/ChoiceButton.svelte .key',
	'src/lib/components/quiz/ResultsFallback.svelte .list',
	'src/lib/components/quiz/ResultsFallback.svelte .row',
	'src/lib/components/shell/AppBar.svelte .bar.scrolled',
	'src/lib/components/shell/SiteFooter.svelte .foot',
	'src/lib/components/summary/SessionSummary.svelte .solved',
	'src/lib/components/summary/WordCard.svelte .contrast',
	'src/lib/components/summary/WordCard.svelte .pole-pick',
	'src/lib/progress/StorageNotice.svelte .storage-notice',
	'src/routes/+page.svelte .hskq-strip',
	'src/routes/browse/[level]/+page.svelte .controls',
	'src/routes/browse/[level]/+page.svelte .hop-wait',
	'src/routes/browse/[level]/+page.svelte .skeleton',
	'src/routes/layout.css hr',
	// --- on-page debt: migrate to --color-line-strong ---------------------------
	'src/lib/components/browse/StatusFilter.svelte .chip-btn',
	'src/lib/components/browse/WordSheet.svelte .speak',
	'src/lib/components/summary/ReviewDrill.svelte .drill',
	'src/lib/components/summary/SessionSummary.svelte .chip',
	'src/routes/browse/[level]/+page.svelte .hop'
];

const ALLOW_SET = new Set(ALLOW);

describe('a hairline is not a control edge', () => {
	const hair = BORDERS.filter((border) => !border.strong);
	const ids = [...new Set(hair.map((border) => border.id))].sort();

	it('finds the line-token borders in src/', () => {
		expect({
			any: BORDERS.length > 20,
			hair: hair.length > 15,
			strong: BORDERS.some((border) => border.strong)
		}).toEqual({ any: true, hair: true, strong: true });
	});

	it('puts --color-line-strong on the Listen pill and on .card', () => {
		const strong = new Set(BORDERS.filter((border) => border.strong).map((border) => border.id));
		expect({
			say: strong.has('src/lib/components/summary/SpeakButton.svelte .say'),
			card: strong.has('src/routes/layout.css .card')
		}).toEqual({ say: true, card: true });
	});

	it('does not fill the Listen pill with --color-surface', () => {
		const speak = SOURCES.find((source) => source.path.endsWith('SpeakButton.svelte'));
		const css = speak ? styleSheets(speak.path, speak.code).join('\n') : '';
		const open = css.search(/(?:^|[;{}\s])\.say\s*\{/u);
		const close = open < 0 ? -1 : css.indexOf('}', open);
		const rule = open < 0 ? '' : css.slice(open, close);
		expect(rule).not.toMatch(/background-color\s*:\s*var\(--color-surface\)/u);
	});

	it('fails any --color-line border whose selector is not on the allow-list', () => {
		const extra = ids.filter((id) => !ALLOW_SET.has(id));
		const stale = ALLOW.filter((id) => !ids.includes(id));
		expect({ extra, stale }).toEqual({ extra: [], stale: [] });
	});
});
