<!--
	The app bar. Contextual rather than a fixed tab bar — see the note in +layout.svelte for
	why this app does not get Du Chinese's three-item bottom bar.

	  home    mark + wordmark, left aligned. Identity, nothing else.
	  browse  back to levels, the level name, and the one lateral move worth offering:
	          practise the level you are currently reading.
	  quiz    back to levels and the level name. Nothing else — during a run the bottom of
	          the screen belongs to the answer buttons.
-->
<script lang="ts">
	import type { ShellRoute } from './route';
	import { APP_NAME } from './route';

	let { route }: { route: ShellRoute } = $props();

	/** The hairline only appears once there is content underneath it to separate. */
	let scrolled = $state(false);

	$effect(() => {
		const sync = () => (scrolled = window.scrollY > 2);
		sync();
		window.addEventListener('scroll', sync, { passive: true });
		return () => window.removeEventListener('scroll', sync);
	});
</script>

<header class="bar" class:scrolled>
	<div class="inner" class:home={route.mode === 'home'}>
		{#if route.mode === 'home'}
			<span class="mark" aria-hidden="true">汉</span>
			<span class="wordmark">{APP_NAME}</span>
		{:else}
			<span class="slot start">
				{#if route.back}
					<a class="icon" href={route.back} aria-label="Back to levels">
						<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
							<path
								d="M15 5 8 12l7 7"
								fill="none"
								stroke="currentColor"
								stroke-width="2.1"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
					</a>
				{/if}
			</span>

			<span class="slot mid">
				{#if route.heading}<span class="heading">{route.heading}</span>{/if}
			</span>

			<span class="slot end">
				{#if route.mode === 'browse' && route.level !== null}
					<a class="action" href="/quiz/{route.level}">Practise</a>
				{/if}
			</span>
		{/if}
	</div>
</header>

<style>
	.bar {
		position: sticky;
		top: 0;
		z-index: 40;
		padding-top: var(--app-safe-top);
		border-block-end: 1px solid transparent;
		/* Translucent, so content passing underneath reads as motion rather than a hard cut. */
		background-color: color-mix(in srgb, var(--color-page) 82%, transparent);
		backdrop-filter: saturate(1.6) blur(14px);
		-webkit-backdrop-filter: saturate(1.6) blur(14px);
		transition: border-color 160ms var(--ease-out-soft);
	}

	@supports not (backdrop-filter: blur(1px)) {
		.bar {
			background-color: var(--color-page);
		}
	}

	.bar.scrolled {
		border-block-end-color: var(--color-line);
	}

	.inner {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: 0.25rem;
		block-size: var(--app-header-h);
		/*
		 * Full bleed on purpose. Every route sets its own measure — the level screen alone
		 * runs 34rem on a phone and 60rem on a desktop — so a shell bar pinned to one of
		 * them would be misaligned on the others. Window chrome sits at the window edge.
		 *
		 * Pulled 0.75rem tighter than the gutter so the 44px hit areas overhang it and the
		 * glyphs inside them land exactly on the text column.
		 */
		padding-inline-start: max(calc(var(--spacing-gutter) - 0.75rem), var(--app-safe-left));
		padding-inline-end: max(calc(var(--spacing-gutter) - 0.75rem), var(--app-safe-right));
	}

	.inner.home {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding-inline-start: max(var(--spacing-gutter), var(--app-safe-left));
		padding-inline-end: max(var(--spacing-gutter), var(--app-safe-right));
	}

	@media (min-width: 64rem) {
		.inner {
			padding-inline-start: max(1.25rem, var(--app-safe-left));
			padding-inline-end: max(1.25rem, var(--app-safe-right));
		}

		.inner.home {
			padding-inline-start: max(2rem, var(--app-safe-left));
			padding-inline-end: max(2rem, var(--app-safe-right));
		}
	}

	.slot {
		display: flex;
		align-items: center;
		min-inline-size: 0;
	}
	.start {
		justify-self: start;
	}
	.mid {
		justify-self: center;
	}
	.end {
		justify-self: end;
	}

	.icon {
		display: grid;
		place-items: center;
		inline-size: var(--spacing-tap);
		block-size: var(--spacing-tap);
		border-radius: var(--radius-pill);
		color: var(--color-ink);
		text-decoration: none;
		transition: background-color 120ms var(--ease-out-soft);
	}

	.icon svg {
		inline-size: 1.375rem;
		block-size: 1.375rem;
	}

	.icon:active {
		background-color: var(--color-surface-sunken);
	}

	.heading {
		display: block;
		overflow: hidden;
		font-size: var(--text-lg);
		font-weight: 600;
		letter-spacing: -0.012em;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.action {
		display: inline-flex;
		align-items: center;
		min-block-size: var(--spacing-tap);
		padding-inline: 0.75rem;
		border-radius: var(--radius-sm);
		color: var(--color-accent);
		font-size: var(--text-sm);
		font-weight: 600;
		white-space: nowrap;
		text-decoration: none;
		transition: background-color 120ms var(--ease-out-soft);
	}

	.action:active {
		background-color: var(--color-accent-soft);
	}

	@media (hover: hover) {
		.icon:hover {
			background-color: var(--color-surface-sunken);
		}

		.action:hover {
			background-color: var(--color-accent-soft);
		}
	}

	.mark {
		display: grid;
		place-items: center;
		flex: none;
		inline-size: 1.75rem;
		block-size: 1.75rem;
		border-radius: var(--radius-xs);
		background-color: var(--color-accent);
		color: var(--color-accent-ink);
		font-family: var(--font-hanzi);
		font-size: 1rem;
		line-height: 1;
	}

	.wordmark {
		font-size: var(--text-lg);
		font-weight: 600;
		letter-spacing: -0.02em;
	}
</style>
