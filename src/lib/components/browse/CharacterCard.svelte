<!--
	One character of the open word, and the way out of the sheet.

	Pleco's CHARS tab tells you which syllable belongs to which character and stops. That is a
	fact about the word you already have open; it does not take you anywhere. This card is the
	same fact plus the answer to the question a learner actually has at that moment — *where else
	does this character go?* — because 安慰 is only expensive to learn until you know that the 安
	in it is the 安 of 安全, 安静 and 安排, three words you can already read.

	So the card is three things stacked:

	  · the character, its syllable, and a short English gloss. If the character is itself an
	    HSK word the gloss is that entry's own and the whole head is a link into it; if it is
	    not (慰, 萄, 圾 — 640 of the 1,500 characters here) the gloss comes from `charGloss.ts`
	    and the head is inert, because there is no entry to open.
	  · every other shipped word built on it, levels ascending, in the list's own three-tier
	    treatment so a row reads the same here as it does on the screen behind. The level badge
	    is the point of the ordering: a level-5 learner should see at a glance which of these
	    are already behind them.
	  · what is left over, counted rather than hidden, so the card never implies the character
	    only appears six times.
-->
<script lang="ts">
	import { Hanzi, Pinyin } from '$lib/design';
	import type { Syllable, Word } from '$lib/types';
	import type { CharCard } from './related';

	interface Props {
		card: CharCard;
		/** The syllable this character carries in the word that is open. */
		syllable: Syllable;
		/** How the tone is named out loud, so colour is never the only carrier. */
		toneName: string;
		/** Still loading the other four levels' chunks. */
		pending: boolean;
		/**
		 * Show the character's own head. Off for a single-character headword: 安 taken apart is
		 * 安, so the card is only the words built on it and the head would say it twice.
		 */
		head?: boolean;
		onopen: (word: Word) => void;
	}

	let { card, syllable, toneName, pending, head = true, onopen }: Props = $props();
</script>

