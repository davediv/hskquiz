<!--
	The app bar. Contextual rather than a fixed tab bar — see the note in +layout.svelte for
	why this app does not get Du Chinese's three-item bottom bar.

	  home    mark + wordmark, left aligned. Identity, nothing else.
	  browse  back, the level name as the page's <h1>, and the one lateral move worth
	          offering: practise the level you are currently reading.
	  quiz    back and the level name. Nothing else — during a run the bottom of the screen
	          belongs to the answer buttons.

	IT COMPACTS; IT DOES NOT LEAVE. `chrome` (see chrome.svelte.ts) tracks the scroll delta and
	this bar compacts 1:1 with it, from `--app-bar-h` down to `--app-bar-min-h` — 56px of row
	to 40px — and back up the moment the finger goes the other way. It used to translate itself
	off the top edge entirely, which left `/browse/1` scrolled with no back control, nothing
	naming the level, and (because the published chrome height went negative with it) the skip
	link parked above the viewport. The docked row is the answer: the same three slots, one
	step down the type scale, permanently on screen. Everything stuck beneath it follows
	automatically because `--app-header-h` publishes the live height, not the intrinsic one.

	HOW IT COMPACTS IS DELIBERATE. The <header> slides up by `chrome.barOffset` and `.inner`
	pads itself back down by exactly the same number, inside a `block-size` that never changes.
	So the row RECOMPOSES at 40px — nothing is sliced off the top — while the header's border
	box stays 57px and the document never reflows. Animating the height instead is what a
	sticky-in-flow element must not do: it shortens the document, scroll anchoring compensates,
	the controller reads that compensation as a scroll, and the bar oscillates.

	THE HEADING IS AN <h1> ONLY WHEN THE SCREEN HAS NOT WRITTEN ONE. It used to be a <span>,
	which left `/quiz/[level]` and `/browse/[level]` with literally zero headings in their
	normal state while `/` had a full outline — a screen-reader user landing on browse had
	nothing to navigate by. Then it was an unconditional <h1>, which is the opposite fault: on
	`/browse/9` the page's own "hskquiz covers HSK 1 to 5" is an <h1> too, so the document had
	two, and on any view where the screen has something more specific to say than "HSK 1" the
	bar was taking the rank off it. So the shell FILLS THE GAP AND NEVER COMPETES: the layout
	watches `#main` for an <h1>, and when there is one this drops to a plain <span> — same
	glyphs, same box, no rank. Nothing else has to be told.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { ShellRoute } from './route';
	import { APP_NAME } from './route';
	import type { ChromeController } from './chrome.svelte';
	import type { BackTarget } from './back.svelte';

	let {
		route,
		chrome,
		backTarget,
		pageOwnsHeading = false
	}: {
		route: ShellRoute;
		chrome: ChromeController;
		backTarget: BackTarget;
		/** The screen already renders an `<h1>`; this one steps down to a plain label. */
		pageOwnsHeading?: boolean;
	} = $props();

	/**
	 * The header's own border box, measured — hairline included, which the old `.inner`
	 * binding missed, so the shell published 56 while the element occupied 57 and every
	 * sticky layer in the app sat 1px too high.
	 */
	let headerEl = $state<HTMLElement | null>(null);
	let headerH = $state(0);

	$effect(() => {
		const el = headerEl;
		const measured = headerH;
		if (!el || measured <= 0) return;
		// `offsetHeight` includes the safe-area padding the bar sits under; the controller
		// wants the bar itself, because the inset is added back as part of --app-chrome-h.
		// The box is the same size docked as expanded, so this never changes under a scroll.
		const inset = Number.parseFloat(getComputedStyle(el).paddingBlockStart) || 0;
		chrome.report(measured - inset);
	});

	function onBack(event: MouseEvent) {
		// Leave modified clicks, middle clicks and anything already handled to the browser:
		// the href is a real destination and "open in new tab" should keep working.
		if (event.defaultPrevented || event.button !== 0) return;
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

		event.preventDefault();
		if (backTarget.canPop) {
			history.back();
		} else {
			// Cold deep link: there is nothing to pop, and pushing would leave the screen the
			// user just left sitting one edge-swipe away.
			void goto(resolve('/'), { replaceState: true });
		}
	}
</script>

<header
	class="bar"
	class:scrolled={chrome.scrolled}
	class:condensed={chrome.condensed}
	bind:this={headerEl}
	bind:offsetHeight={headerH}
	style:translate={chrome.barOffset > 0 ? `0 ${-chrome.barOffset}px` : null}
	onfocusin={() => chrome.reveal()}
