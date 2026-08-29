<!--
	The top half of the quiz card: what is being asked, and — once answered — the whole word.

	THREE SLOTS, ALWAYS THE SAME THREE. label / hero / under. Both states fill the same three
	rows of the same grid, and the grid is exactly as tall as the stage handed it (`auto`,
	`minmax(0, 1fr)`, `auto`), so a reveal that needs more room takes it from the character
	rather than from the page. That is the whole reason the run fits a 667px phone: before this,
	the answered state was simply taller than the question, and the difference pushed the
	"Next word" button off the bottom of an iPhone SE.

	THE CHARACTER IS SIZED BY THE SPACE, NOT BY A GUESS. `.hero` is a size container, so the
	headword can be set as `min(30vw, 100cqw / characters, 92cqh - reserve, 8.5rem)` — the
	smallest of "a sane share of the width", "n characters fit the column", "it fits the height
	the layout actually left" and "no bigger than this anywhere". A fixed clamp cannot know the
	third one, which is why 多 used to be 82.5px on a screen that had 60px for it. It also makes
	the ramp monotonic for free: three characters can never come out larger than two.

	PINYIN BEFORE THE ANSWER: HIDDEN, BUT ONE TAP AWAY.
	Printing `ài` under 爱 answers most of a four-choice recognition question on its own; the
	sound is the word for anyone who has heard it, so the card would stop testing the character.
	Hiding it outright is the other failure — a learner who knows the sound and not the shape is
	left with nothing to think with, and guesses. So the pinyin is behind a deliberate tap. It
	costs nothing (this is practice, not an exam) and the learner decides whether they needed it,
	which is itself the useful signal.

	TONE COLOUR GOES ON THE PINYIN LINE AND NOWHERE ELSE ON THIS SCREEN. `Word.syllables` carries
	a build-verified tone per character, so `<Pinyin>` paints Pleco's mapping per syllable from
	real data rather than from a guess — which is what finally takes the app's error red off this
	line. `duō` is crimson because it is tone 1, and the word beside it is green or blue or
	purple because those are tones 2, 3 and 4; before, every pinyin on the screen was
	`var(--color-accent)`, the exact red of a missed answer, carrying no information at all.

	The hero character stays ink on purpose. `<Hanzi>` can paint per character and Pleco does,
	but Pleco's headword is ~32px; ours is up to 112px, and a 112px character in flat purple
	stops being a character a learner copies and becomes a poster. Tone is one line below it, at
	a size where colour reads as a fact rather than as a mood. The quiet "you chose" chip is ink
	for the same reason it always was — it is an annotation, and it owns its own surface.

	AFTER THE ANSWER both directions converge on the same block — hanzi, pinyin, every gloss,
	part of speech — so the thing to memorise is always in the same place, at the same size.
-->
<script lang="ts">
	import type { Question, Word } from '$lib/types';
	import { Hanzi, Pinyin } from '$lib/design';
	import { askLines, fullGloss, meaningSize, posLabel, primaryGloss, promptLabel } from './quiz';
	import { isCorrect } from '$lib/session';

	interface Props {
		question: Question;
		/** The choice the learner made, or null while the question is still open. */
		picked: Word | null;
		/** Whether the learner asked for the pinyin before answering. */
		hinted: boolean;
		onhint: () => void;
	}

	let { question, picked, hinted, onhint }: Props = $props();

	const word = $derived(question.word);
	const answered = $derived(picked !== null);
	const right = $derived(answered && isCorrect(question, picked));
	/** One character is one syllable, so this is also the width divisor for the hero. */
	const chars = $derived([...word.hanzi].length);
	const extraGlosses = $derived(word.meanings.slice(1).join(' · '));
	const pos = $derived(posLabel(word));
	const ask = $derived(primaryGloss(word));
	const meaning = $derived(fullGloss(word));
	/** The hanzi is the face of the card in one direction and the answer in the other. */
	const showHanzi = $derived(answered || question.direction === 'hanzi-to-meaning');
	/** The remaining glosses, which belong to the question only when the question is English. */
	const showAlso = $derived(
		!answered && question.direction === 'meaning-to-hanzi' && extraGlosses !== ''
	);
</script>

