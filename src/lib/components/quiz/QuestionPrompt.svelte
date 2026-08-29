<!--
	The top half of the quiz card: what is being asked, and — once answered — the whole word.

	PINYIN BEFORE THE ANSWER: HIDDEN, BUT ONE TAP AWAY.
	Printing `ài` under 爱 answers most of a four-choice recognition question on its own; the
	sound is the word for anyone who has heard it, so the card would stop testing the character.
	Hiding it outright is the other failure — a learner who knows the sound and not the shape is
	left with nothing to think with, and guesses. So the pinyin is behind a deliberate tap. It
	costs nothing (this is practice, not an exam) and the learner decides whether they needed it,
	which is itself the useful signal. It reads the same way in both directions: in
	meaning-to-hanzi the hint turns "which of these four" into "which of these four sounds like
	this", which is exactly the scaffold a production question should offer and not give away.

	AFTER THE ANSWER both directions converge on the same block — hanzi, pinyin, every gloss,
	part of speech — so the thing to memorise is always in the same place, at the same size.

	Pinyin is set in the accent, not in Pleco's tone colours: `Word.pinyin` is syllable-spaced
	for only ~13% of the list (`àihào`, not `ài hào`), and the design system refuses to colour a
	syllable it cannot split with certainty. Tone colouring would therefore fire on monosyllables
	and go quiet on everything else, which reads as a bug rather than as information.
-->
<script lang="ts">
	import type { Question, Word } from '$lib/types';
	import { Hanzi, Pinyin } from '$lib/design';
	import { fullGloss, headwordSize, posLabel, primaryGloss, promptLabel } from './quiz';
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
	const size = $derived(headwordSize(word.hanzi));
	const extraGlosses = $derived(word.meanings.slice(1).join(' · '));
	const pos = $derived(posLabel(word));
</script>

<div class="prompt">
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

		<div class="reveal">
			<Hanzi text={word.hanzi} {size} display class="block" />
			<p class="sound"><Pinyin pinyin={word.pinyin} size="xl" /></p>
			<p class="meaning">{fullGloss(word)}</p>
			{#if pos}<p class="pos">{pos}</p>{/if}
		</div>
	{:else}
		<p class="ask-label eyebrow">{promptLabel(question.direction)}</p>

		{#if question.direction === 'hanzi-to-meaning'}
			<Hanzi text={word.hanzi} {size} display class="block" />
		{:else}
			<p class="ask">{primaryGloss(word)}</p>
			{#if extraGlosses}<p class="also">{extraGlosses}</p>{/if}
		{/if}

		<div class="hint-row">
			{#if hinted}
				<p class="sound sound-hint"><Pinyin pinyin={word.pinyin} size="lg" /></p>
			{:else}
				<button type="button" class="hint" onclick={onhint}>
					<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
						<path
							d="M1.8 10S4.9 4.7 10 4.7 18.2 10 18.2 10 15.1 15.3 10 15.3 1.8 10 1.8 10Z"
							fill="none"
							stroke="currentColor"
							stroke-width="1.6"
						/>
						<circle cx="10" cy="10" r="2.4" fill="none" stroke="currentColor" stroke-width="1.6" />
					</svg>
					Show pinyin
				</button>
			{/if}
		</div>
	{/if}
</div>

<style>
	.prompt {
		display: flex;
		flex-direction: column;
		align-items: center;
		inline-size: 100%;
		text-align: center;
	}

	.ask-label {
		margin: 0 0 0.75rem;
	}

	/* The English side of a production question. Sized to read as the headword it is, but on
	   the Latin scale — hanzi and Latin never share a scale in this system. */
	.ask {
		max-inline-size: 15ch;
		margin: 0;
		font-size: var(--text-3xl);
		font-weight: 650;
		line-height: 1.12;
		letter-spacing: -0.02em;
		text-wrap: balance;
	}

	.also {
		margin: 0.5rem 0 0;
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
		margin-block-start: 0.625rem;
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
		margin: 0 0 0.75rem;
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

	/* The answer arrives as one block rather than four independent fades. */
	.reveal {
		display: flex;
		flex-direction: column;
		align-items: center;
		inline-size: 100%;
		animation: var(--animate-rise-in);
	}

	.sound {
		margin: 0.375rem 0 0;
		color: var(--color-accent);
	}

	.sound-hint {
		margin: 0;
	}

	.meaning {
		max-inline-size: 30ch;
		margin: 0.5rem 0 0;
		font-size: var(--text-lg);
		font-weight: 550;
		line-height: 1.35;
		color: var(--color-ink);
		text-wrap: pretty;
	}

	.pos {
		margin: 0.3125rem 0 0;
		font-size: var(--text-xs);
		color: var(--color-ink-subtle);
	}
</style>
