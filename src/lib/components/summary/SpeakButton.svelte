<!--
	The one control on a review card: hear the word.

	Rendered only after mount, because `canSpeak()` is false on the server and a button that
	appears on hydration would otherwise shove the card down under a thumb. The row it lives in
	reserves its height, so nothing moves when it arrives.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { canSpeak, speak } from './speech';

	interface Props {
		/** The hanzi to say. */
		text: string;
		/** Pinyin, so the accessible name says which word this button belongs to. */
		pinyin: string;
	}

	let { text, pinyin }: Props = $props();

	let available = $state(false);

	onMount(() => {
		available = canSpeak();
	});
</script>

{#if available}
	<button type="button" class="say" onclick={() => speak(text)}>
		<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
			<path
				d="M4 7.5h2.4L10.5 4v12L6.4 12.5H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1Z"
				fill="currentColor"
				stroke="currentColor"
				stroke-width="1.1"
				stroke-linejoin="round"
			/>
			<path
				d="M13.6 7.1a4 4 0 0 1 0 5.8M15.9 4.6a7.3 7.3 0 0 1 0 10.8"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
			/>
		</svg>
		<span aria-hidden="true">Listen</span>
		<span class="sr-only">Listen to {text}, {pinyin}</span>
	</button>
{/if}

<style>
	.say {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		min-block-size: var(--spacing-tap);
		padding-inline: 0.6875rem;
		border: 1px solid var(--color-line);
		border-radius: var(--radius-pill);
		background-color: var(--color-surface);
		color: var(--color-ink-muted);
		font-size: var(--text-xs);
		font-weight: 650;
		letter-spacing: 0.02em;
		transition:
			background-color 140ms var(--ease-out-soft),
			border-color 140ms var(--ease-out-soft),
			color 140ms var(--ease-out-soft);
	}

	.say svg {
		inline-size: 1rem;
		block-size: 1rem;
	}

	.say:active {
		background-color: var(--color-surface-sunken);
		color: var(--color-ink);
	}

	@media (hover: hover) {
		.say:hover {
			border-color: var(--color-line-strong);
			background-color: var(--color-surface-sunken);
			color: var(--color-ink);
		}
	}
</style>
