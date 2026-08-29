<!--
	The end of a run — the screen where a learner decides whether to do another one.

	WHAT GETS THE BIG TYPE
	Not the score. A percentage is a verdict on the learner; the misses are the thing they can
	actually do something about, so the missed words are set as full study cards — hanzi at the
	size the design system reserves for a headword, tone-marked pinyin on its own weight beside
	it, every gloss, the part of speech, and the word they picked instead. The score itself is
	one quiet line and a ten-segment rail: the same rail they watched fill during the run, now
	complete. Reading the summary is meant to be worth as much as answering one more question.

	WHY THE MARK IS A CHINESE WORD
	Finishing has to feel like it counted without turning into a sticker. So the reward is more
	vocabulary: 满分 / 不错 / 继续 / 加油, set the way every other word in this app is set —
	hanzi, pinyin, gloss. It is the one flourish on the screen and it teaches something. The
	pinyin for the three that are on the official list is theirs verbatim (búcuò, jìxù,
	jiā yóu); 满分 is not an HSK 1–5 word but every learner who just scored one should meet it.

	WHY THE PERCENTAGE IS ABSENT AND THE LEVEL ARC IS NOT
	One session's accuracy is noise — ten questions, weighted toward what you keep missing, so
	a bad run often means the scheduler is working. What does mean something is the arc: how
	much of the level you have now met, and how much of it is mastered. That line moves by a
	word or two per session, which is exactly the honest amount, and it is the only figure here
	that includes the run that just finished.

	Pinyin is set in the accent rather than Pleco's tone colours, for the reason QuestionPrompt
	documents: `Word.pinyin` is syllable-spaced for only a fraction of the list, so tone colour
	would fire on monosyllables and go quiet everywhere else.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { Session, Word } from '$lib/types';
	import { Hanzi, Pinyin } from '$lib/design';
	import { isCorrect } from '$lib/session';
	import { progress } from '$lib/progress';
	import { fullGloss, posLabel, primaryGloss } from '$lib/components/quiz/quiz';

	interface Props {
		/** The finished run. Every figure on this screen is derived from it. */
		session: Session;
		/** Build another session at the same level. */
		onRestart: () => void;
		/** Leave for level select. */
		onHome: () => void;
	}

	let { session, onRestart, onHome }: Props = $props();

	/** The mark at the top of the screen: a real word, sized to the run that earned it. */
	interface Mark {
		hanzi: string;
		pinyin: string;
		gloss: string;
	}

	function markFor(correct: number, total: number): Mark {
		if (total > 0 && correct === total) {
			return { hanzi: '满分', pinyin: 'mǎnfēn', gloss: 'full marks' };
		}
		const share = total > 0 ? correct / total : 0;
		if (share >= 0.8) return { hanzi: '不错', pinyin: 'búcuò', gloss: 'not bad' };
		if (share >= 0.5) return { hanzi: '继续', pinyin: 'jìxù', gloss: 'keep going' };
		return { hanzi: '加油', pinyin: 'jiā yóu', gloss: 'keep at it' };
	}

	/**
	 * Review cards run one step below the quiz prompt: 48px for the one- to three-character
	 * words, 36px for the four-character ones, so a card is never taller than the phrase it
	 * holds and 不好意思 never wraps away from its pinyin.
	 */
	function reviewSize(hanzi: string): 'md' | 'lg' {
		return [...hanzi].length <= 3 ? 'lg' : 'md';
	}

	const results = $derived(
		session.questions.map((question, index) => {
			const picked: Word | null = session.answers[index] ?? null;
			return {
				word: question.word,
				direction: question.direction,
				picked,
				right: isCorrect(question, picked)
			};
		})
	);

	const total = $derived(results.length);
	const missed = $derived(results.filter((result) => !result.right));
	const solved = $derived(results.filter((result) => result.right));
	const skipped = $derived(missed.filter((result) => result.picked === null).length);
	const mark = $derived(markFor(solved.length, total));

	// Progress lives in localStorage, so the server has an empty store and the client a full
	// one. The arc is held back until after hydration — the block keeps its height either way,
	// so the numbers arriving never move the review list underneath them.
	// `onMount` rather than `$effect`: this is a "the client is now running" latch, not a value
	// derived from anything, and an effect that only ever assigns trips
	// `svelte/prefer-writable-derived`.
	let hydrated = $state(false);

	onMount(() => {
		hydrated = true;
	});

	const arc = $derived(hydrated ? progress.levelSummary(session.level) : null);
	const arcPct = $derived(arc && arc.total > 0 ? Math.min(100, (arc.seen / arc.total) * 100) : 0);

	const headline = $derived(
		total === 0
			? `HSK ${session.level} session ended`
			: `HSK ${session.level} session complete — ${solved.length} of ${total} correct, ` +
					`${missed.length} to review`
	);

	// Both figure lines are built here rather than out of `{#if}` blocks in the markup: an
	// interpolated separator inside a block loses the space in front of it, and `63 of 500
	// practised· 5 mastered` is exactly the kind of thing nobody sees until it ships.
	const scoreRest = $derived(
		`of ${total} correct` + (skipped > 0 ? ` · ${skipped} unanswered` : '')
	);
	const arcRest = $derived(
		arc
			? `of ${arc.total.toLocaleString('en')} HSK ${session.level} words practised` +
					(arc.mastered > 0 ? ` · ${arc.mastered.toLocaleString('en')} mastered` : '')
			: ''
	);

	// The run is over and the last answer button has just been removed from the DOM, so focus
	// has fallen to <body>. Move it here, which is what puts a screen reader at the top of the
	// results instead of nowhere. If anything else already holds focus — the route managing it
	// itself — leave it alone.
	let panel: HTMLElement | null = $state(null);

	$effect(() => {
		const node = panel;
		if (!node) return;
		const active = document.activeElement;
		if (active && active !== document.body) return;
		node.focus();
	});
