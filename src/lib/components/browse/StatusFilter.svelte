<!--
	Filter the level by what the learner has done with each word.

	This is the bit that makes browsing and practising feel like one product rather than a word
	list next to a game: "show me the 14 I keep missing" is the reason to open this screen at
	all, and it is one tap.

	WHICH CHIPS EXIST IS `visibleFilters` IN status.ts, NOT THIS FILE.
	There is no `All` chip and there is no chip for a state nobody has reached. The count that
	`All` carried is the level's own size, which the level screen, the colophon and the list
	itself already give; what it cost was 54px of a 320px strip, which is why "40 Mastered" —
	the number a returning learner opens this screen for — used to sit 51px off the right edge.
	Clearing a filter is the selected chip toggling, the way a filter chip behaves everywhere
	else; `aria-pressed` already described it, and the empty state still offers a button.

	WHY THE COUNT SITS ABOVE THE LABEL
	Laid out as one line — `Shaky 14` — five chips measured 513px against a 375px phone. The
	count is the payload, and a strip whose payload is offscreen has failed whatever it does to
	announce the fact. Stacking the number over the label makes each chip as wide as its widest
	line instead of the sum of both.

	WHAT IS MEASURED, AND WHAT IS NOT
	The strip fits at 320/375/414 with all five chips — measured in the running app at 303px of
	scroll width against 320px of client width, seeded with every bucket populated. That is a
	fact about five chips at today's labels and it is checked by `status.spec.ts`, not asserted
	here: the previous version of this comment promised the same thing about five chips, a
	sixth arrived, and the promise shipped as a guarantee for eight loops. So the scrolling
	machinery below stays and stays measured — the fade and the nudge appear from a real
	measurement of the last chip's edge, not from a count of chips, and a longer label or a
	sixth bucket brings them back on their own.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { STATUS_META, type StatusCounts, type StatusFilter, type WordStatus } from './status';

	interface Props {
		value: StatusFilter;
		/** What each chip says. Search-scoped: tapping one can never produce fewer rows. */
		counts: StatusCounts;
		/** Which chips exist, from the level's own buckets. See `visibleFilters`. */
		chips: readonly WordStatus[];
	}

	let { value = $bindable('all'), counts, chips }: Props = $props();

	/** Breathing room left beside a chip that has just been scrolled into view. */
	const EDGE_GAP = 12;

	let strip = $state<HTMLElement | null>(null);
	let clientWidth = $state(0);
	let moreBefore = $state(false);
	let moreAfter = $state(false);

	/**
	 * Whether a *chip* is cut off, not whether the scroller has room left in it.
	 *
	 * `scrollWidth - clientWidth` is the obvious test and the wrong one here: the strip carries
	 * the screen's gutter as its own inline padding so the first chip lines up with the text
	 * column, and that trailing 20px counts as scrollable width. With every chip fitting inside
	 * 375px it still reported an overflow, so the fade landed on `Mastered` and greyed out a
	 * chip that was entirely on screen. Comparing the end chip's own right edge against the
	 * strip's says what the learner can actually see.
	 */
	function measure() {
		if (!strip) return;
		if (strip.clientWidth !== clientWidth) clientWidth = strip.clientWidth;

		const box = strip.getBoundingClientRect();
		const first = strip.firstElementChild?.getBoundingClientRect();
		const last = strip.lastElementChild?.getBoundingClientRect();
		const before = first !== undefined && box.left - first.left > 1;
		const after = last !== undefined && last.right - box.right > 1;
		if (before !== moreBefore) moreBefore = before;
		if (after !== moreAfter) moreAfter = after;
	}

	function nudge(direction: 1 | -1) {
		strip?.scrollBy({ left: direction * clientWidth * 0.7, behavior: 'smooth' });
	}

	// A chip only ever moves the strip, never the page: `scrollIntoView` on a horizontally
	// scrolling child will happily scroll the document as well, and the list behind this is a
	// thousand rows long.
	function reveal(filter: StatusFilter) {
		if (!strip) return;
		const chip = strip.querySelector<HTMLElement>(`[data-filter="${filter}"]`);
		if (!chip) return;
		const box = strip.getBoundingClientRect();
		const at = chip.getBoundingClientRect();
		if (at.left < box.left + EDGE_GAP) {
			strip.scrollBy({ left: at.left - box.left - EDGE_GAP, behavior: 'smooth' });
		} else if (at.right > box.right - EDGE_GAP) {
			strip.scrollBy({ left: at.right - box.right + EDGE_GAP, behavior: 'smooth' });
		}
	}

	/** Tapping the chip that is already on is how the filter comes off. */
	function toggle(filter: WordStatus) {
		value = value === filter ? 'all' : filter;
	}

	// The strip changes width when a chip appears (a first miss creates "Shaky"), so the fades
	// are driven by a measurement rather than by a count of chips.
	$effect(() => {
		const el = strip;
		if (!el) return;
		untrack(measure);
		const observer = new ResizeObserver(() => untrack(measure));
		observer.observe(el);
		for (const child of el.children) observer.observe(child);
		return () => observer.disconnect();
	});

	$effect(() => {
		void chips.length;
		void value;
		untrack(() => {
			measure();
			reveal(value);
		});
	});
