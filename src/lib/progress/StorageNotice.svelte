<!--
	The one piece of UI that tells the truth about where progress is going.

	The store has always known when it was not saving — `persistent` and `pending` were right
	the whole time — and nothing rendered them, so the home screen kept promising "Progress is
	kept on this device" to a learner in private browsing whose answers were evaporating. This
	is that promise, held to.

	Silent in the normal case: renders nothing at all while writes are landing. Drop it near
	the top of any screen that claims progress is being kept.

		import StorageNotice from '$lib/progress/StorageNotice.svelte';
		<StorageNotice />

	Imported by path rather than through `$lib/progress`, so the barrel stays a plain module
	that the node test project can import without a Svelte compiler.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { progress } from './progress.svelte.ts';

	interface Props {
		/** Extra classes on the wrapper, for a screen that needs its own spacing. */
		class?: string;
	}

	let { class: className = '' }: Props = $props();

	/**
	 * Storage is a client fact. On the server every store is memory-only, so rendering this
	 * during SSR would tell every visitor their progress was not being saved, for one frame,
	 * and then take it back. `onMount` is the moment the answer becomes knowable — and it is
	 * the right rune here rather than `$effect`, because this is a "the client is now running"
	 * latch, not a value derived from anything.
	 */
	let hydrated = $state(false);

	onMount(() => {
		hydrated = true;
	});

	interface Notice {
		tone: 'warn' | 'info';
		glyph: string;
		title: string;
		detail: string;
	}

	const notices = $derived.by((): Notice[] => {
		if (!hydrated) return [];
		const list: Notice[] = [];

		if (progress.status === 'unavailable') {
			list.push({
				tone: 'warn',
				glyph: '!',
				title: 'Progress is not being saved',
				detail:
					'This browser is not letting the app store anything — private browsing, or site data ' +
					'turned off. Practise still works, but today’s answers go when the tab does.'
			});
		} else if (progress.status === 'failing') {
			list.push({
				tone: 'warn',
				glyph: '!',
				title: 'Progress is not being saved',
				detail:
					'The browser refused the last write, most likely because its storage is full. Still ' +
					'trying — until it succeeds, these answers live only in this tab.'
			});
		}

		if (progress.salvaged) {
			list.push({
				tone: 'info',
				glyph: '↺',
				title: 'Earlier progress could not be read',
				detail:
					'What was saved before this session was unreadable, so it has been kept aside ' +
					'rather than overwritten. Nothing has been thrown away.'
			});
		}

		return list;
	});
</script>

{#if notices.length > 0}
	<div class="storage-notice-group {className}" role="status" aria-live="polite">
		{#each notices as notice (notice.title)}
			<div class="storage-notice" data-tone={notice.tone}>
				<span class="storage-notice-glyph" aria-hidden="true">{notice.glyph}</span>
				<p class="storage-notice-body">
					<strong>{notice.title}.</strong>
					{notice.detail}
				</p>
			</div>
		{/each}
	</div>
{/if}

<style>
	.storage-notice-group {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	/* Not `.card`: this is a message, not a surface the learner acts on. A tinted panel with a
	   left rule reads as an aside at a glance and never competes with the level cards. */
	.storage-notice {
		display: flex;
		align-items: flex-start;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-card);
		border: 1px solid var(--color-line);
		border-inline-start: 3px solid var(--color-line-strong);
		background-color: var(--color-surface-sunken);
		color: var(--color-ink-muted);
		text-align: start;
	}

	/* Red alerts — the accent's second job. The glyph carries the same message, so colour is
	   never the only channel. */
	.storage-notice[data-tone='warn'] {
		border-color: var(--color-accent-soft);
		border-inline-start-color: var(--color-accent);
		background-color: var(--color-accent-soft);
	}

	.storage-notice-glyph {
		flex: none;
		display: grid;
		place-items: center;
		inline-size: calc(var(--spacing) * 5);
		block-size: calc(var(--spacing) * 5);
		margin-block-start: 1px;
		border-radius: var(--radius-pill);
		background-color: var(--color-line-strong);
		color: var(--color-surface);
		font-size: var(--text-xs);
		font-weight: 700;
		line-height: 1;
	}

	.storage-notice[data-tone='warn'] .storage-notice-glyph {
		background-color: var(--color-accent);
		color: var(--color-accent-ink);
	}

	.storage-notice-body {
		margin: 0;
		font-size: var(--text-sm);
		line-height: 1.45;
		text-wrap: pretty;
	}

	.storage-notice-body strong {
		color: var(--color-ink);
		font-weight: 650;
	}

	.storage-notice[data-tone='warn'] .storage-notice-body {
		color: var(--color-ink);
	}
</style>