</script>

<div class="summary" bind:this={panel} tabindex="-1">
	<h1 class="sr-only">{headline}</h1>

	{#if total === 0}
		<p class="empty">This session had no questions in it. Pick a level and start another one.</p>
	{:else}
		<header class="crest">
			<p class="eyebrow">Session complete</p>
			<p class="mark"><Hanzi text={mark.hanzi} size="md" display /></p>
			<p class="mark-sound"><Pinyin pinyin={mark.pinyin} size="lg" /></p>
			<p class="mark-gloss">{mark.gloss}</p>
		</header>

		<section class="score" aria-label="Score">
			<p class="score-line tabular">
				<strong>{solved.length}</strong>
				{scoreRest}
			</p>
			<div class="rail" aria-hidden="true">
				{#each results as result, i (i)}
					<span
						class="seg"
						class:right={result.right}
						class:wrong={!result.right && result.picked !== null}
					></span>
				{/each}
			</div>
		</section>

		<!-- The one figure that outlives the session. Absent until there is one: a learner whose
		     storage rejected every write should not be told they have practised nothing. -->
		{#if arc && arc.seen > 0}
			<div class="arc">
				<p class="arc-line tabular">
					<strong>{arc.seen.toLocaleString('en')}</strong>
					{arcRest}
				</p>
				<div class="meter arc-meter" aria-hidden="true">
					{#if arcPct > 0}<span style:width="{arcPct}%"></span>{/if}
				</div>
			</div>
		{/if}

		<section aria-labelledby="summary-review">
			{#if missed.length > 0}
				<h2 id="summary-review" class="section-title">
					{missed.length}
					{missed.length === 1 ? 'word' : 'words'} to review
				</h2>

				<ul class="cards">
					{#each missed as result, i (i)}
						{@const pos = posLabel(result.word)}
						<li class="card word" style:animation-delay="{Math.min(i, 5) * 45}ms">
							<div class="face">
								<Hanzi text={result.word.hanzi} size={reviewSize(result.word.hanzi)} display />
								<span class="sound"><Pinyin pinyin={result.word.pinyin} size="lg" /></span>
							</div>
							<p class="gloss">{fullGloss(result.word)}</p>
							{#if pos}<p class="pos">{pos}</p>{/if}

							<p class="picked">
								<svg class="cross" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
									<path
										d="m4.5 4.5 7 7m0-7-7 7"
										fill="none"
										stroke="currentColor"
										stroke-width="2.2"
										stroke-linecap="round"
									/>
								</svg>
								{#if result.picked === null}
									<span class="tag">No answer</span>
								{:else}
									<span class="tag">You picked</span>
									{#if result.direction === 'meaning-to-hanzi'}
										<Hanzi text={result.picked.hanzi} size="xs" />
										<Pinyin pinyin={result.picked.pinyin} size="sm" /> · {primaryGloss(
											result.picked
										)}
									{:else}
										{primaryGloss(result.picked)} ·
										<Hanzi text={result.picked.hanzi} size="xs" />
										<Pinyin pinyin={result.picked.pinyin} size="sm" />
									{/if}
								{/if}
							</p>
						</li>
					{/each}
				</ul>
			{:else}
				<h2 id="summary-review" class="section-title">Nothing to review</h2>
				<p class="clean">
					All {total} right. The set is below — a clean run is the best moment to read them once more.
				</p>
			{/if}
		</section>

		{#if solved.length > 0}
			<details class="solved" open={missed.length === 0}>
				<summary>
					<svg class="chev" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
						<path
							d="m4 6 4 4 4-4"
							fill="none"
							stroke="currentColor"
							stroke-width="1.8"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
					{solved.length} answered correctly
				</summary>
				<ul class="solved-list">
					{#each solved as result, i (i)}
						<li class="solved-row">
							<span class="solved-face">
								<Hanzi text={result.word.hanzi} size="sm" />
								<span class="sound-quiet"><Pinyin pinyin={result.word.pinyin} size="sm" /></span>
							</span>
							<span class="solved-gloss">{primaryGloss(result.word)}</span>
						</li>
					{/each}
				</ul>
			</details>
		{/if}
	{/if}

	<div class="actions">
		<button type="button" class="btn btn-primary flex-1" onclick={onRestart}>
			{total > 0 ? `Practise ${total} more` : 'Practise again'}
		</button>
		<button type="button" class="btn btn-quiet shrink-0" onclick={onHome}>
			Levels<span class="sr-only"> — back to level select</span>
		</button>
	</div>
</div>

<style>
	/*
	 * The screen owns its column. The shell deliberately sets no measure and no gutter, and a
	 * results list that runs to the edge of a phone reads as a crash rather than a design.
	 */
	.summary {
		inline-size: 100%;
		max-inline-size: var(--container-app);
		margin-inline: auto;
		padding-inline: var(--spacing-gutter);
		padding-block-start: 1.5rem;
		/* Focusing this panel scrolls it into view, and the app bar is sticky over the top of
		   the scroll port — without this the eyebrow lands underneath it. */
		scroll-margin-block-start: calc(var(--app-safe-top) + var(--app-header-h) + 0.75rem);
		outline: none;
	}

	.empty {
		margin: 2rem 0;
		text-align: center;
		color: var(--color-ink-muted);
	}

	.crest {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
	}

	.mark {
		margin: 0.5rem 0 0;
	}

	.mark-sound {
		margin: 0.25rem 0 0;
		color: var(--color-accent);
	}

	.mark-gloss {
		margin: 0.3125rem 0 0;
		font-size: var(--text-sm);
		color: var(--color-ink-muted);
	}

	.score {
		margin-block-start: 1.25rem;
	}

	.score-line {
		margin: 0 0 0.5rem;
		text-align: center;
		font-size: var(--text-sm);
		color: var(--color-ink-muted);
	}

	.score-line strong {
		font-size: var(--text-lg);
		font-weight: 700;
		color: var(--color-ink);
	}

	/* The rail from the quiz screen, finished. Same language, no counters. */
	.rail {
		display: flex;
		gap: 0.1875rem;
	}

	.seg {
		flex: 1 1 0;
		block-size: 0.375rem;
		border-radius: var(--radius-pill);
		background-color: var(--color-surface-sunken);
	}

	.seg.right {
		background-color: var(--color-correct);
	}

	.seg.wrong {
		background-color: var(--color-wrong);
	}

	@media (prefers-contrast: more) {
		.seg {
			outline: 1px solid var(--color-line-strong);
			outline-offset: -1px;
		}
	}

	/* Holds its height before hydration, so the review list never shifts under a thumb. */
	.arc {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 0.5rem;
		margin-block-start: 1.125rem;
		padding-block: 0.875rem;
		border-block: 1px solid var(--color-line);
	}

	.arc-line {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--color-ink-muted);
	}

	.arc-line strong {
		font-weight: 700;
		color: var(--color-ink);
	}

	.arc-meter {
		block-size: 0.25rem;
	}

	.section-title {
		margin: 1.75rem 0 0.875rem;
		font-size: var(--text-xl);
	}

	.clean {
		margin: 0;
		max-inline-size: 40ch;
		font-size: var(--text-sm);
		color: var(--color-ink-muted);
	}

	.cards {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	/* A missed word is a study card, not a list row: it carries everything the quiz revealed. */
	.word {
		padding: 1rem 1.125rem 0.875rem;
	}

	@media (prefers-reduced-motion: no-preference) {
		.word {
			animation: var(--animate-rise-in);
		}
	}

	.face {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 0.125rem 0.625rem;
	}

	.sound {
		color: var(--color-accent);
	}

	.gloss {
		margin: 0.5rem 0 0;
		font-size: var(--text-base);
		font-weight: 550;
		line-height: 1.4;
		text-wrap: pretty;
	}

	.pos {
		margin: 0.1875rem 0 0;
		font-size: var(--text-xs);
		color: var(--color-ink-subtle);
	}

	/* What they chose instead. Hairline-separated, because it is context and not the record. */
	.picked {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 0.25rem;
		margin: 0.75rem 0 0;
		padding-block-start: 0.6875rem;
		border-block-start: 1px solid var(--color-line);
		font-size: var(--text-xs);
		color: var(--color-ink-muted);
	}

	.tag {
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		font-size: var(--text-2xs);
		color: var(--color-ink-subtle);
	}

	/* The miss glyph, so the card never relies on colour — or on position — to say what it is. */
	.cross {
		inline-size: 0.75rem;
		block-size: 0.75rem;
		align-self: center;
		color: var(--color-wrong);
	}

	.solved {
		margin-block-start: 1.5rem;
		border-block-start: 1px solid var(--color-line);
	}

	.solved summary {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-block-size: var(--spacing-tap);
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--color-ink-muted);
		list-style: none;
	}

	.solved summary::-webkit-details-marker {
		display: none;
	}

	.chev {
		inline-size: 1rem;
		block-size: 1rem;
		transition: rotate 180ms var(--ease-out-soft);
	}

	.solved[open] .chev {
		rotate: 180deg;
	}

	.solved-list {
		margin: 0 0 0.5rem;
		padding: 0;
		list-style: none;
	}

	.solved-row {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.125rem 0.875rem;
		padding-block: 0.5625rem;
		border-block-start: 1px solid var(--color-line);
	}

	.solved-face {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.sound-quiet {
		color: var(--color-ink-subtle);
	}

	.solved-gloss {
		/* Keeps the gloss on the right edge even when it wraps onto its own line, which a long
		   one does at 375px. `justify-content` alone only aligns a row that has two items in it. */
		margin-inline-start: auto;
		font-size: var(--text-sm);
		color: var(--color-ink-muted);
		text-align: end;
	}

	/*
	 * "Go again" is the decision this screen exists to put in front of someone, so it stays on
	 * the glass while the review list scrolls under it, and lands at the end of the page when
	 * the list is short. `Levels` is the compact half of the same row the level cards use —
	 * the app bar already carries a back control, so this one is a courtesy, not the only way out.
	 */
	.actions {
		position: sticky;
		inset-block-end: 0;
		z-index: 10;
		display: flex;
		gap: 0.625rem;
		margin-block-start: 1.5rem;
		padding-block: 0.875rem;
		padding-block-end: max(0.875rem, var(--app-safe-bottom));
		background-color: var(--color-page);
	}

	.actions::before {
		content: '';
		position: absolute;
		inset-inline: 0;
		inset-block-end: 100%;
		block-size: 1.5rem;
		background: linear-gradient(to top, var(--color-page), transparent);
		pointer-events: none;
	}
</style>