>
	<div
		class="inner"
		class:home={route.mode === 'home'}
		style:padding-block-start={chrome.barOffset > 0 ? `${chrome.barOffset}px` : null}
	>
		{#if route.mode === 'home'}
			<span class="mark" lang="zh-Hans" aria-hidden="true">汉</span>
			<span class="wordmark">{APP_NAME}</span>
		{:else}
			<span class="slot start">
				{#if route.back}
					<a
						class="icon"
						href={resolve('/')}
						aria-label="Back to {backTarget.label}"
						onclick={onBack}
					>
						<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
							<path
								d="M15 5 8 12l7 7"
								fill="none"
								stroke="currentColor"
								stroke-width="2.1"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
					</a>
				{/if}
			</span>

			<span class="slot mid">
				{#if route.heading}
					{#if pageOwnsHeading}
						<span class="heading">{route.heading}</span>
					{:else}
						<h1 class="heading">{route.heading}</h1>
					{/if}
				{/if}
			</span>

			<span class="slot end">
				{#if route.mode === 'browse' && route.level !== null}
					<a class="action" href={resolve('/quiz/[level]', { level: String(route.level) })}>
						Practise
					</a>
				{/if}
			</span>
		{/if}
	</div>
</header>

<style>
	.bar {
		/*
		 * The live VISIBLE row: `--app-header-h` is a border-box number because that is what a
		 * sticky layer below the bar has to clear, so the hairline comes back off to get the
		 * height the row's contents actually have. 56px expanded, 40px docked.
		 */
		--bar-row-h: calc(var(--app-header-h) - var(--app-bar-line));
		/*
		 * How far a 44px tap target has to overhang the live row. 0 while the row is 44px or
		 * taller, 2px once it has docked to 40. Both the chevron and the lateral action carry
		 * it as a transparent border, so their hit areas keep the 44px minimum while what they
		 * paint stays inside the row.
		 */
		--bar-tap-inset: calc((var(--spacing-tap) - min(var(--spacing-tap), var(--bar-row-h))) / 2);

		position: sticky;
		top: 0;
		z-index: 40;
		padding-top: var(--app-safe-top);
		border-block-end: var(--app-bar-line) solid transparent;
		/* Translucent, so content passing underneath reads as motion rather than a hard cut. */
		background-color: color-mix(in srgb, var(--color-page) 82%, transparent);
		backdrop-filter: saturate(1.6) blur(14px);
		-webkit-backdrop-filter: saturate(1.6) blur(14px);
		transition: border-color 160ms var(--ease-out-soft);
		/*
		 * The slide is a `translate` written per frame from JS, deliberately with no
		 * transition of its own: it is tracking a finger, and a transition would put the bar
		 * behind the content it is attached to. The settle glide is tweened in JS instead.
		 */
		will-change: translate;
	}

	@supports not (backdrop-filter: blur(1px)) {
		.bar {
			background-color: var(--color-page);
		}
	}

	.bar.scrolled {
		border-block-end-color: var(--color-line);
	}

	/*
	 * Docked, the bar is the only chrome left on screen and a list is running underneath it,
	 * so it stops being glass and becomes a surface: at 82% the descenders of a 14px gloss
	 * came through the row on every scroll.
	 */
	.bar.condensed {
		background-color: var(--color-page);
	}

	.inner {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: 0.25rem;
		/*
		 * CONSTANT, and border-box on purpose: the compacting is `padding-block-start` growing
		 * inside this fixed height while the header slides up by the same amount. The content
		 * box shrinks 56 -> 40 and recentres; the border box never moves, so the document
		 * never reflows and scroll anchoring has nothing to fight.
		 */
		box-sizing: border-box;
		block-size: var(--app-bar-h);
		/*
		 * Full bleed on a phone: every route runs edge to edge there, so window chrome sits
		 * at the window edge. From 64rem the routes pull into a centred column and a
		 * full-bleed bar reads as a phone app stretched — the chevron was 430px left of the
		 * content it belonged to — so the bar takes the same measure. A route with a
		 * different column overrides `--app-bar-measure`.
		 *
		 * The inline padding is pulled 0.75rem tighter than the gutter so the 44px hit areas
		 * overhang it and the glyphs inside them land exactly on the text column.
		 */
		padding-inline-start: max(calc(var(--spacing-gutter) - 0.75rem), var(--app-safe-left));
		padding-inline-end: max(calc(var(--spacing-gutter) - 0.75rem), var(--app-safe-right));
	}

	.inner.home {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding-inline-start: max(var(--spacing-gutter), var(--app-safe-left));
		padding-inline-end: max(var(--spacing-gutter), var(--app-safe-right));
	}

	@media (min-width: 64rem) {
		.inner {
			inline-size: 100%;
			/* Both measured off the screen the router just rendered — see chrome.svelte.ts.
			   The fallbacks are what server-rendered HTML uses for one frame. */
			max-inline-size: var(--app-bar-measure, var(--container-wide));
			margin-inline: auto;
			padding-inline-start: max(
				calc(var(--app-bar-pad, var(--spacing-gutter)) - 0.75rem),
				var(--app-safe-left)
			);
			padding-inline-end: max(
				calc(var(--app-bar-pad, var(--spacing-gutter)) - 0.75rem),
				var(--app-safe-right)
			);
		}

		/* The wordmark is not a 44px hit area, so it needs no overhang — it sits on the
		   column's text edge directly. */
		.inner.home {
			padding-inline-start: max(var(--app-bar-pad, 2rem), var(--app-safe-left));
			padding-inline-end: max(var(--app-bar-pad, 2rem), var(--app-safe-right));
		}
	}

	.slot {
		display: flex;
		align-items: center;
		min-inline-size: 0;
	}
	.start {
		justify-self: start;
	}
	.mid {
		justify-self: center;
		min-inline-size: 0;
	}
	.end {
		justify-self: end;
	}

	.icon {
		display: grid;
		place-items: center;
		/*
		 * 44x44 IN EVERY STATE, INCLUDING DOCKED. This used to be
		 * `block-size: min(var(--spacing-tap), var(--bar-row-h))`, which is 44x56 expanded and
		 * 44x40 docked — under the 44px minimum in exactly the state the docked row exists to
		 * protect, because that is where the back control is the only navigation left on a
		 * 38,402px document.
		 *
		 * The row cannot grow to fit it: `.inner`'s block-size is fixed so the bar's border box
		 * never changes size (see the note at the top of this file). So the TARGET is 44 and
		 * the PAINT is the row: `--bar-tap-inset` of transparent border takes up the
		 * difference and `background-clip: padding-box` keeps the pill inside it, so a 44px
		 * finger area never lights up 2px past the bar's own hairline. Overflowing a 40px flex
		 * line changes no layout — `.inner` is a fixed height and the slots only centre what
		 * is inside them.
		 */
		inline-size: var(--spacing-tap);
		block-size: var(--spacing-tap);
		border-block: var(--bar-tap-inset) solid transparent;
		border-radius: var(--radius-pill);
		background-clip: padding-box;
		color: var(--color-ink);
		text-decoration: none;
		transition: background-color 120ms var(--ease-out-soft);
	}

	.icon svg {
		inline-size: 1.375rem;
		block-size: 1.375rem;
	}

	.icon:active {
		background-color: var(--color-surface-sunken);
	}

	.heading {
		display: block;
		margin: 0;
		overflow: hidden;
		font-size: var(--text-lg);
		font-weight: 600;
		letter-spacing: -0.012em;
		white-space: nowrap;
		text-overflow: ellipsis;
		transition: font-size 160ms var(--ease-out-soft);
	}

	/* One step down the scale for the docked row: the level's name is still the thing the
	   learner needs, just no longer the loudest thing on the screen. */
	.bar.condensed .heading {
		font-size: var(--text-base);
	}

	.action {
		display: inline-flex;
		align-items: center;
		/* Same rule as `.icon`: a 44px target whatever the row is doing, with the lit surface
		   clipped back to the row so it never bleeds past the hairline. */
		min-block-size: var(--spacing-tap);
		padding-inline: 0.75rem;
		border-block: var(--bar-tap-inset) solid transparent;
		border-radius: var(--radius-sm);
		background-clip: padding-box;
		color: var(--color-accent);
		font-size: var(--text-sm);
		font-weight: 600;
		white-space: nowrap;
		text-decoration: none;
		transition: background-color 120ms var(--ease-out-soft);
	}

	.action:active {
		background-color: var(--color-accent-soft);
	}

	@media (hover: hover) {
		.icon:hover {
			background-color: var(--color-surface-sunken);
		}

		.action:hover {
			background-color: var(--color-accent-soft);
		}
	}

	.mark {
		display: grid;
		place-items: center;
		flex: none;
		inline-size: 1.75rem;
		block-size: 1.75rem;
		border-radius: var(--radius-xs);
		background-color: var(--color-accent);
		color: var(--color-accent-ink);
		font-family: var(--font-hanzi);
		font-size: 1rem;
		line-height: 1;
		transition:
			inline-size 160ms var(--ease-out-soft),
			block-size 160ms var(--ease-out-soft);
	}

	.bar.condensed .mark {
		inline-size: 1.5rem;
		block-size: 1.5rem;
		font-size: 0.875rem;
	}

	.wordmark {
		font-size: var(--text-lg);
		font-weight: 600;
		letter-spacing: -0.02em;
		transition: font-size 160ms var(--ease-out-soft);
	}

	.bar.condensed .wordmark {
		font-size: var(--text-base);
	}
</style>
