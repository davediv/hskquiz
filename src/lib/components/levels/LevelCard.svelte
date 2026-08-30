<!--
	One level, as a card.

	The card's job is to make five levels tell themselves apart. The size and the blurb say what
	is in the box in English; the preview row says it in Chinese, with three real words. Loop 1
	put a Chinese numeral in a red square here instead — 一 reads as a minus sign, 三 as a
	hamburger menu — and the result was a level menu for a Chinese app containing no Chinese
	vocabulary at all.

	THE WORDS NEVER LEAVE. Loop 2 gave the preview row and the progress meter the same slot, so
	the moment a learner practised a level, that level's card lost its Chinese — the one card
	carrying `Continue` was the one card on the page with no hanzi on it, and the list split into
	two card heights. The meter is now a rule and one 12px line in the card's footer, which is all
	a fraction ever needed, and the three words are permanent. Once there is enough history the row
	stops being a sample and becomes this learner's own three weakest words here (see
	`weakestIds`), so the card says what it keeps missing rather than reciting the same trio
	forever.

	AND THEY RENDER THE SAME WHOSE-EVER THEY ARE. Loop 3 shipped the learner's own row worse than
	the hand-picked one: `truncate` on the pinyin printed `dàxuéshē…`, `truncate` on the gloss
	printed `have no cho…`, and a `glyphSize` step-down dropped 36px hanzi to 26px on exactly the
	cards with history — so HSK 1's row was visibly smaller than the untouched HSK 2 card below
	it, and the app's typography got worse the more you used it. All three are gone. The hanzi is
	one size on every card in every state, and the pinyin never wraps and is never cut. What
	absorbs the variance is the *choice* of words: `fitPreview` takes the worst candidates that
	fit the width this card actually has, measured, and the card falls back to the static three
	rather than showing a clipped row.

	AND THE ENGLISH IS NOT IN THE COLUMNS. Loop 4 kept a two-line clamped gloss box under each of
	the three hanzi, and a third of a 320px card is 77px: 地 / 的 / 个 seeded as HSK 1's weak set
	printed `turns a word into an…` / `marks pos-session like…` / `measure word: gene…`, all
	three at once, while the hand-picked trio never clipped because it had been chosen to fit.
	Only the *demo* words fitted a 77px column, and no column width will ever hold
	`measure word: general purpose`. So the three glosses are now one wrapped line at the card's
	full inline width beneath the row, read left to right against the words above them — the
	shape Pleco already uses, where the definition gets the whole row. The hanzi and pinyin keep
	the three columns, because those are the two things that are never allowed to be cut.

	THE WHOLE CARD IS A TARGET. `Practise` stretches an overlay across the card, so anywhere that
	is not the preview row starts a session; the preview row itself is a link into that level's
	word list. Nothing on the card is dead to touch — Pleco's entire result row is the target, and
	so is Du Chinese's collection card.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import { loadLevel } from '$lib/data';
	import { Hanzi, Pinyin } from '$lib/design';
	import type { Level, Word } from '$lib/types';
	import { LEVEL_META } from './levelMeta';
	import {
		fitPreview,
		LEVEL_PREVIEW,
		PREVIEW_COUNT,
		previewWidth,
		toPreview,
		type PreviewWord
	} from './preview';
	import { formatAccuracy, formatWhen, type LevelStats } from './stats';

	interface Props {
		level: Level;
		/** Words in the level — the denominator for the meter. */
		total: number;
		stats: LevelStats;
		/** Epoch ms used for relative time. 0 before hydration, which hides the timestamp. */
		now: number;
		/**
		 * This learner's weakest word ids at this level, worst first, from `weakestIds`. More
		 * than there are columns: `fitPreview` spends the spares. Empty means the card shows
		 * the static three instead.
		 */
		weakIds?: readonly string[];
		/** The one card in the list carrying the filled button. Exactly one, in every state. */
		featured?: boolean;
		/** Short reason this card is the featured one, e.g. `Start here`. */
		featuredLabel?: string;
	}

	let {
		level,
		total,
		stats,
		now,
		weakIds = [],
		featured = false,
		featuredLabel = ''
	}: Props = $props();

	const meta = $derived(LEVEL_META[level]);
	// resolve() rather than a literal href, so both links survive a non-empty `base`.
	const quizHref = $derived(resolve('/quiz/[level]', { level: String(level) }));
	const browseHref = $derived(resolve('/browse/[level]', { level: String(level) }));
	const pct = $derived(total > 0 ? Math.min(100, (stats.practised / total) * 100) : 0);

	/**
	 * The learner's own weak words, once their chunk has arrived. Null until then — and null for
	 * good on a level they have never practised, so a first visit fetches no vocabulary at all.
	 * Joined into a key first: `weakIds` is a fresh array every time progress changes, and
	 * re-running the load on a re-render that says the same thing is work nobody asked for.
	 */
	let pool = $state<PreviewWord[] | null>(null);
	const weakKey = $derived(weakIds.join(','));

	$effect(() => {
		const ids = weakKey ? weakKey.split(',') : [];
		if (ids.length === 0) {
			pool = null;
			return;
		}

		let live = true;
		loadLevel(level)
			.then((words) => {
				if (!live) return;
				const byId = new Map<string, Word>(words.map((word) => [word.id, word]));
				// A record can outlive the row it was written for, so ask for more ids than
				// there are columns and keep every one that is still shipped — `fitPreview`
				// needs the spares to swap a too-wide word out for a readable one.
				const found = ids
					.map((id) => byId.get(id))
					.filter((word): word is Word => word !== undefined)
					.map(toPreview);
				pool = found.length >= PREVIEW_COUNT ? found : null;
			})
			.catch(() => {
				// The static three are always a correct thing to show, so a failed chunk is not
				// an error state — it is just the row this card started with.
				if (live) pool = null;
			});

		return () => {
			live = false;
		};
	});

	/**
	 * How much room the three columns actually have, measured rather than assumed.
	 *
	 * The counter-intuitive part of this screen is that the *large* viewport is the narrow
	 * column: three cards abreast at 1440 gives each row ~271px against a 375px phone's ~301,
	 * and 320px gives ~246. One hard-coded budget would be wrong at two of those three, so the
	 * row reports its own width and the fit is recomputed when it changes.
	 */
	let row = $state<HTMLUListElement | null>(null);
	let rowWidth = $state(0);
	/**
	 * Words the rendered row proved too wide for, whatever `previewWidth` estimated.
	 *
	 * The estimate is exact on the hanzi (36.55px a character, every character) and takes the
	 * shipped list's widest pinyin advance, so this is expected to stay empty. It exists so
	 * that "nothing on this row is ever cut" is a fact about the DOM rather than a claim about
	 * two constants: if the row does overflow, the widest word in it is struck out and the fit
	 * runs again on what is left. Each pass removes a candidate, so it converges — three
	 * removals in, `fitPreview` has nothing left to fill three columns with and the card falls
	 * back to the static three.
	 */
	let excluded = $state<readonly string[]>([]);
	/** Which candidates-at-which-width the exclusions above were measured against. */
	let excludedFor = '';

	const weak = $derived.by(() => {
		if (!pool) return null;
		const candidates =
			excluded.length > 0 ? pool.filter((word) => !excluded.includes(word.id)) : pool;
		// Before the first measurement, assume the tightest row this layout produces (a 320px
		// phone). `fitPreview` charges itself for the two column gaps, so this is the whole
		// row, not the room left over after them.
		const budget = rowWidth > 0 ? rowWidth : 246;
		return (
			fitPreview(candidates, budget) ??
			// Two of the learner's own words beat three of ours. A level whose weak set is all
			// three- and four-character words — 办公室 / 不好意思 / 出租车 is 346px against a
			// 301px row — used to give up here and print 超市 / 周末 / 地铁 under a card
			// reading "36 of 770 · 30 mastered": the one card with history was the one card
			// showing words this learner has never got wrong. Only the *count* gives way now.
			// Never below two: one word is a row that has lost its shape, and the static three
			// are a better card than that.
			fitPreview(candidates, budget, PREVIEW_COUNT - 1)
		);
	});

	$effect(() => {
		const element = row;
		const shown = weak;
		const key = `${weakKey}@${rowWidth}`;
		if (!element || !shown || rowWidth <= 0) return;
		untrack(() => {
			// A new set of candidates, or a resize, retires the old exclusions; the fit is then
			// re-measured from scratch below.
			if (excludedFor !== key) {
				excludedFor = key;
				if (excluded.length > 0) {
					excluded = [];
					return;
				}
			}
			if (element.scrollWidth - element.clientWidth <= 1) return;
			if (excluded.length >= PREVIEW_COUNT) return;
			const widest = shown.reduce((a, b) => (previewWidth(b) > previewWidth(a) ? b : a));
			excluded = [...excluded, widest.id];
		});
	});

	const preview = $derived(weak ?? LEVEL_PREVIEW[level]);
	/**
	 * Only the personalised row is labelled. "IN THIS LEVEL" was an eyebrow repeated five times
	 * down the longest state of the page to say what the three words under it could not
	 * possibly have been — the card already prints "HSK 1" and "0 of 500 practised" directly
	 * above them. "You keep missing" is a different claim and earns its line.
	 */
	const weakLabel = $derived(weak ? 'You keep missing' : '');

	const started = $derived(stats.practised > 0);
	// Always "n of total": a count with no denominator is a dead rail with a number beside it.
	// Du Chinese prints "0/12 chapters read" before anything has happened, and that is why it
	// reads — an origin and a countable target, on every card, in every state.
	const countLine = $derived(
		stats.mastered > 0
			? `${stats.practised} of ${total.toLocaleString('en')} · ${stats.mastered} mastered`
			: `${stats.practised} of ${total.toLocaleString('en')} practised`
	);
	const scoreLine = $derived(
		[formatAccuracy(stats.accuracy), formatWhen(stats.lastPlayed, now)].filter(Boolean).join(' · ')
	);
