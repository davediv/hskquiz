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
	two card heights. The meter is now a 4px rule and one 12px line under the header, which is all
	a fraction ever needed, and the three words are permanent. Once there is enough history the
	row stops being a sample and becomes this learner's own three weakest words here (see
	`weakestIds`), so the card says what it keeps missing rather than reciting the same trio
	forever.

	THE WHOLE CARD IS A TARGET. `Practise` stretches an overlay across the card, so anywhere that
	is not the preview row starts a session; the preview row itself is a link into that level's
	word list. Nothing on the card is dead to touch — Pleco's entire result row is the target, and
	so is Du Chinese's collection card.
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import { loadLevel } from '$lib/data';
	import { Hanzi, Pinyin } from '$lib/design';
	import type { Level, Word } from '$lib/types';
	import { LEVEL_META } from './levelMeta';
	import { LEVEL_PREVIEW, PREVIEW_COUNT, toPreview, type PreviewWord } from './preview';
	import { formatAccuracy, formatWhen, type LevelStats } from './stats';

	interface Props {
		level: Level;
		/** Words in the level — the denominator for the meter. */
		total: number;
		stats: LevelStats;
		/** Epoch ms used for relative time. 0 before hydration, which hides the timestamp. */
		now: number;
		/**
		 * This learner's weakest word ids at this level, worst first, from `weakestIds`. Empty
		 * means the card shows the static three instead.
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
	let weak = $state<PreviewWord[] | null>(null);
	const weakKey = $derived(weakIds.join(','));

	$effect(() => {
		const ids = weakKey ? weakKey.split(',') : [];
		if (ids.length === 0) {
			weak = null;
			return;
		}

		let live = true;
		loadLevel(level)
			.then((words) => {
				if (!live) return;
				const byId = new Map<string, Word>(words.map((word) => [word.id, word]));
				// A record can outlive the row it was written for, so ask for more ids than
				// there are columns and keep the first three that are still shipped.
				const found = ids
					.map((id) => byId.get(id))
					.filter((word): word is Word => word !== undefined)
					.slice(0, PREVIEW_COUNT)
					.map(toPreview);
				weak = found.length === PREVIEW_COUNT ? found : null;
			})
			.catch(() => {
				// The static three are always a correct thing to show, so a failed chunk is not
				// an error state — it is just the row this card started with.
				if (live) weak = null;
			});

		return () => {
			live = false;
		};
	});

	const preview = $derived(weak ?? LEVEL_PREVIEW[level]);
	const previewLabel = $derived(weak ? 'You keep missing' : 'In this level');

	/**
	 * The static three are all one or two characters, but a learner's weak word can be any of
	 * 4,308 rows — 201 of them are three characters and twelve are four (不好意思, 五颜六色).
	 * At 36px a four-character word is wider than a third of the card, so the row steps down the
	 * hanzi scale to whatever its longest word needs. One step for the whole row, not per word,
	 * so the three still line up; `.hskq-glyph` holds the tallest step's height either way, so
	 * the card does not change height when it changes size.
	 */
	type GlyphSize = 'xs' | 'sm' | 'md';
	const longest = $derived(Math.max(...preview.map((word) => [...word.hanzi].length)));
	const glyphSize: GlyphSize = $derived(longest <= 2 ? 'md' : longest === 3 ? 'sm' : 'xs');

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
	     at the cost of the three words underneath. -->
	<div class="hskq-status">
		<div class="hskq-track" aria-hidden="true">
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
	<p class="mt-2 text-sm leading-snug text-ink-muted">{meta.blurb}</p>

	<a class="hskq-preview-link" href={browseHref}>
		<span class="hskq-preview-head">
			<span class="eyebrow">{previewLabel}</span>
			<span class="hskq-more eyebrow"
				>Browse<span class="sr-only"> all {total.toLocaleString('en')} words in HSK {level}</span>
				<span aria-hidden="true">→</span></span
			>
		</span>
		<!-- The three words are the card's Chinese, so they get the hanzi scale, not the UI one. -->
		<ul class="hskq-preview">
			{#each preview as word (word.id)}
				<li>
					<span class="hskq-glyph">
						<Hanzi text={word.hanzi} size={glyphSize} class="block text-ink" />
					</span>
					<!-- Tone-coloured, per the design system: pinyin is the one place in the app a
					     learner reads tone off a colour, and flat accent pinyin here read as
					     fifteen error states. `spaced={false}` keeps the list's own orthography —
					     `xièxie`, not `xiè xie`, the same rule the hero's `cíhuì liànxí` follows. -->
					<Pinyin
						pinyin={word.pinyin}
						syllables={word.syllables}
						size="sm"
						spaced={false}
						class="mt-1 block truncate"
					/>
					<!-- One line, ellipsis past it. A learner's own weak word can carry any gloss the
					     list ships, and a two-line one would make its card taller than the other
					     four; Pleco truncates its list-row definitions for the same reason. The
					     whole entry is one tap away through this row's own link. -->
					<span class="mt-0.5 block truncate text-xs leading-snug text-ink-subtle"
						>{word.gloss}</span
					>
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

	/* 4px, not 8: at this size it reads as a rule that happens to be filled, which is all the
	   emptiest card should be spending. */
	.hskq-track {
		block-size: var(--spacing);
		border-radius: var(--radius-pill);
		background-color: var(--color-surface-sunken);
		overflow: hidden;
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
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.hskq-more {
		color: var(--color-accent);
		white-space: nowrap;
	}

	/* Three equal columns, so the hanzi baselines line up across the row and across the list.
	   `minmax(0, 1fr)` because a long gloss must wrap rather than widen its column. */
	.hskq-preview {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.625rem;
		margin-block-start: 0.125rem;
	}

	/* Holds the tallest hanzi step's line box whatever step the row is actually using, so a
	   four-character weak word cannot shorten the card it lands in. Bottom-aligned: the
	   baselines stay on one line across all five cards. */
	.hskq-glyph {
		display: flex;
		align-items: flex-end;
		min-block-size: 2.65rem;
		overflow: hidden;
	}

	.hskq-actions {
		margin-block-start: auto;
		padding-block-start: 0.625rem;
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
