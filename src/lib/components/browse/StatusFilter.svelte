<!--
	Filter the level by what the learner has done with each word.

	This is the bit that makes browsing and practising feel like one product rather than a word
	list next to a game: "show me the 14 I keep missing" is the reason to open this screen at
	all, and it is one tap.

	Chips for states nobody has reached yet stay hidden — on a first visit every word is new, so
	four buttons reading 0 would be four buttons of noise. They appear as the states do.
-->
<script lang="ts">
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
</script>

<div class="chips" role="group" aria-label="Filter by progress">
	{#each shown as filter (filter)}
		<button
			type="button"
			class="chip-btn {filter}"
			class:on={filter === value}
			aria-pressed={filter === value}
			onclick={() => (value = filter)}
		>
			{STATUS_META[filter].label}
			<span class="count">{counts[filter].toLocaleString('en')}</span>
		</button>
	{/each}
</div>

<style>
	.chips {
		display: flex;
		gap: 0.375rem;
		/* One line that scrolls, rather than a block that reflows the list top as chips
		   appear — the virtual list measures its own offset and a wrapping row would move it. */
		overflow-x: auto;
		scrollbar-width: none;
		padding-block: 0.125rem;
	}

	.chips::-webkit-scrollbar {
		display: none;
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
</style>
