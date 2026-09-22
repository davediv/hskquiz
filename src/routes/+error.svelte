<!--
	The error frame. A real screen, not the framework fallback.

	The layout renders only `<div id="main">` and leaves the landmark to each screen, so this
	file has to bring its own `<main>` — without it a 404 has no main at all. It also has to
	bring its own gutter, an eyebrow and an h1 in the product's voice, and a way back into the
	app: the five HSK chips plus a "Back to levels" pill, the same shape as the old in-route
	"Not a level" panels this replaced.
-->
<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { ERROR_TITLE, NOT_FOUND_TITLE } from '$lib/components/shell/route';
	import { LEVELS, type Level } from '$lib/types';

	function asLevel(segment: string | undefined): Level | null {
		if (segment === undefined) return null;
		const n = Number(segment);
		return LEVELS.find((level) => level === n) ?? null;
	}

	const miss = $derived.by(() => {
		const segments = page.url.pathname.split('/').filter(Boolean);
		const raw = segments[1];
		const listed = segments[0] === 'browse' || segments[0] === 'quiz';
		const kind = segments[0] === 'quiz' ? 'quiz' : 'browse';
		if (listed && raw !== undefined && asLevel(raw) === null) {
			return {
				eyebrow: 'Not a level',
				heading: 'hskquiz covers HSK 1 to 5',
				body: `There is no level “${raw}”. The five official HSK 3.0 word lists are below.`,
				kind
			} as const;
		}
		if (page.status === 404) {
			return {
				eyebrow: 'Page not found',
				heading: 'hskquiz covers HSK 1 to 5',
				body: 'That address is not a page in this app. The five official HSK 3.0 word lists are below.',
				kind
			} as const;
		}
		return {
			eyebrow: 'Something went wrong',
			heading: 'hskquiz could not show this page',
			body: 'The five official HSK 3.0 word lists are below if you want to keep going.',
			kind
		} as const;
	});

	const title = $derived(page.status === 404 ? NOT_FOUND_TITLE : ERROR_TITLE);

	function hrefFor(choice: Level) {
		return miss.kind === 'quiz'
			? resolve('/quiz/[level]', { level: String(choice) })
			: resolve('/browse/[level]', { level: String(choice) });
	}
</script>

<svelte:head>
	<title>{title}</title>
</svelte:head>

<main class="miss">
	<section class="panel">
		<p class="eyebrow">{miss.eyebrow}</p>
		<h1 class="panel-title">{miss.heading}</h1>
		<p class="panel-body">{miss.body}</p>
		<ul class="jump">
			{#each LEVELS as choice (choice)}
				<li>
					<a class="jump-link" href={hrefFor(choice)}>HSK {choice}</a>
				</li>
			{/each}
		</ul>
		<a class="btn btn-quiet btn-block" href={resolve('/')}>Back to levels</a>
	</section>
</main>

<style>
	.miss {
		inline-size: 100%;
		max-inline-size: var(--container-app);
		margin-inline: auto;
		padding-inline: max(var(--spacing-gutter), var(--app-safe-left, 0px))
			max(var(--spacing-gutter), var(--app-safe-right, 0px));
	}

	.panel {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		padding-block: 3rem 2rem;
	}

	.panel-title {
		margin: 0.5rem 0 0;
		font-size: var(--text-2xl);
	}

	.panel-body {
		margin: 0.625rem 0 1.5rem;
		color: var(--color-ink-muted);
	}

	.jump {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 0 0 1.5rem;
		padding: 0;
		list-style: none;
	}

	.jump-link {
		display: inline-flex;
		align-items: center;
		min-block-size: var(--spacing-tap);
		padding-inline: 1rem;
		border: 1px solid var(--color-line-strong);
		border-radius: var(--radius-pill);
		color: var(--color-ink);
		font-size: var(--text-sm);
		font-weight: 600;
		text-decoration: none;
	}

	@media (hover: hover) {
		.jump-link:hover {
			background-color: var(--color-surface-sunken);
		}
	}
</style>
