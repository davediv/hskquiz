<!--
	The one piece of UI that tells the truth about where progress is going.

	The store has always known when it was not saving — `status` and `rescue` were right the
	whole time — and nothing rendered them, so the home screen kept promising "Progress is kept
	on this device" to a learner in private browsing whose answers were evaporating. This is
	that promise, held to.

	Silent in the normal case: renders nothing at all while writes are landing and nothing is
	waiting to be recovered. Drop it near the top of any screen that claims progress is being
	kept — the home screen, the quiz, the session summary.

		import StorageNotice from '$lib/progress/StorageNotice.svelte';
		<StorageNotice />

	The rescue notice is not just an apology: it is the way back. Bytes the store could not
	read, and bytes a merge would have dropped with no reset to account for them, are copied to
	`hskquiz:progress:broken` instead of being overwritten — and until this component grew a
	Restore button, nothing in the codebase ever read that key again.

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

	/** Set when a Restore was attempted and could not be completed. */
	let restoreFailed = $state(false);

	const rescue = $derived(hydrated ? progress.rescue : null);

	/** "40 words · 128 answers", or nothing when the copy cannot be read either. */
	const rescueSize = $derived.by(() => {
		const info = rescue;
		if (!info || info.words === null) return null;
		const words = `${info.words.toLocaleString('en')} ${info.words === 1 ? 'word' : 'words'}`;
		return `${words} · ${info.answers.toLocaleString('en')} answers`;
	});

	interface Notice {
		key: string;
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
				key: 'unavailable',
				tone: 'warn',
				glyph: '!',
				title: 'Progress is not being saved',
				detail:
					'This browser is not letting the app store anything — private browsing, or site data ' +
					'turned off. Practise still works, but today’s answers go when the tab does.'
			});
		} else if (progress.status === 'failing') {
			list.push({
				key: 'failing',
				tone: 'warn',
				glyph: '!',
				title: 'Progress is not being saved',
				detail:
					'The browser refused the last write, most likely because its storage is full. Still ' +
					'trying — until it succeeds, these answers live only in this tab.'
			});
		}

		return list;
	});

	function onRestore() {
		restoreFailed = !progress.restoreRescue();
	}

	function onDiscard() {
		restoreFailed = false;
		progress.discardRescue();
	}
</script>

{#if notices.length > 0 || rescue}
	<div class="storage-notice-group {className}" role="status" aria-live="polite">
		{#each notices as notice (notice.key)}
			<div class="storage-notice" data-tone={notice.tone}>
				<span class="storage-notice-glyph" aria-hidden="true">{notice.glyph}</span>
				<p class="storage-notice-body">
					<strong>{notice.title}.</strong>
					{notice.detail}
				</p>
			</div>
		{/each}

		{#if rescue}
			<div class="storage-notice" data-tone="info">
				<span class="storage-notice-glyph" aria-hidden="true">↺</span>
				<div class="storage-notice-body">
					<p class="storage-notice-line">
						<strong>Earlier progress was kept aside.</strong>
						{#if rescue.reason === 'lost'}
							A save would have dropped history that nothing here accounts for, so it was copied
							somewhere safe instead of being written over.
						{:else}
							What was saved before could not be read — a half-finished write, or a newer version of
							this app. It was copied somewhere safe rather than overwritten.
						{/if}
						{#if rescueSize}
							It holds <strong>{rescueSize}</strong>.
						{:else}
							It cannot be read from here either, so it is being kept rather than guessed at.
						{/if}
					</p>
					{#if restoreFailed}
						<p class="storage-notice-line storage-notice-failed">
							That could not be put back — the copy is unreadable, or storage is refusing writes.
							Nothing was thrown away.
						</p>
					{/if}
					<p class="storage-notice-actions">
						{#if rescue.words !== null && rescue.words > 0}
							<button type="button" class="storage-notice-action" onclick={onRestore}>
								Restore it
							</button>
						{/if}
						<button
							type="button"
							class="storage-notice-action storage-notice-action-quiet"
							onclick={onDiscard}
						>
							Discard
						</button>
					</p>
				</div>
			</div>
		{/if}
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

	.storage-notice-line {
		margin: 0;
	}

	.storage-notice-body strong {
		color: var(--color-ink);
		font-weight: 650;
	}

	.storage-notice[data-tone='warn'] .storage-notice-body {
		color: var(--color-ink);
	}

	.storage-notice-failed {
		margin-block-start: var(--spacing-2xs);
		color: var(--color-accent);
	}

	/* The way back. Two text buttons rather than one filled control: recovering history is a
	   decision, not the primary action of the screen this notice is sitting on. */
	.storage-notice-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--spacing-xs);
		margin: var(--spacing-2xs) 0 0;
	}

	.storage-notice-action {
		min-block-size: 0;
		padding: calc(var(--spacing) * 1.5) var(--spacing-sm);
		border: 1px solid var(--color-line-strong);
		border-radius: var(--radius-sm);
		background-color: var(--color-surface);
		color: var(--color-ink);
		font-size: var(--text-xs);
		font-weight: 650;
		line-height: 1.2;
	}

	.storage-notice-action-quiet {
		border-color: transparent;
		background-color: transparent;
		color: var(--color-ink-subtle);
		font-weight: 550;
		text-decoration: underline;
		text-underline-offset: 0.2em;
	}

	@media (hover: hover) {
		.storage-notice-action:hover {
			border-color: var(--color-ink);
		}

		.storage-notice-action-quiet:hover {
			border-color: transparent;
			color: var(--color-ink);
		}
	}
</style>
