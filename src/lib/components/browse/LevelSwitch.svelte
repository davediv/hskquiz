<!--
	The level segmented control.

	Five links, not a <select>: switching level is the second most common thing to do on this
	screen after typing, so it costs one tap and shows all five options at once. They are real
	links, so the level is in the URL, the back button works, and a level can be bookmarked or
	shared. Hovering or focusing one warms its vocabulary chunk, so by the time the tap lands
	the words are usually already there.

	WHY IT IS THIS SMALL ON A PHONE
	It shares a 44px row with the search field now — the browse header used to spend a whole
	row on this control plus a word count, and three stacked control rows put the first Chinese
	character 238px down an 812px phone. At 138x40 the five links leave the field 189px at
	375, and they sit inside the 44px the field alone used to have. The width is the only
	thing that came down: a segment is 26x32 rather than 34x30, so the target grew on the axis
	a thumb actually misses on.
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import { preloadLevel } from '$lib/data';
	import { LEVELS, type Level } from '$lib/types';

	let { level }: { level: Level } = $props();
</script>

<nav class="switch" aria-label="HSK level">
	{#each LEVELS as option (option)}
		<a
			class="seg"
			class:current={option === level}
			href={resolve('/browse/[level]', { level: String(option) })}
			aria-current={option === level ? 'page' : undefined}
			onpointerenter={() => preloadLevel(option)}
			onfocus={() => preloadLevel(option)}
		>
			<span class="sr-only">HSK level </span>{option}
		</a>
	{/each}
</nav>

<style>
	.switch {
		display: flex;
		flex: none;
		gap: 0;
		padding: var(--spacing-2xs);
		border-radius: var(--radius-pill);
		background-color: var(--color-surface-sunken);
	}

	.seg {
		display: grid;
		place-items: center;
		min-inline-size: 1.625rem;
		/*
		 * Deliberately under the 44px minimum, and `min-block-size` has to say so out loud:
		 * layout.css sets that floor on every `a[href]` at zero specificity, so a plain
		 * `block-size` here loses to it and the control silently grew to 50px tall.
		 *
		 * 26x32 inside one 4px-inset track is one control, not five: WCAG 2.2's 24x24 minimum
		 * is cleared on both axes, and the rows below are the 76px targets. The old 34x30 was
		 * wider and shorter — the wrong trade for a thumb, and 46px of width this screen now
		 * spends on the search field beside it.
		 */
		min-block-size: 2rem;
		padding-inline: 0.25rem;
		border-radius: var(--radius-pill);
		color: var(--color-ink-muted);
		font-size: var(--text-sm);
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		line-height: 1;
		text-decoration: none;
		transition:
			background-color 160ms var(--ease-out-soft),
			color 160ms var(--ease-out-soft);
	}

	.seg.current {
		background-color: var(--color-primary);
		color: var(--color-primary-ink);
	}

	@media (hover: hover) {
		.seg:not(.current):hover {
			color: var(--color-ink);
			background-color: color-mix(in srgb, var(--color-ink) 7%, transparent);
		}
	}

	/* 320px, where 138px of level switch is 43% of everything the row has. A segment goes to
	   the 24px WCAG 2.2 minimum and not below it, which hands the search field 10px — the
	   difference between a placeholder that names what it takes and one that reads "hanzi or
	   piny". */
	@media (max-width: 22.5rem) {
		.seg {
			min-inline-size: 1.5rem;
		}
	}

	/* One control row with room to spare, so the segments go back to a comfortable size. */
	@media (min-width: 60rem) {
		.seg {
			min-inline-size: 2.125rem;
			min-block-size: 2.125rem;
		}
	}
</style>