<li class="card">
	{#snippet face()}
		<Hanzi text={card.char} size="md" class="face-hz" />
		<span class="face-text">
			<span class="face-say">
				<Pinyin pinyin={syllable.py} syllables={[syllable]} size="md" class="face-py" />
				<span class="tone">{toneName}</span>
			</span>
			{#if card.gloss}<span class="face-gloss">{card.gloss}</span>{/if}
		</span>
	{/snippet}

	{#if !head}
		<!-- No head: the section's own title is already the character. -->
	{:else if card.entry}
		<button type="button" class="head open" onclick={() => onopen(card.entry as Word)}>
			{@render face()}
			<span class="lvl" aria-label={`HSK ${card.entry.level}`}>HSK {card.entry.level}</span>
			<svg class="go" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
				<path
					d="m9 5 7 7-7 7"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
		</button>
	{:else}
		<div class="head">
			{@render face()}
			<!-- Said plainly rather than left as an absence: the character has no entry of its
			     own in HSK 1–5, which is itself worth knowing. -->
			<span class="lvl quiet">not a word alone</span>
		</div>
	{/if}

	{#if card.rows.length > 0}
		<ul class="rows">
			{#each card.rows as row (row.id)}
				<li>
					<button type="button" class="row" onclick={() => onopen(row)}>
						<span class="row-head">
							<Hanzi text={row.hanzi} size="xs" class="row-hz" />
							<Pinyin word={row} size="sm" class="row-py" />
						</span>
						<span class="row-gloss">{row.meanings.join(', ')}</span>
						<span class="badge" aria-hidden="true">{row.level}</span>
						<span class="sr-only">HSK {row.level}</span>
					</button>
				</li>
			{/each}
		</ul>
		{#if card.more > 0}
			<p class="more">
				{card.more.toLocaleString('en')} more HSK
				{card.more === 1 ? 'word uses' : 'words use'}
				<span lang="zh-Hans" class="more-hz">{card.char}</span>
			</p>
		{/if}
	{:else if pending}
		<p class="more">Looking through the other levels…</p>
	{:else}
		<p class="more">
			No other HSK 1–5 word uses <span lang="zh-Hans" class="more-hz">{card.char}</span>
		</p>
	{/if}
</li>

<style>
	.card {
		border: 1px solid var(--color-line);
		border-radius: var(--radius-md);
		background-color: var(--color-surface);
		overflow: hidden;
	}

	/* The character itself gets the weight: it is the thing the rest of the card is about. */
	.head {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto auto;
		align-items: center;
		gap: 0.625rem;
		inline-size: 100%;
		min-block-size: var(--spacing-tap);
		padding: 0.625rem 0.75rem;
		border: 0;
		background-color: var(--color-surface-sunken);
		text-align: start;
	}

	/* No chevron on a character with no entry to open, so the trailing column goes with it. */
	.head:not(.open) {
		grid-template-columns: auto minmax(0, 1fr) auto;
	}

	.head :global(.face-hz) {
		color: var(--color-ink);
	}

	.face-text {
		display: flex;
		flex-direction: column;
		gap: 0.0625rem;
		min-inline-size: 0;
	}

	.face-say {
		display: flex;
		align-items: baseline;
		gap: 0.4375rem;
		min-inline-size: 0;
	}

	.tone {
		color: var(--color-ink-subtle);
		font-size: var(--text-2xs);
		white-space: nowrap;
	}

	.face-gloss {
		overflow: hidden;
		color: var(--color-ink-muted);
		font-size: var(--text-sm);
		line-height: 1.4;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.lvl {
		flex: none;
		color: var(--color-ink-subtle);
		font-size: var(--text-2xs);
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.lvl.quiet {
		max-inline-size: 6.5rem;
		font-weight: 500;
		letter-spacing: 0.02em;
		text-align: end;
		text-transform: none;
		white-space: normal;
	}

	.go {
		flex: none;
		inline-size: 1rem;
		block-size: 1rem;
		margin-inline-start: -0.25rem;
		color: var(--color-ink-subtle);
	}

	.rows {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.rows > li + li .row {
		border-block-start: 1px solid var(--color-line);
	}

	/*
	 * The list row's own ranking at three quarters the size — hanzi and pinyin sharing a
	 * baseline, meaning underneath — so a word reads the same here as on the screen behind.
	 * Full-width tap target, comfortably past the 44px minimum.
	 */
	.row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		column-gap: 0.625rem;
		inline-size: 100%;
		min-block-size: var(--spacing-tap);
		padding: 0.5rem 0.75rem;
		border: 0;
		background: none;
		text-align: start;
	}

	.row-head {
		display: flex;
		align-items: baseline;
		gap: 0.4375rem;
		min-inline-size: 0;
		grid-column: 1;
	}

	.row :global(.row-hz) {
		flex: none;
		color: var(--color-ink);
	}

	.row :global(.row-py) {
		min-inline-size: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.row-gloss {
		grid-column: 1;
		overflow: hidden;
		color: var(--color-ink-muted);
		font-size: var(--text-xs);
		line-height: 1.45;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* One digit in a ring, repeated down the column as a rail: "HSK 2" six times over is
	   noise, and the head above it has already spelled the badge out in full. */
	.badge {
		display: grid;
		grid-row: 1 / span 2;
		grid-column: 2;
		place-items: center;
		inline-size: 1.375rem;
		block-size: 1.375rem;
		border: 1px solid var(--color-line-strong);
		border-radius: var(--radius-pill);
		color: var(--color-ink-subtle);
		font-size: var(--text-2xs);
		font-weight: 700;
		letter-spacing: 0;
	}

	.more {
		margin: 0;
		padding: 0.5rem 0.75rem 0.625rem;
		border-block-start: 1px solid var(--color-line);
		color: var(--color-ink-subtle);
		font-size: var(--text-xs);
	}

	.more-hz {
		font-family: var(--font-hanzi);
		color: var(--color-ink-muted);
	}

	.row:active,
	.head.open:active {
		background-color: var(--color-surface-sunken);
	}

	@media (hover: hover) {
		.row:hover {
			background-color: var(--color-surface-sunken);
		}

		.head.open:hover .go,
		.head.open:hover .lvl {
			color: var(--color-ink-muted);
		}
	}
</style>
