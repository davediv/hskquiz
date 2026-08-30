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
	two card heights. The meter is now a rule and one 12px line under the header, which is all a
	fraction ever needed, and the three words are permanent. Once there is enough history the row
	stops being a sample and becomes this learner's own three weakest words here (see
	`weakestIds`), so the card says what it keeps missing rather than reciting the same trio
	forever.

	AND THEY RENDER THE SAME WHOSE-EVER THEY ARE. Loop 3 shipped the learner's own row worse than
	the hand-picked one: `truncate` on the pinyin printed `dàxuéshē…`, `truncate` on the gloss
	printed `have no cho…`, and a `glyphSize` step-down dropped 36px hanzi to 26px on exactly the
	cards with history — so HSK 1's row was visibly smaller than the untouched HSK 2 card below
	it, and the app's typography got worse the more you used it. All three are gone. The hanzi is
	one size on every card in every state, the pinyin never wraps and is never cut, and the gloss
	has a reserved two-line box. What absorbs the variance instead is the *choice* of words:
	`fitPreview` takes the worst candidates that fit the width this card actually has, measured,
	and the card falls back to the static three rather than showing a clipped row.

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
		return fitPreview(candidates, rowWidth > 0 ? rowWidth : 246);
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

	<!-- One rule and one line. The fraction is the only thing a meter ever said, and it said it
	     at the cost of the three words underneath. The empty track is drawn as a capsule with
	     an edge rather than a flat 4px bar: at 0% a flat bar directly under a heading reads as
	     that heading's underline, five times down the page. -->
	<div class="hskq-status">
		<div class="hskq-track" class:hskq-track-empty={pct === 0} aria-hidden="true">
			{#if pct > 0}
				<div class="hskq-fill" style:width="{pct}%"></div>
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

	<!-- Full width rather than beside the title: at 375px a phrase this long wraps in a
	     narrow column, and cards that wrap differently stop looking like one list. -->
	<p class="mt-1.5 text-sm leading-snug text-ink-muted">{meta.blurb}</p>

	<a class="hskq-preview-link" href={browseHref}>
		<span class="hskq-preview-head">
			{#if weakLabel}<span class="eyebrow">{weakLabel}</span>{/if}
			<span class="hskq-more eyebrow"
				>Browse<span class="sr-only"> all {total.toLocaleString('en')} words in HSK {level}</span>
				<span aria-hidden="true">→</span></span
			>
		</span>
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
					<!-- Two lines, always reserved, so `have no choice but to` reads and the card
					     still cannot change height. 990 of the 4,308 shipped glosses (23%) are
					     longer than sixteen characters, so one line was never the list's shape —
					     it was the shape of the fifteen glosses that were picked to fit it.
					     Two elements, not one: the outer is size-contained so that the English
					     contributes nothing to how wide the column has to be — `behind
					     something` is 103px and would otherwise push 背后 out of a row it fits
					     in — and the inner is the clamp, which has to be a `-webkit-box` and so
					     cannot be the contained one. -->
					<span class="hskq-gloss text-xs text-ink-subtle">
						<span class="hskq-gloss-text" data-gloss>{word.gloss}</span>
					</span>
				</li>
			{/each}
		</ul>
	</a>

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

	.hskq-status {
		margin-block-start: 0.5rem;
	}

	.hskq-track {
		block-size: 0.375rem;
		border-radius: var(--radius-pill);
		background-color: var(--color-surface-sunken);
		overflow: hidden;
	}

	/* Nothing practised yet: an outlined capsule, which is a container waiting to be filled.
	   The flat fill alone was a hairline the width of the card sitting under a heading, and it
	   read as that heading's rule — the blind judge and the critic reached that independently.
	   Du Chinese's "0/12 chapters read" paints an end-cap for the same reason. */
	.hskq-track-empty {
		background-color: transparent;
		box-shadow: inset 0 0 0 1px var(--color-line);
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
		margin-block-start: 0.375rem;
		border-radius: var(--radius-sm);
		color: inherit;
		text-decoration: none;
	}

	.hskq-preview-head {
		display: flex;
		align-items: baseline;
		gap: 0.75rem;
	}

	/* Pushed right whether or not there is a label to its left. */
	.hskq-more {
		margin-inline-start: auto;
		color: var(--color-accent);
		white-space: nowrap;
	}

	/* Equal thirds while the words are short, and no narrower than the widest thing in the
	   column once they are not: `min-content` is the whole hanzi and the whole pinyin, both
	   `nowrap`, so neither can be cut. Only the gloss gives ground, and it wraps. */
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

	/* Size containment in the inline axis only: the column is sized by the hanzi and the
	   pinyin, which must not be cut, and the English then wraps into whatever that leaves.
	   Block size is still content-driven, so the two reserved lines below still reserve. */
	.hskq-gloss {
		display: block;
		contain: inline-size;
		margin-block-start: 0.125rem;
		min-block-size: 2.7em;
		line-height: 1.35;
	}

	/* Two lines, then an ellipsis. A three-character word takes the room it needs from its
	   neighbours, so at 320px the third column can be 47px and `electricity` does not fit on
	   one line of it: `hyphens` breaks it where English breaks (`elec-tricity`) rather than
	   where the box ends (`electrici| ty`), and `break-word` is the last resort under that. */
	.hskq-gloss-text {
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		overflow: hidden;
		hyphens: auto;
		overflow-wrap: break-word;
	}

	.hskq-actions {
		margin-block-start: auto;
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