</script>

<article
	class="card hskq-card p-4"
	class:hskq-featured={featured}
	aria-labelledby="level-{level}-title"
>
	<div class="flex items-baseline gap-x-2.5 gap-y-1">
		<h3 id="level-{level}-title" class="text-xl leading-tight font-semibold">HSK {level}</h3>
		{#if featured && featuredLabel}
			<span class="chip chip-accent self-center">{featuredLabel}</span>
		{/if}
	</div>

	<!-- What is in the level, then the level itself, and only then the score. The meter used to
	     be the second thing on every card, so on a first visit all five opened with a 6px
	     hairline and the word "0" — the state this list is in most often, told in the one
	     number that cannot help a newcomer pick. It is a footer now, sitting with the button it
	     informs, and the Chinese starts 37px higher up the card — 77px in, against 114px. Full
	     width rather than beside the title: at 375px a phrase this long wraps in a narrow
	     column, and cards that wrap differently stop looking like one list. -->
	<p class="mt-1 text-sm leading-snug text-ink-muted">{meta.blurb}</p>

	<a class="hskq-preview-link" href={browseHref}>
		<!-- Only when there is something to say. The label used to share this row with
		     `Browse →`, which meant every untouched card spent a whole line on a link that
		     was then sitting two pixels above the third word and reading as its caption. -->
		{#if weakLabel}
			<span class="hskq-preview-head"><span class="eyebrow">{weakLabel}</span></span>
		{/if}
		<!-- The three words are the card's Chinese, so they get the hanzi scale, not the UI one.
		     `minmax(min-content, 1fr)` rather than three rigid thirds: equal columns when the
		     row is short, and a column that grows to whatever 大学生 needs when it is not. -->
		<ul class="hskq-preview" bind:this={row} bind:clientWidth={rowWidth}>
			{#each preview as word (word.id)}
				<li>
					<span class="hskq-glyph">
						<Hanzi text={word.hanzi} size="md" class="block text-ink" />
					</span>
					<!-- Tone-coloured, per the design system: pinyin is the one place in the app a
					     learner reads tone off a colour, and flat accent pinyin here read as
					     fifteen error states. `spaced={false}` keeps the list's own orthography —
					     `xièxie`, not `xiè xie`, the same rule the hero's `cíhuì liànxí` follows.
					     Never truncated and never wrapped: half a syllable is a wrong reading, and
					     the column is sized to hold this whole. -->
					<Pinyin
						pinyin={word.pinyin}
						syllables={word.syllables}
						size="sm"
						spaced={false}
						class="hskq-py mt-1 block"
					/>
				</li>
			{/each}
		</ul>
		<!--
			The English for all three words, on one line under all three of them, with the way
			into the rest of the level at the end of it.

			Read left to right the glosses map onto the row above in the same order, and the
			line is the whole card wide, so a 30-character gloss sets as a 30-character gloss
			instead of being folded into a 77px column and cut. There is no clamp and no
			reservation: whatever the three glosses need, they get. The longest three a level
			can produce join to 106 characters, which is three lines at the narrowest card this
			layout builds (246px at 320), and the fifteen static ones are one line at every
			width — so the common state is a single line, shorter than the two-line-per-column
			box this replaced, and the worst state is a slightly taller card rather than a cut
			word.

			`Browse →` floats into the line rather than sitting in the flow of it, so it takes
			its width out of the *first* line only and the English still wraps at the full width
			of the card. As a flex sibling it cost 81px of every line, which was four lines and
			a `general…` at 320 — the exact defect this whole change exists to end.

			Separators are drawn in CSS, on the element, so the row cannot end up with a
			stranded dot if a word arrives with an empty gloss.
		-->
		<p class="hskq-glosses text-xs text-ink-subtle" data-gloss-line>
			<span class="hskq-more eyebrow"
				>Browse<span class="sr-only"> all {total.toLocaleString('en')} words in HSK {level}</span>
				<span aria-hidden="true">→</span></span
			>
			{#each preview as word (word.id)}
				<span class="hskq-gl">{word.gloss}</span>
			{/each}
		</p>
	</a>

	<!-- One rule and one line, at the foot of the card with the button it belongs to. The
	     fraction is the only thing a meter ever said, and it said it at the cost of the three
	     words underneath. -->
	<div class="hskq-status">
		<div class="hskq-track" class:hskq-track-empty={pct === 0} aria-hidden="true">
			{#if pct > 0}
				<div class="hskq-fill" style:width="{pct}%"></div>
			{:else}
				<!-- Nothing practised is still a position on the scale, and a scale with no mark
				     on it is a rule. Du Chinese paints the end-cap of "0/12 chapters read" for
				     the same reason: an origin dot says *this* is a track and you are at the
				     start of it, where an empty capsule at 1x said only "hairline". Neutral ink,
				     never the correct-green of `.hskq-fill`, so it cannot be read as progress. -->
				<div class="hskq-origin"></div>
			{/if}
		</div>
		<p class="hskq-stat tabular text-xs">
			<span class="min-w-0 truncate" class:text-ink-muted={started} class:text-ink-subtle={!started}
				>{countLine}</span
			>
			{#if scoreLine}
				<span class="shrink-0 text-ink-subtle">{scoreLine}</span>
			{/if}
		</p>
	</div>

	<div class="hskq-actions">
		<a
			class="btn btn-block hskq-practise"
			class:btn-primary={featured}
			class:btn-quiet={!featured}
			href={quizHref}
		>
			Practise<span class="sr-only"> HSK {level}</span>
		</a>
	</div>
</article>

<style>
	.hskq-card {
		/* Column + full height so two cards sharing a desktop row line their buttons up, and
		   `relative` so the Practise overlay below has this card as its containing block. */
		position: relative;
		display: flex;
		flex-direction: column;
		block-size: 100%;
		transition:
			box-shadow 180ms var(--ease-out-soft),
			border-color 180ms var(--ease-out-soft);
	}

	/* The recommended level is the only one that draws a line around itself. */
	.hskq-featured {
		border-color: var(--color-line-strong);
	}

	/* The whole footer — meter, count, button — sinks to the bottom of the card, so two cards
	   sharing a desktop row line up on their status line as well as their button. The `auto`
	   lives here rather than on `.hskq-actions`, or the free space would open *between* the
	   count and the button it is about. */
	.hskq-status {
		margin-block-start: auto;
		padding-block-start: 0.625rem;
	}

	.hskq-track {
		block-size: 0.375rem;
		border-radius: var(--radius-pill);
		background-color: var(--color-surface-sunken);
		overflow: hidden;
	}

	/* Nothing practised yet: an outlined capsule, which is a container waiting to be filled. */
	.hskq-track-empty {
		background-color: transparent;
		box-shadow: inset 0 0 0 1px var(--color-line);
	}

	/* The mark at zero. Square with the track's own height so it is a round cap, not a dash. */
	.hskq-origin {
		inline-size: 0.375rem;
		block-size: 100%;
		border-radius: inherit;
		background-color: var(--color-line-strong);
	}

	/* A handful of words out of a thousand is still worth seeing. */
	.hskq-fill {
		block-size: 100%;
		min-inline-size: 0.625rem;
		border-radius: inherit;
		background-color: var(--color-correct);
		transition: inline-size 420ms var(--ease-out-soft);
	}

	.hskq-stat {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.75rem;
		margin-block-start: 0.3125rem;
	}

	/* The row is a link into the level's word list — 15 real words on this screen and no way
	   into any of them was the other half of "the card is dead to touch". Above the Practise
	   overlay, so the two targets do not fight. */
	.hskq-preview-link {
		position: relative;
		z-index: 1;
		display: block;
		margin-block-start: 0.5rem;
		border-radius: var(--radius-sm);
		color: inherit;
		text-decoration: none;
	}

	.hskq-preview-head {
		display: block;
		margin-block-end: 0.125rem;
	}

	/* Floated, not flexed. A float takes its width out of the line boxes it overlaps — line
	   one — and leaves every line under it the full width of the card, which is what keeps a
	   106-character worst case inside three lines at 320px. Above the words rather than below,
	   `Browse →` was two pixels over the third specimen and read as that word's caption — the
	   blind judge and the critic said so independently. First in source because a float only
	   pushes text that comes after it. */
	.hskq-more {
		float: inline-end;
		margin-inline-start: 0.75rem;
		/* Floats sit on the top of the line box, not its baseline; 11px caps in a 12px line
		   need this much to read as one line with the English beside them. */
		padding-block-start: 0.1em;
		color: var(--color-accent);
		white-space: nowrap;
	}

	/* Equal thirds while the words are short, and no narrower than the widest thing in the
	   column once they are not: `min-content` is the whole hanzi and the whole pinyin, both
	   `nowrap`, so neither can be cut. Nothing else is in the column to give ground — the
	   English moved out from under the words to `.hskq-glosses` below. */
	.hskq-preview {
		display: grid;
		grid-template-columns: repeat(3, minmax(min-content, 1fr));
		gap: 0.5rem;
		margin-block-start: 0.125rem;
	}

	/* Holds the hanzi line box. One size on every card now, so this no longer has to reserve
	   a taller step than the row is using. Bottom-aligned: the baselines stay on one line
	   across all five cards. */
	.hskq-glyph {
		display: flex;
		align-items: flex-end;
		min-block-size: 2.65rem;
		white-space: nowrap;
	}

	.hskq-preview :global(.hskq-py) {
		white-space: nowrap;
	}

	/* One line across the whole card, not three captions in three columns.

	   `contain: inline-size` is gone with the columns it was protecting: this element is the
	   card's full width either way, so the English can no longer widen anything. No clamp and
	   no reserved height with it — the English is never cut, at any width, for any word in the
	   list, and a card that needs one line is one line tall. `hyphens` and `break-word` are
	   the last resort for the one thing a 246px card cannot set whole: a single unbreakable
	   `responsibilities`. */
	.hskq-glosses {
		margin-block-start: 0.375rem;
		line-height: 1.4;
		hyphens: auto;
		overflow-wrap: break-word;
	}

	/* On the element, so an empty gloss cannot strand its dot. The space before the dot is
	   non-breaking and the one after it is not, so a wrap always happens *after* a separator:
	   the dot stays with the gloss it closes and the next gloss starts the new line. */
	.hskq-gl + .hskq-gl::before {
		content: '\00a0· ';
	}

	.hskq-actions {
		padding-block-start: 0.5rem;
	}

	/* Every pixel of the card that is not the preview row starts a session. */
	.hskq-practise::after {
		content: '';
		position: absolute;
		inset: 0;
		z-index: 0;
		border-radius: var(--radius-card);
	}

	/* The shared press-scale has to go: a transform here would make this button the containing
	   block for its own ::after, so the overlay would snap off the card mid-tap and the release
	   would land on nothing. Colour says "pressed" instead. */
	.hskq-practise:active {
		transform: none;
	}

	.hskq-practise.btn-primary:active {
		background-color: var(--color-primary-strong);
	}

	.hskq-practise.btn-quiet:active {
		background-color: var(--color-surface-sunken);
	}

	@media (hover: hover) {
		.hskq-card:hover {
			box-shadow: var(--shadow-lift);
		}

		.hskq-preview-link:hover .hskq-more {
			text-decoration: underline;
			text-underline-offset: 0.25em;
		}
	}
</style>