</script>

<div class="strip" class:before={moreBefore} class:after={moreAfter}>
	<div
		class="chips"
		role="group"
		aria-label="Filter by progress"
		bind:this={strip}
		onscroll={measure}
	>
		{#each chips as filter (filter)}
			<button
				type="button"
				class="chip-btn {filter}"
				class:on={filter === value}
				data-filter={filter}
				aria-pressed={filter === value}
				aria-label={filter === value
					? `${STATUS_META[filter].label}, ${counts[filter].toLocaleString('en')} words, showing — tap to show all`
					: `${STATUS_META[filter].label}, ${counts[filter].toLocaleString('en')} words`}
				onclick={() => toggle(filter)}
			>
				<!-- Number first, label under it. Announced the other way round by `aria-label`
				     above, because "Shaky, 14 words" is the sentence and "14 Shaky" is not. -->
				<span class="count tabular">{counts[filter].toLocaleString('en')}</span>
				<span class="label">{STATUS_META[filter].label}</span>
			</button>
		{/each}
	</div>

	<!-- Decorative: a keyboard reaches every chip by tabbing, and focus scrolls the strip on
	     its own, so these are pointer conveniences and stay out of the tab order. -->
	{#if moreBefore}
		<button
			type="button"
			class="nudge start"
			tabindex="-1"
			aria-hidden="true"
			onclick={() => nudge(-1)}
		>
			<svg viewBox="0 0 24 24" focusable="false">
				<path
					d="M15 5 8 12l7 7"
					fill="none"
					stroke="currentColor"
					stroke-width="2.2"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
		</button>
	{/if}
	{#if moreAfter}
		<button
			type="button"
			class="nudge end"
			tabindex="-1"
			aria-hidden="true"
			onclick={() => nudge(1)}
		>
			<svg viewBox="0 0 24 24" focusable="false">
				<path
					d="m9 5 7 7-7 7"
					fill="none"
					stroke="currentColor"
					stroke-width="2.2"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
		</button>
	{/if}
</div>

<style>
	.strip {
		position: relative;
		/* Edge to edge, so an overflowing chip runs off the screen rather than off an invisible
		   inner box. `--browse-bleed-*` are published by the screen and go to zero once the
		   controls become a desktop row; without them this simply stays inside its column. */
		margin-inline: calc(-1 * var(--browse-bleed-start, 0px)) calc(-1 * var(--browse-bleed-end, 0px));
	}

	.chips {
		display: flex;
		gap: 0.375rem;
		/* One line that scrolls, rather than a block that reflows the list top as chips
		   appear — the virtual list measures its own offset and a wrapping row would move it. */
		overflow-x: auto;
		scrollbar-width: none;
		/*
		 * `overflow-x: auto` computes `overflow-y` to `auto` as well, so this padding is the
		 * only thing between a focused chip and a focus ring sliced off top and bottom — the
		 * app's ring is 3px at 3px offset, and at 0.125rem all that survived was the two side
		 * arcs. The screen's own `--browse-pad-end` went to zero to pay for it, so the header
		 * is the same height it was.
		 */
		padding-block: 0.375rem;
		padding-inline: var(--browse-bleed-start, 0px) var(--browse-bleed-end, 0px);
		scroll-padding-inline: var(--browse-bleed-start, 0px) var(--browse-bleed-end, 0px);
		scroll-snap-type: x proximity;
		overscroll-behavior-x: contain;
	}

	.chips::-webkit-scrollbar {
		display: none;
	}

	/* The fade is the signal, so it exists only on a side that has chips behind it. Both sides
	   are opaque until a measurement says otherwise, which is also the no-JS state. The
	   prefixed pair is for iOS 15/16, where the unprefixed property does nothing; where even
	   that is missing the nudge button's own gradient still separates the chevron from the
	   chips underneath it. */
	.strip.before .chips {
		-webkit-mask-image: linear-gradient(to right, transparent 0, #000 2.75rem, #000 100%);
		mask-image: linear-gradient(to right, transparent 0, #000 2.75rem, #000 100%);
	}

	.strip.after .chips {
		-webkit-mask-image: linear-gradient(to left, transparent 0, #000 2.75rem, #000 100%);
		mask-image: linear-gradient(to left, transparent 0, #000 2.75rem, #000 100%);
	}

	.strip.before.after .chips {
		-webkit-mask-image: linear-gradient(
			to right,
			transparent 0,
			#000 2.75rem,
			#000 calc(100% - 2.75rem),
			transparent 100%
		);
		mask-image: linear-gradient(
			to right,
			transparent 0,
			#000 2.75rem,
			#000 calc(100% - 2.75rem),
			transparent 100%
		);
	}

	/*
	 * Two lines, so the chip is as wide as its widest line rather than as wide as both — that
	 * is the whole reason five of them fit a 320px phone.
	 *
	 * 36px tall rather than 44: this row and the search field above it are now the screen's
	 * entire chrome, and 44 + 44 + the padding between them put the first Chinese character
	 * past the fifth of the viewport this screen is allowed. WCAG 2.2's 24x24 minimum is
	 * cleared twice over on both axes, the chips are 6px apart, and the rows below are 76px
	 * targets. `min-block-size` says it out loud because layout.css sets a 44px floor on every
	 * button at zero specificity.
	 */
	.chip-btn {
		display: inline-flex;
		flex: none;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.0625rem;
		min-block-size: 2.25rem;
		padding-inline: 0.5625rem;
		border: 1px solid var(--color-line);
		border-radius: var(--radius-pill);
		background-color: transparent;
		color: var(--color-ink-muted);
		white-space: nowrap;
		scroll-snap-align: start;
		transition:
			background-color 160ms var(--ease-out-soft),
			border-color 160ms var(--ease-out-soft),
			color 160ms var(--ease-out-soft);
	}

	.count {
		color: var(--color-ink);
		font-size: var(--text-sm);
		font-weight: 700;
		line-height: 1.05;
	}

	.label {
		color: var(--color-ink-subtle);
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: 0.02em;
		line-height: 1.15;
	}

	.chip-btn.on {
		border-color: transparent;
		background-color: var(--color-primary);
		color: var(--color-primary-ink);
	}

	.chip-btn.on .count {
		color: var(--color-primary-ink);
	}

	.chip-btn.on .label {
		color: color-mix(in srgb, var(--color-primary-ink) 72%, transparent);
	}

	/* The two coloured states keep their colour when selected, so the chip and the pips it
	   filters to are visibly the same thing. Both still read as words, never colour alone. */
	.chip-btn.shaky.on {
		background-color: var(--color-accent);
		color: var(--color-accent-ink);
	}

	.chip-btn.shaky.on .count {
		color: var(--color-accent-ink);
	}

	.chip-btn.shaky.on .label {
		color: color-mix(in srgb, var(--color-accent-ink) 78%, transparent);
	}

	.chip-btn.mastered.on {
		background-color: var(--color-correct);
		color: var(--color-correct-ink);
	}

	.chip-btn.mastered.on .count {
		color: var(--color-correct-ink);
	}

	.chip-btn.mastered.on .label {
		color: color-mix(in srgb, var(--color-correct-ink) 78%, transparent);
	}

	@media (hover: hover) {
		.chip-btn:not(.on):hover {
			border-color: var(--color-line-strong);
			color: var(--color-ink);
		}
	}

	/*
	 * 320px. The chips stop carrying 22px of inside air each on the one width that cannot
	 * spare 110px of it. Nothing here changes what a chip IS: the two lines, the height and
	 * the whole scrolling apparatus survive, and the measurement above still runs — a longer
	 * label or a sixth bucket brings the fade and the nudge back on their own.
	 */
	@media (max-width: 22.5rem) {
		.chips {
			gap: 0.25rem;
		}

		.chip-btn {
			padding-inline: 0.3125rem;
		}

		.label {
			letter-spacing: 0;
		}
	}

	/* Sits over the faded edge it points at. Small on purpose — it is a hint that the strip
	   continues, not a control the eye should land on before the chips do. It carries its own
	   wash of the page colour so the chevron never lands on top of a half-faded letterform. */
	.nudge {
		position: absolute;
		inset-block: 0;
		display: grid;
		place-items: center;
		inline-size: 2rem;
		min-block-size: 0;
		padding: 0;
		border: 0;
		color: var(--color-ink-subtle);
	}

	.nudge.start {
		inset-inline-start: 0;
		background: linear-gradient(to right, var(--color-page) 55%, transparent);
	}

	.nudge.end {
		inset-inline-end: 0;
		background: linear-gradient(to left, var(--color-page) 55%, transparent);
	}

	.nudge svg {
		inline-size: 1rem;
		block-size: 1rem;
	}

	@media (hover: hover) {
		.nudge:hover {
			color: var(--color-ink);
		}
	}

	/* One control row with room to spare. */
	@media (min-width: 60rem) {
		.chip-btn {
			min-block-size: 2.625rem;
			padding-inline: 0.6875rem;
		}
	}
</style>
