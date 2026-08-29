<!--
	The results panel of last resort.

	`SessionSummary` is loaded as its own chunk (see `summary.ts`), and a chunk can fail to
	arrive: offline on the tenth answer, or a deploy that rotated the asset hashes under a tab
	that has been open all afternoon. A finished run must never dead-end on a blank screen, so
	this stands in — the same props, the same two exits, the score and the words to look at
	again. It is deliberately plain: it is the fallback, not the design.
-->
<script lang="ts">
	import type { Session } from '$lib/types';
	import { Hanzi, Pinyin } from '$lib/design';
	import { isCorrect } from '$lib/session';
	import { fullGloss, tally } from './quiz';

	interface Props {
		session: Session;
		onRestart: () => void;
		onHome: () => void;
	}

	let { session, onRestart, onHome }: Props = $props();

	const score = $derived(tally(session));
	const total = $derived(session.questions.length);
	const percent = $derived(total === 0 ? 0 : Math.round((score.correct / total) * 100));
	const missed = $derived(
		session.questions
			.filter((question, i) => !isCorrect(question, session.answers[i] ?? null))
			.map((question) => question.word)
	);
</script>

<section class="done">
	<p class="eyebrow">HSK {session.level} · session complete</p>

	<p class="score tabular">
		<b>{score.correct}</b><span class="of">/{total}</span>
	</p>
	<p class="rate tabular">{percent}% correct</p>

	{#if missed.length > 0}
		<h2 class="heading">Worth another look</h2>
		<ul class="list">
			{#each missed as word (word.id)}
				<li class="row">
					<Hanzi text={word.hanzi} size="sm" display />
					<span class="right">
						<Pinyin pinyin={word.pinyin} size="sm" />
						<span class="gloss">{fullGloss(word)}</span>
					</span>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="clean">Every answer right. Take the next ten.</p>
	{/if}

	<div class="actions">
		<button type="button" class="btn btn-primary btn-block" onclick={onRestart}>
			Practise ten more
		</button>
		<button type="button" class="btn btn-quiet btn-block" onclick={onHome}>Back to levels</button>
	</div>
</section>

<style>
	.done {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding-block: 2rem 1.5rem;
		text-align: center;
	}

	.score {
		margin: 0.75rem 0 0;
		font-size: var(--text-4xl);
		font-weight: 700;
		line-height: 1;
		letter-spacing: -0.03em;
	}

	.of {
		color: var(--color-ink-subtle);
		font-weight: 600;
	}

	.rate {
		margin: 0.375rem 0 0;
		font-size: var(--text-sm);
		color: var(--color-ink-muted);
	}

	.heading {
		margin: 2rem 0 0.75rem;
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-ink-subtle);
	}

	.clean {
		margin: 1.5rem 0 0;
		color: var(--color-ink-muted);
	}

	.list {
		inline-size: 100%;
		margin: 0;
		padding: 0;
		list-style: none;
		border-block-start: 1px solid var(--color-line);
	}

	.row {
		display: flex;
		align-items: baseline;
		gap: 0.875rem;
		padding-block: 0.75rem;
		border-block-end: 1px solid var(--color-line);
		text-align: start;
	}

	.right {
		display: flex;
		flex-direction: column;
		min-inline-size: 0;
	}

	.right :global(.pinyin) {
		color: var(--color-accent);
	}

	.gloss {
		font-size: var(--text-sm);
		color: var(--color-ink-muted);
		text-wrap: pretty;
	}

	.actions {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
		inline-size: 100%;
		margin-block-start: 2rem;
	}
</style>
