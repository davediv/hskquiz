<!--
	One level, as a card.

	The card's job is to make five levels tell themselves apart. The size and the blurb say what
	is in the box in English; the preview list says it in Chinese, with three real words. Loop 1
	put a Chinese numeral in a red square here instead — 一 reads as a minus sign, 三 as a
	hamburger menu — and the result was a level menu for a Chinese app containing no Chinese
	vocabulary at all.

	THE WORDS NEVER LEAVE. Loop 2 gave the preview and the progress meter the same slot, so the
	moment a learner practised a level, that level's card lost its Chinese — the one card
	carrying `Continue` was the one card on the page with no hanzi on it, and the list split into
	two card heights. The meter is now a rule and one 12px line in the card's footer, which is all
	a fraction ever needed, and the three words are permanent. Once there is enough history the
	list stops being a sample and becomes this learner's own three weakest words here (see
	`weakestIds`), so the card says what it keeps missing rather than reciting the same trio
	forever.

	AND THEY RENDER THE SAME WHOSE-EVER THEY ARE. Loop 3 shipped the learner's own words worse
	than the hand-picked ones: `truncate` on the pinyin printed `dàxuéshē…`, `truncate` on the
	gloss printed `have no cho…`, and a `glyphSize` step-down dropped 36px hanzi to 26px on
	exactly the cards with history — so HSK 1's row was visibly smaller than the untouched HSK 2
	card below it, and the app's typography got worse the more you used it. All three are gone.
	The hanzi is one size on every card in every state, and the pinyin is never wrapped and never
	cut.

	AND EVERY GLOSS BELONGS TO ITS OWN WORD. Two loops were spent moving the English around a
	three-column row, and both shapes failed for the same reason: a third of a 320px card is
	77px, and no column that narrow will ever hold `measure word: general purpose`. Loop 4
	clamped it and cut it. Loop 5 pulled all three glosses out into one `·`-joined line under the
	row, which cut nothing but printed "to like" underneath 妈妈 — the glosses packed left while
	the words above them stayed on their columns, so on a first visit five cards out of five
	captioned their words with somebody else's English.

	So the columns are gone. The preview is a LIST, in the shape Pleco's result rows use
	(`reference/screenshots/pleco/pleco-iphone-01.png`): one entry per word, full card width,
	hanzi and its own tone-coloured pinyin on the first line and that word's own gloss directly
	beneath it. A gloss now has the whole card to set in — the longest of the 4,308 shipped is 34
	characters, ~210px, against 246px on the narrowest card this layout builds — so every gloss
	in the list is one line at every width, nothing is cut, no gloss can land under a character
	that is not its own, and the five cards hold one height. It also ends the width problem the
	old row had: 大学生 / 教学楼 / 图书馆 needed 346px side by side and got dropped to two
	columns, where stacked they are 130px each and all three fit at 320.

	THE WHOLE CARD IS A TARGET. `Practise` stretches an overlay across the card, so anywhere that
	is not the preview starts a session; the preview itself is a link into that level's word
	list, and `Browse →` sits up in the card's title row where it captions nothing.
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import { loadLevel } from '$lib/data';
	import { Hanzi, Pinyin } from '$lib/design';
	import type { Level, Word } from '$lib/types';
	import { LEVEL_META } from './levelMeta';
	import { fitPreview, LEVEL_PREVIEW, PREVIEW_COUNT, toPreview, type PreviewWord } from './preview';
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
		 * than there are entries: `fitPreview` spends the spares. Empty means the card shows
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
				// there are entries and keep every one that is still shipped — `fitPreview`
				// spends the spares on words whose first line would not set whole.
				const found = ids
					.map((id) => byId.get(id))
					.filter((word): word is Word => word !== undefined)
					.map(toPreview);
				pool = found.length >= PREVIEW_COUNT ? found : null;
			})
			.catch(() => {
				// The static three are always a correct thing to show, so a failed chunk is not
				// an error state — it is just the list this card started with.
				if (live) pool = null;
			});

		return () => {
			live = false;
		};
	});

	/**
	 * How much room an entry's first line actually has, measured rather than assumed.
	 *
	 * The counter-intuitive part of this screen is that the *large* viewport is the narrow
	 * column: three cards abreast at 1440 gives each entry ~287px against a 375px phone's ~301,
	 * and 320px gives ~246. One hard-coded budget would be wrong at two of those three, so the
	 * list reports its own width and the fit is recomputed when it changes.
	 */
	let rowWidth = $state(0);

	/**
	 * The learner's worst three, preferring ones whose hanzi and pinyin set on one line here.
	 *
	 * There is no measure-and-retry loop behind this any more, and no fallback to the static
	 * three. A stacked entry cannot overflow: the pinyin wraps under its own hanzi rather than
	 * being cut, and the gloss has the whole card to set in either way. So when even the worst
	 * case will not fit — 10 of the 4,308 shipped words exceed 246px on their first line — the
	 * honest answer is still this learner's own three words, one of them a line taller. Loop 4
	 * printed 超市 / 周末 / 地铁 under a card reading "36 of 770 · 30 mastered", which is the
	 * one card on the page showing words its owner has never got wrong.
	 */
	const weak = $derived.by(() => {
		if (!pool) return null;
		// Before the first measurement, assume the tightest list this layout produces (320px).
		const budget = rowWidth > 0 ? rowWidth : 246;
		return fitPreview(pool, budget) ?? pool.slice(0, PREVIEW_COUNT);
	});

	const preview = $derived(weak ?? LEVEL_PREVIEW[level]);
	/**
	 * Only the personalised list is labelled. "IN THIS LEVEL" was an eyebrow repeated five times
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
	<!-- Identity on the left, the way out of the card on the right. `Browse →` spent two loops
	     inside the preview block, where at 247/192/234 (375/320/1440) it landed inside the third
	     word's column and read as that word's caption. Up here it captions nothing, it is the
	     same 44px target on every card, and the card gets a shape: header, words, footer. -->
	<div class="hskq-head">
		<h3 id="level-{level}-title" class="text-xl leading-tight font-semibold">HSK {level}</h3>
		{#if featured && featuredLabel}
			<span class="chip chip-accent">{featuredLabel}</span>
		{/if}
		<a class="hskq-more eyebrow" href={browseHref}>
			Browse<span class="sr-only"> all {total.toLocaleString('en')} words in HSK {level}</span>
			<span aria-hidden="true">→</span>
		</a>
	</div>

	<!-- What is in the level, then the level itself, and only then the score. The meter used to
	     be the second thing on every card, so on a first visit all five opened with a 6px
	     hairline and the word "0" — the state this list is in most often, told in the one
	     number that cannot help a newcomer pick. It is a footer now, sitting with the button it
	     informs, and the Chinese starts 37px higher up the card. Full width rather than beside
	     the title: at 375px a phrase this long wraps in a narrow column, and cards that wrap
	     differently stop looking like one list. -->
	<p class="mt-1 text-sm leading-snug text-ink-muted">{meta.blurb}</p>

	<a class="hskq-preview-link" href={browseHref} aria-label="HSK {level} word list">
		{#if weakLabel}
			<span class="hskq-preview-head"><span class="eyebrow">{weakLabel}</span></span>
		{/if}
		<!-- One entry per word, full card width, in Pleco's list shape. The three words are the
		     card's Chinese, so they get the hanzi scale, not the UI one. -->
		<ul class="hskq-preview" bind:clientWidth={rowWidth}>
			{#each preview as word (word.id)}
				<li class="hskq-entry">
					<Hanzi text={word.hanzi} size="md" class="hskq-hz text-ink" />
					<!-- Tone-coloured, per the design system: pinyin is the one place in the app a
					     learner reads tone off a colour, and flat accent pinyin here read as
					     fifteen error states. `spaced={false}` keeps the list's own orthography —
					     `xièxie`, not `xiè xie`, the same rule the hero's `cíhuì liànxí` follows.
					     Never truncated: half a syllable is a wrong reading. On the rare word
					     whose pinyin will not sit beside its hanzi at this width it wraps to its
					     own line, under its own characters, whole. -->
					<Pinyin
						pinyin={word.pinyin}
						syllables={word.syllables}
						size="sm"
						spaced={false}
						class="hskq-py"
					/>
					<!-- This word's own English, directly beneath this word's own characters and
					     nobody else's. Full card width, no clamp, no reserved height: the longest
					     gloss in the shipped list is 34 characters and the narrowest card this
					     layout builds is 246px, so it is one line everywhere. -->
					<span class="hskq-gl text-xs text-ink-subtle" data-gloss>{word.gloss}</span>
				</li>
			{/each}
		</ul>
	</a>

	<!-- One rule and one line, at the foot of the card with the button it belongs to. The
	     fraction is the only thing a meter ever said, and it said it at the cost of the three
	     words above it. -->
	<div class="hskq-status">
		<div class="hskq-track" aria-hidden="true">
			{#if pct > 0}
				<div class="hskq-fill" style:width="{pct}%"></div>
			{:else}
				<!-- Nothing practised is still a position on the scale, and a scale with no mark
				     on it is a rule. For three loops this was an outlined capsule with a 6px dot
				     in it, which at 1x reads as a hairline with a speck on the end. Du Chinese
				     at "0/12 chapters read" paints a filled end-cap, ~11% of the track, on a
				     track that is solid at zero rather than hollow
				     (`reference/screenshots/duchinese/ui/duchinese-iphone-08-ui.png`), and that
				     is why theirs reads as a meter. Neutral ink, never the correct-green of
				     `.hskq-fill`, so the cap cannot be mistaken for progress. -->
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

	.hskq-head {
		display: flex;
		align-items: center;
		gap: 0.625rem;
	}

	/* Pushed to the far end of the title row, and pulled back out of the row's height: the base
	   layer gives every `a[href]` a 44px minimum so the target is real, and left alone that
	   would make an 11px label the tallest thing on the line. Above the Practise overlay, or the
	   overlay would swallow the tap. */
	.hskq-more {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		position: relative;
		z-index: 1;
		margin-inline-start: auto;
		margin-block: -0.75rem;
		padding-inline-start: 0.5rem;
		color: var(--color-accent);
		text-decoration: none;
		white-space: nowrap;
	}

	/* The whole footer — meter, count, button — sinks to the bottom of the card, so two cards
	   sharing a desktop row line up on their status line as well as their button. The `auto`
	   lives here rather than on `.hskq-actions`, or the free space would open *between* the
	   count and the button it is about. */
	.hskq-status {
		margin-block-start: auto;
		padding-block-start: 0.875rem;
	}

	/* Solid at zero as well as in progress. An outline-only capsule is a container drawn in the
	   hairline colour — at 6px it read as a rule, which is the note this meter has now been
	   given three loops running. */
	.hskq-track {
		block-size: 0.5rem;
		border-radius: var(--radius-pill);
		background-color: var(--color-surface-sunken);
		overflow: hidden;
	}

	/* The mark at zero: an end-cap, not a dot. 28px is 9–11% of the three track widths this
	   layout builds, which is Du Chinese's proportion at 0/12. */
	.hskq-origin {
		inline-size: 1.75rem;
		block-size: 100%;
		border-radius: inherit;
		background-color: var(--color-line-strong);
	}

	/* A handful of words out of a thousand is still worth seeing — and the floor is the origin
	   cap's own width, not a smaller one. At 10px the first word ever practised turned a 28px
	   grey cap into a 10px green one, so the meter went visibly *backwards* on the one event it
	   exists to record. */
	.hskq-fill {
		block-size: 100%;
		min-inline-size: 1.75rem;
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

	/* The list is a link into the level's word list — 15 real words on this screen and no way
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

	/* A column of entries, not a row of columns. */
	.hskq-preview {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-block-start: 0.125rem;
	}

	/* One word. Hanzi and pinyin share the first line on their baselines; the gloss takes a
	   line of its own beneath them, at the full width of the card.

	   `flex-wrap` is the safety valve, and the only one this layout needs: a word whose hanzi
	   and pinyin together are wider than the card — 10 of 4,308, all four-character idioms at
	   320px — puts its pinyin on the next line, under its own characters, whole. Nothing here
	   can be cut and nothing can overflow, so there is no measure-and-retry loop behind it. */
	.hskq-entry {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		column-gap: 0.5rem;
		row-gap: 0.0625rem;
	}

	/* Tighter than the scale's own 1.18 leading, which reserves 6px of air this list does not
	   need: the gloss belongs hard under its characters, and the entry gap is what separates
	   one word from the next. The type size is untouched — 36px on every card in every state. */
	.hskq-preview :global(.hskq-hz) {
		line-height: 1.06;
		white-space: nowrap;
	}

	.hskq-preview :global(.hskq-py) {
		white-space: nowrap;
	}

	/* `flex: 1 1 auto` and not `1 1 100%`: the gloss takes the rest of its own word's first
	   line when it fits there, and drops to a line of its own — full card width, under its own
	   characters — when it does not. Both readings bind it to one word and only one word, which
	   is the whole point; which of the two a given entry gets is decided by whether the English
	   is short enough to sit beside the pinyin, and the fifteen static ones all are.

	   `100%` was tried and measured: it sets every gloss on its own line, which is Pleco's
	   shape but costs 53px a card (371 against 318) and puts the desktop list on two screens
	   for the sake of an entry whose right-hand two thirds are then blank. */
	.hskq-gl {
		flex: 1 1 auto;
		min-inline-size: 0;
		line-height: 1.4;
		hyphens: auto;
		overflow-wrap: break-word;
	}

	.hskq-actions {
		padding-block-start: 0.5rem;
	}

	/* Every pixel of the card that is not the preview list or `Browse →` starts a session. */
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

		.hskq-more:hover {
			text-decoration: underline;
			text-underline-offset: 0.25em;
		}

		.hskq-preview-link:hover .hskq-gl {
			color: var(--color-ink-muted);
		}
	}
</style>