<div class="prompt" style:--chars={chars} style:--ask-lines={askLines(ask)}>
	<div class="label">
		{#if answered}
			<p class="verdict" class:right class:miss={!right}>
				{#if right}
					<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
						<path
							d="m3.5 8.5 3 3 6-7"
							fill="none"
							stroke="currentColor"
							stroke-width="2.4"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>Correct
				{:else}
					<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
						<path
							d="m4.5 4.5 7 7m0-7-7 7"
							fill="none"
							stroke="currentColor"
							stroke-width="2.4"
							stroke-linecap="round"
						/>
					</svg>Not quite
				{/if}
			</p>
		{:else}
			<p class="eyebrow">{promptLabel(question.direction)}</p>
		{/if}
	</div>

	<div
		class="hero"
		class:asking={!answered}
		class:with-also={showAlso}
		class:swap={answered && question.direction === 'meaning-to-hanzi'}
	>
		{#if showHanzi}
			<Hanzi {word} size="hero" tones={false} class="face" />
		{:else}
			<p class="ask">{ask}</p>
		{/if}

		{#if !answered}
			{#if showAlso}<p class="also">{extraGlosses}</p>{/if}
			<div class="hint-row">
				{#if hinted}
					<p class="sound sound-hint"><Pinyin {word} size="lg" /></p>
				{:else}
					<button type="button" class="hint" onclick={onhint}>
						<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
							<path
								d="M1.8 10S4.9 4.7 10 4.7 18.2 10 18.2 10 15.1 15.3 10 15.3 1.8 10 1.8 10Z"
								fill="none"
								stroke="currentColor"
								stroke-width="1.6"
							/>
							<circle
								cx="10"
								cy="10"
								r="2.4"
								fill="none"
								stroke="currentColor"
								stroke-width="1.6"
							/>
						</svg>
						Show pinyin
					</button>
				{/if}
			</div>
		{/if}
	</div>

	<div class="under" class:reveal={answered}>
		{#if answered}
			<p class="sound"><Pinyin {word} size="xl" /></p>
			<p class="meaning" data-size={meaningSize(meaning)}>{meaning}</p>
			{#if pos}<p class="pos">{pos}</p>{/if}
			{#if picked && !right}
				<p class="chose">
					<span class="chose-label">You chose</span>
					{#if question.direction === 'hanzi-to-meaning'}
						<Hanzi word={picked} size="xs" tones={false} class="chose-hanzi" />
						<Pinyin word={picked} size="xs" tones={false} />
					{:else}
						<Pinyin word={picked} size="xs" tones={false} />
						<span class="chose-gloss">{primaryGloss(picked)}</span>
					{/if}
				</p>
			{/if}
		{/if}
	</div>
</div>

<style>
	/*
	 * The stage hands this a definite height and it never asks for more: `1fr` in the middle
	 * absorbs every difference between the two states, so the answer can be longer than the
	 * question without moving a single control below it.
	 */
	.prompt {
		display: grid;
		grid-template-rows: auto minmax(0, 1fr) auto;
		/* `stretch`, not `center`: `.hero` is size-contained, so a non-stretched hero measures
		   itself as empty and the row it is supposed to fill collapses to zero. */
		align-items: stretch;
		inline-size: 100%;
		block-size: 100%;
		min-block-size: 0;
		text-align: center;
	}

	.label {
		display: grid;
		place-items: center;
		padding-block-end: 0.625rem;
	}

	/*
	 * A size container, which is the whole trick: `cqh` below is the height this row actually
	 * got, so the character can be told to fit it. Size containment is also what keeps the row
	 * from being sized *by* the character — no circularity.
	 *
	 * The question's own furniture — the extra glosses and the pinyin hint — lives IN here,
	 * under the character, rather than in the bottom slot. In the bottom slot it was pinned to
	 * the floor of the prompt, which on a tall phone left 180px of nothing between `north` and
	 * `Show pinyin`. Centred as one block, the same slack becomes ordinary margin above and
	 * below a question. What it costs is `--hero-reserve`: the character has to fit the row
	 * minus whatever is stacked beneath it, or it would grow straight through the hint.
	 */
	.hero {
		--hero-reserve: 0px;

		container-type: size;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		min-block-size: 0;
	}

	.hero.asking {
		--hero-reserve: 3.25rem;
	}

	.hero.asking.with-also {
		--hero-reserve: 5rem;
	}

	.hero.swap {
		animation: var(--animate-rise-in);
	}

	/* :global because the span is `<Hanzi>`'s, and it has to beat a Tailwind size utility. */
	.hero :global(.face) {
		/* The `max()` is a floor, not a preference: on a landscape phone the row can be shorter
		   than the reserve, and a negative `font-size` invalidates the declaration outright
		   rather than clamping to something small. */
		font-size: max(
			2.5rem,
			min(30vw, calc(100cqw / var(--chars) / 1.08), calc(92cqh - var(--hero-reserve)), 8.5rem)
		);
		line-height: 1.02;
	}

	/* The English side of a production question — the headword of the screen in that
	   direction, so it is allowed the top of the Latin scale. Hanzi and Latin never share a
	   scale in this system, which is why this tops out at 44px where the character reaches
	   112px: they are the same *presence*, not the same number. */
	.ask {
		margin: 0;
		font-size: max(
			var(--text-lg),
			min(var(--text-4xl), calc((94cqh - var(--hero-reserve)) / var(--ask-lines) / 1.16))
		);
		font-weight: 650;
		line-height: 1.12;
		letter-spacing: -0.024em;
		text-wrap: balance;
	}

	.under {
		display: grid;
		justify-items: center;
	}

	.under.reveal {
		padding-block-start: 0.375rem;
		animation: var(--animate-rise-in);
	}

	.also {
		margin: 0;
		max-inline-size: 26ch;
		font-size: var(--text-sm);
		color: var(--color-ink-subtle);
		text-wrap: pretty;
	}

	/* Fixed height so revealing the hint never moves the answer buttons under the thumb. */
	.hint-row {
		display: grid;
		place-items: center;
		min-block-size: var(--spacing-tap);
	}

	.hint {
		display: inline-flex;
		align-items: center;
		gap: 0.4375rem;
		min-block-size: var(--spacing-tap);
		padding-inline: 0.875rem;
		border: 0;
		border-radius: var(--radius-pill);
		background-color: transparent;
		color: var(--color-ink-subtle);
		font-size: var(--text-sm);
		font-weight: 600;
		transition: background-color 140ms var(--ease-out-soft);
	}

	.hint svg {
		inline-size: 1.0625rem;
		block-size: 1.0625rem;
	}

	.hint:active {
		background-color: var(--color-surface-sunken);
	}

	@media (hover: hover) {
		.hint:hover {
			background-color: var(--color-surface-sunken);
			color: var(--color-ink-muted);
		}
	}

	.verdict {
		display: inline-flex;
		align-items: center;
		gap: 0.3125rem;
		margin: 0;
		font-size: var(--text-2xs);
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.verdict svg {
		inline-size: 0.9375rem;
		block-size: 0.9375rem;
	}

	.verdict.right {
		color: var(--color-correct);
	}

	.verdict.miss {
		color: var(--color-wrong);
	}

	.sound {
		margin: 0.25rem 0 0;
	}

	.sound-hint {
		margin: 0;
	}

	.meaning {
		max-inline-size: 30ch;
		margin: 0.4375rem 0 0;
		font-size: var(--text-lg);
		font-weight: 550;
		line-height: 1.35;
		color: var(--color-ink);
		text-wrap: pretty;
	}

	.meaning[data-size='base'] {
		font-size: var(--text-base);
		max-inline-size: 34ch;
	}

	.meaning[data-size='sm'] {
		font-size: var(--text-sm);
		max-inline-size: 40ch;
	}

	.pos {
		margin: 0.25rem 0 0;
		font-size: var(--text-xs);
		color: var(--color-ink-subtle);
	}

	/*
	 * What the learner actually picked — 进 `jìn`, "to go forward". It used to live on the
	 * button they tapped, which meant every button had to reserve a line for it; here the
	 * stage absorbs it and the four buttons stay one height. It is also the right place to
	 * read it: the eye is already up here reading NOT QUITE and the real answer.
	 */
	.chose {
		/*
		 * Only the half the button did not already say: the tapped button shows the gloss in
		 * one direction and the character in the other, so repeating it here would cost a
		 * second line — and a second line here comes straight out of the character above.
		 */
		display: inline-flex;
		align-items: baseline;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.125rem 0.375rem;
		max-inline-size: 36ch;
		margin: 0.625rem 0 0;
		padding: 0.1875rem 0.6875rem;
		border-radius: var(--radius-pill);
		background-color: var(--color-surface-sunken);
		/* 2xs, so `YOU CHOSE diàn shì jī television set` still lands on one line at 375px: a
		   second line here is 22px taken straight off the character above. */
		font-size: var(--text-2xs);
		letter-spacing: 0;
		color: var(--color-ink-muted);
	}

	.chose-label {
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--color-ink-subtle);
	}

	.chose-gloss {
		color: var(--color-ink-muted);
	}

	.chose :global(.chose-hanzi) {
		line-height: 1;
	}

	/*
	 * A landscape phone has ~319px under the bar and the answer stack alone wants 240 of it.
	 * There is no arrangement of this screen that fits, so it stops pretending: the prompt
	 * sizes to its contents, the run grows past the viewport and the page scrolls. The size
	 * container has to be switched off with it — `cqh` against no container resolves against
	 * the viewport, which would ask for a 345px character.
	 */
	@media (max-height: 34rem) {
		.prompt {
			block-size: auto;
			grid-template-rows: auto auto auto;
			padding-block: 0.75rem;
		}

		.hero {
			container-type: normal;
		}

		.hero :global(.face) {
			font-size: min(18vw, 4rem);
		}

		.ask {
			font-size: var(--text-2xl);
		}
	}
</style>
