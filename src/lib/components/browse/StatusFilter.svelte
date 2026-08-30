<!--
	Filter the level by what the learner has done with each word.

	This is the bit that makes browsing and practising feel like one product rather than a word
	list next to a game: "show me the 14 I keep missing" is the reason to open this screen at
	all, and it is one tap.

	Chips for states nobody has reached yet stay hidden — on a first visit every word is new, so
	four buttons reading 0 would be four buttons of noise. They appear as the states do.

	WHY THE COUNT SITS ABOVE THE LABEL
	Laid out as one line — `Shaky 14` — the five chips measured 513px against a 375px phone, so
	`Mastered 50` was 118px off the right edge and `Shaky`'s number sat under the fade that was
	meant to advertise the overflow. Scroll affordances were the answer to the wrong question:
	the count is the payload, and a strip whose payload is offscreen has failed whatever it does
	to announce the fact.

	Stacking the number over the label makes each chip as wide as its widest line instead of the
	sum of both, which is what brings all five inside 375px with room to spare. It costs 12px of
	sticky height and buys back three things: every count readable without a gesture, the number
	first in the reading order — which is what the chip is consulted for — and a 44px-tall tap
	target, which the 32px one-line pill was not.

	The scrolling machinery below stays, because 320px phones and a future sixth state still
	exist: it scrolls edge to edge so a clipped chip reads as "continues offscreen" rather than
	"broken layout", the overflowing edge is masked to a fade, and a nudge button sits on it.
	None of it fires at 375px any more. Selecting a chip still scrolls it fully into view.
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
	let clientWidth = $state(0);
	let moreBefore = $state(false);
	let moreAfter = $state(false);

	/**
	 * Whether a *chip* is cut off, not whether the scroller has room left in it.
	 *
	 * `scrollWidth - clientWidth` is the obvious test and the wrong one here: the strip carries
	 * the screen's gutter as its own inline padding so the first chip lines up with the text
	 * column, and that trailing 20px counts as scrollable width. With all five chips fitting
	 * inside 375px it still reported an overflow, so the fade landed on `Mastered` and greyed
	 * out a chip that was entirely on screen. Comparing the end chip's own right edge against
	 * the strip's says what the learner can actually see.
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
				aria-label={`${STATUS_META[filter].label}, ${counts[filter].toLocaleString('en')} words`}
				onclick={() => (value = filter)}
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

	/* Two lines, so the chip is as wide as its widest line rather than as wide as both — that
	   is the whole reason five of them fit a 375px phone. `--spacing-tap` tall, so it is also
	   the first version of this control a thumb can hit reliably. */
	.chip-btn {
		display: inline-flex;
		flex: none;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.0625rem;
		min-block-size: var(--spacing-tap);
		padding-inline: 0.6875rem;
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
		line-height: 1.1;
	}

	.label {
		color: var(--color-ink-subtle);
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: 0.02em;
		line-height: 1.2;
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
	 * 320px, where the fifth chip was 51px off the right edge behind a 44px fade — "100
	 * Mastered", the count a learner opens this screen for, unreadable without a gesture on
	 * the phone least able to afford one. Nothing here changes what a chip IS: the two lines,
	 * the 44px height and the whole scrolling apparatus survive. The chips simply stop
	 * carrying 22px of inside air each on the one width that cannot spare 110px of it.
	 *
	 * The measurement below is unchanged and still runs, so a sixth state, a longer label or
	 * a 1,070-wide count would bring the fade and the nudge back on their own.
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
