<!--
	A word's learning state, as a 1.125rem glyph on the trailing edge of a row.

	The design system's colour contract says a state may never be signalled by colour alone, so
	each state is a different *shape* first and a different colour second: an empty ring, a ring
	with a centre, a cross, a tick. A word a teach card has shown but never tested is an unbroken
	ring: outlined, not yet filled in. At 18px a tick and a cross are still unmistakable, and the
	three coloured states use the two colours that already mean what they mean everywhere else
	in the app — jade confirms, red alerts.

	The glyph is decorative; the row carries the state in text for a screen reader.
-->
<script lang="ts">
	import type { WordStatus } from './status';

	let { status, class: extra = '' }: { status: WordStatus; class?: string } = $props();
</script>

<span class="pip {status} {extra}" aria-hidden="true">
	{#if status === 'mastered'}
		<svg viewBox="0 0 18 18" focusable="false">
			<circle cx="9" cy="9" r="8" fill="currentColor" />
			<path
				d="m5.4 9.3 2.4 2.4 4.8-5"
				fill="none"
				stroke="var(--color-correct-ink)"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
	{:else if status === 'shaky'}
		<svg viewBox="0 0 18 18" focusable="false">
			<circle cx="9" cy="9" r="8" fill="currentColor" />
			<path
				d="m6.2 6.2 5.6 5.6M11.8 6.2l-5.6 5.6"
				fill="none"
				stroke="var(--color-accent-ink)"
				stroke-width="2"
				stroke-linecap="round"
			/>
		</svg>
	{:else if status === 'seen'}
		<svg viewBox="0 0 18 18" focusable="false">
			<circle cx="9" cy="9" r="7" fill="none" stroke="currentColor" stroke-width="2" />
		</svg>
	{:else if status === 'learning'}
		<svg viewBox="0 0 18 18" focusable="false">
			<circle cx="9" cy="9" r="7" fill="none" stroke="currentColor" stroke-width="2" />
			<circle cx="9" cy="9" r="3" fill="currentColor" />
		</svg>
	{:else}
		<svg viewBox="0 0 18 18" focusable="false">
			<circle
				cx="9"
				cy="9"
				r="7"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-dasharray="2.6 2.6"
			/>
		</svg>
	{/if}
</span>

<style>
	.pip {
		display: block;
		flex: none;
		inline-size: 1.125rem;
		block-size: 1.125rem;
	}

	.pip svg {
		display: block;
		inline-size: 100%;
		block-size: 100%;
	}

	.new {
		color: var(--color-line-strong);
	}

	.seen {
		color: var(--color-ink-subtle);
	}

	.learning {
		color: var(--color-ink-subtle);
	}

	.shaky {
		color: var(--color-accent);
	}

	.mastered {
		color: var(--color-correct);
	}
</style>
