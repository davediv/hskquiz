<!--
	The level segmented control.

	Five links, not a <select>: switching level is the second most common thing to do on this
	screen after typing, so it costs one tap and shows all five options at once. They are real
	links, so the level is in the URL, the back button works, and a level can be bookmarked or
	shared. Hovering or focusing one warms its vocabulary chunk, so by the time the tap lands
	the words are usually already there.
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
		gap: 0.125rem;
		padding: 0.1875rem;
		border-radius: var(--radius-pill);
		background-color: var(--color-surface-sunken);
	}

	.seg {
		display: grid;
		place-items: center;
		min-inline-size: 2.125rem;
		/* Deliberately under the 44px minimum: the whole strip is one control and the rows
		   below are the 80px targets. 34x30 with 3px of padding each side still clears the
		   9mm the WCAG target-size guidance asks of a control inside a compact group. */
		block-size: 1.875rem;
		padding-inline: 0.375rem;
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
</style>
