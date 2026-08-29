<!--
	Filter the level by what the learner has done with each word.

	This is the bit that makes browsing and practising feel like one product rather than a word
	list next to a game: "show me the 14 I keep missing" is the reason to open this screen at
	all, and it is one tap.

	Chips for states nobody has reached yet stay hidden — on a first visit every word is new, so
	four buttons reading 0 would be four buttons of noise. They appear as the states do.

	WHY THIS SCROLLS, AND WHY IT SAYS SO
	Once all five exist they measure 488px against a 375px phone. Wrapping to a second line is
	the obvious answer and the wrong one: this block is sticky, so every pixel it takes is a
	pixel of word list gone for the whole session. So it scrolls — but a strip that scrolls
	without saying so is worse than one that wraps, and the previous version hid its scrollbar
	and stopped there: "Shaky" was sliced through the middle of the word and "Mastered 120",
	the chip the whole feature exists for, was simply not on screen and nothing hinted at it.

	Three things fix that, and all three are needed:
	  · it scrolls edge to edge rather than inside the text column, so a chip crossing the
	    screen edge reads as "continues offscreen" instead of "broken layout";
	  · the edge it continues past is masked to a fade, and the mask only appears on a side
	    that actually has more chips behind it;
	  · a nudge button sits on that side, so the rest is one tap away and not a discovery.
	Selecting a chip — including with the keyboard — scrolls it fully into view.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { STATUS_FILTERS, STATUS_META, type StatusCounts, type StatusFilter } from './status';

	interface Props {
		value: StatusFilter;
		counts: StatusCounts;
	}

	let { value = $bindable('all'), counts }: Props = $props();

	const shown = $derived(
		STATUS_FILTERS.filter(
			(filter) => filter === 'all' || filter === 'new' || counts[filter] > 0 || filter === value
		)
	);

	/** Breathing room left beside a chip that has just been scrolled into view. */
	const EDGE_GAP = 12;

	let strip = $state<HTMLElement | null>(null);
	let scrollLeft = $state(0);
	let scrollWidth = $state(0);
	let clientWidth = $state(0);

	const overflowing = $derived(scrollWidth - clientWidth > 1);
	const moreBefore = $derived(overflowing && scrollLeft > 1);
	const moreAfter = $derived(overflowing && scrollLeft < scrollWidth - clientWidth - 1);

	function measure() {
		if (!strip) return;
		if (strip.scrollLeft !== scrollLeft) scrollLeft = strip.scrollLeft;
		if (strip.scrollWidth !== scrollWidth) scrollWidth = strip.scrollWidth;
		if (strip.clientWidth !== clientWidth) clientWidth = strip.clientWidth;
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
		void shown.length;
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
		{#each shown as filter (filter)}
			<button
				type="button"
				class="chip-btn {filter}"
				class:on={filter === value}
				data-filter={filter}
				aria-pressed={filter === value}
				onclick={() => (value = filter)}
			>
				{STATUS_META[filter].label}
				<span class="count">{counts[filter].toLocaleString('en')}</span>
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
		padding-block: 0.125rem;
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

	.chip-btn {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: 0.375rem;
		min-block-size: 2rem;
		padding-inline: 0.75rem;
		border: 1px solid var(--color-line);
		border-radius: var(--radius-pill);
		background-color: transparent;
		color: var(--color-ink-muted);
		font-size: var(--text-xs);
		font-weight: 600;
		white-space: nowrap;
		scroll-snap-align: start;
		transition:
			background-color 160ms var(--ease-out-soft),
			border-color 160ms var(--ease-out-soft),
			color 160ms var(--ease-out-soft);
	}

	.count {
		color: var(--color-ink-subtle);
		font-variant-numeric: tabular-nums;
		font-weight: 500;
	}

	.chip-btn.on {
		border-color: transparent;
		background-color: var(--color-primary);
		color: var(--color-primary-ink);
	}

	.chip-btn.on .count {
		color: color-mix(in srgb, var(--color-primary-ink) 70%, transparent);
	}

	/* The two coloured states keep their colour when selected, so the chip and the pips it
	   filters to are visibly the same thing. Both still read as words, never colour alone. */
	.chip-btn.shaky.on {
		background-color: var(--color-accent);
		color: var(--color-accent-ink);
	}

	.chip-btn.shaky.on .count {
		color: color-mix(in srgb, var(--color-accent-ink) 75%, transparent);
	}

	.chip-btn.mastered.on {
		background-color: var(--color-correct);
		color: var(--color-correct-ink);
	}

	.chip-btn.mastered.on .count {
		color: color-mix(in srgb, var(--color-correct-ink) 75%, transparent);
	}

	@media (hover: hover) {
		.chip-btn:not(.on):hover {
			border-color: var(--color-line-strong);
			color: var(--color-ink);
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
</style>
