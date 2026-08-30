<!--
	The re-test, run on the summary screen itself.

	WHY IT DOES NOT NAVIGATE
	"Practise these 3 again" could have pushed a new route. It does not, for the same reason
	Pleco's entry is a sheet over the list: the three cards the learner is reading are the
	subject, and taking the screen away to ask about them costs the context that made the
	question worth answering. The drill takes over the results column, keeps the app bar and the
	page it came from, and hands the screen back with the misses folded in — "3 words to review"
	becomes "2 fixed · 1 to go" in place, which is the whole reward.

	IT IS THE QUIZ, NOT A SECOND QUIZ
	The choices are `ChoiceButton` — the quiz's own control, its own colours, its own disabled
	rules — and the card is built by `drill.ts` as a plain `Question`, so `choiceStatus` and
	`isCorrect` are the same functions the run used ten seconds ago. The keyboard map is
	`readKey`, so 1–4 answer and ↵ advances exactly as they did in the run. Nothing here is a
	parallel implementation of a quiz; it is the quiz pointed at three words.

	SIZE — THE RE-TEST IS NEVER SMALLER THAN THE TEST
	The character was `headwordSize()`, a fixed step, and it measured 82.5px on a 375×812 phone
	against 119.38px on the review card directly behind the drill and 152.27px on the quiz
	question that produced the miss. The one screen that actually re-tests the learner drew the
	subject at 54% of the question that beat them, and it did it to protect a 667px phone that
	a fixed step cannot tell apart from an 812px one — measured there, `scrollHeight` was 953
	against 812 with the continue button at y=743. The room existed; the step could not see it.

	So the size is measured, exactly the way `WordCard` measures it: `.subject` is a size
	container and the glyph is `min(100cqw / cols / fit, --drill-hero-max)`, with the ceiling on
	`svh` so the short phone the fixed step was protecting steps down on its own. 119.6px at
	812, 100px at 667, 86.7px at 568 — and `headwordSize()` stays underneath as the class on the
	element, so a browser without container queries still gets a sane step rather than nothing.

	HEIGHT IS FIXED BEFORE THE TAP
	The reveal is always in the box and merely `visibility: hidden` until the answer lands, so
	the stage is measured from the *answered* state on the very first frame and the four buttons
	never move under a thumb. Reserving a guessed height instead is what failed the run itself
	at 375×667: the taller answered state grew the page and pushed the continue button out of
	the frame.

	TONE COLOUR LIVES ON THE PINYIN, THE WAY IT DOES EVERYWHERE ELSE
	`<Hanzi>` is left in plain ink and `<Pinyin>` carries the tone, which is the design system's
	one answer to "where does tone colour go" — and it happens to be the reveal here anyway: the
	pinyin line only appears once the card is answered.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import type { Word } from '$lib/types';
	import { Hanzi, Pinyin } from '$lib/design';
	import { isCorrect } from '$lib/session';
	import { progress } from '$lib/progress';
	import ChoiceButton from '$lib/components/quiz/ChoiceButton.svelte';
	import { readKey } from '$lib/components/quiz/keys';
	import {
		choiceStatus,
		fullGloss,
		headwordSize,
		promptLabel,
		verdictAnnouncement
	} from '$lib/components/quiz/quiz';
	import type { DrillCard, DrillOutcome } from './drill';

	interface Props {
		/** The cards to run, in the order they are stacked on the screen behind this. */
		cards: readonly DrillCard[];
		/**
		 * Every card answered: word id to how it went AND what was chosen. The card behind this
		 * prints the pick, so a word missed a second time has to hand back the distractor that
		 * did it rather than leaving the one from the original run on screen.
		 */
		onfinish: (outcomes: Record<string, DrillOutcome>) => void;
		/**
		 * Left early, carrying whatever was answered before the exit — those answers are already
		 * in the learner's record, so dropping them here would make the screen disagree with it.
		 */
		oncancel: (outcomes: Record<string, DrillOutcome>) => void;
	}

	let { cards, onfinish, oncancel }: Props = $props();

	let at = $state(0);
	let picked = $state<Word | null>(null);
	/**
	 * One slot per card, filled in as they are answered — a hole is a card not yet reached.
	 * Deliberately not pre-sized from `cards`: every reader below already tests for a filled
	 * slot, and seeding from a prop would capture only its initial value.
	 */
	let hits = $state<(DrillOutcome | undefined)[]>([]);
	let panel = $state<HTMLElement | null>(null);

	const card = $derived(cards[at] ?? null);
	const answered = $derived(picked !== null);
	const right = $derived(card !== null && picked !== null && isCorrect(card, picked));
	const asksHanzi = $derived(card?.direction === 'meaning-to-hanzi');
	const last = $derived(at >= cards.length - 1);
	const spoken = $derived(card && picked ? verdictAnnouncement(card, picked) : '');

	function choose(choice: Word) {
		if (!card || picked !== null) return;
		picked = choice;
		const correct = isCorrect(card, choice);
		hits[at] = { right: correct, picked: choice };
		// Every word in a drill has been asked before — that is how it got here — so there is no
		// introduction to hold back from the record. This is a real answer to a real question,
		// and it counts exactly as much as the one that got it wrong two minutes ago.
		progress.recordAnswer(card.word.id, correct);
	}

	/** What was answered, in a plain object so the caller can spread it over what it already had. */
	function collect(): Record<string, DrillOutcome> {
		const outcomes: Record<string, DrillOutcome> = {};
		cards.forEach((one, i) => {
			const hit = hits[i];
			if (hit !== undefined) outcomes[one.word.id] = hit;
		});
		return outcomes;
	}

	function advance() {
		if (picked === null) return;
		if (last) {
			onfinish(collect());
			return;
		}
		at += 1;
		picked = null;
	}

	/** Leaving keeps what was answered: those answers are already in the learner's record. */
	function quit() {
		oncancel(collect());
	}

	/** Arrow keys walk the buttons in document order, the way they do in the run. */
	function moveFocus(delta: number) {
		const buttons = [...(panel?.querySelectorAll('.drill-answers button') ?? [])].filter(
			(node): node is HTMLButtonElement => node instanceof HTMLButtonElement && !node.disabled
		);
		if (buttons.length === 0) return;
		const index = buttons.findIndex((button) => button === document.activeElement);
		const next =
			index < 0
				? delta > 0
					? 0
					: buttons.length - 1
				: (index + delta + buttons.length) % buttons.length;
		buttons[next]?.focus();
	}

	function onKeydown(event: KeyboardEvent) {
		if (!card) return;
		const action = readKey(event, { answered, choices: card.choices.length });
		if (!action) return;
		if (action.type === 'choose') {
			const choice = card.choices[action.index];
			if (!choice) return;
			event.preventDefault();
			choose(choice);
			return;
		}
		event.preventDefault();
		if (action.type === 'move') moveFocus(action.delta);
		else advance();
	}

	// The drill replaces the results list in place, so without this the viewport stays wherever
	// the learner had scrolled the cards to and the first question opens off screen. Focusing a
	// `tabindex="-1"` panel is also what puts a screen reader at the top of the drill.
	$effect(() => {
		const node = panel;
		if (!node) return;
		void tick().then(() => node.focus());
	});
</script>

<svelte:window onkeydown={onKeydown} />

<section
	class="drill"
	bind:this={panel}
	tabindex="-1"
	aria-label="Drill: {cards.length} missed {cards.length === 1 ? 'word' : 'words'}"
>
	<p class="sr-only" role="status" aria-live="polite">{spoken}</p>

	<div class="bar">
		<p class="eyebrow">Drill · {at + 1} of {cards.length}</p>
		<button type="button" class="leave" onclick={quit}>
			<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
				<path
					d="m4.5 4.5 7 7m0-7-7 7"
					fill="none"
					stroke="currentColor"
					stroke-width="1.9"
					stroke-linecap="round"
				/>
			</svg>
			<span class="sr-only">Stop the drill and go back to the results</span>
			<span aria-hidden="true">Stop</span>
		</button>
	</div>

	<!-- The run's own rail, three segments long. Same language, same colours, shorter. -->
	<div class="rail" aria-hidden="true">
		{#each cards as one, i (one.word.id)}
			<span class="seg" class:hit={hits[i]?.right === true} class:miss={hits[i]?.right === false}
			></span>
		{/each}
	</div>

	{#if card}
		<div class="stage">
			<p class="ask">{promptLabel(card.direction)}</p>

			<!-- `--cols` is the divisor the size below reads: the glyph count, floored at two so a
			     single character is never blown up to the full width of the card. -->
			<div class="subject" style:--cols={Math.max(2, [...card.word.hanzi].length)}>
				{#if asksHanzi}
					<p class="gloss-ask">{fullGloss(card.word)}</p>
				{:else}
					<p class="face">
						<Hanzi word={card.word} size={headwordSize(card.word.hanzi)} display class="hz" />
					</p>
				{/if}
			</div>

			<!-- In the box from the first frame, hidden until it is earned: that is what makes the
			     stage the same height before and after the tap. -->
			<div class="reveal" class:shown={answered} aria-hidden={!answered}>
				<p class="verdict" class:right class:miss={answered && !right}>
					{answered && right ? 'Correct' : 'Not quite'}
				</p>
				{#if asksHanzi}
					<p class="answer"><Hanzi word={card.word} size="lg" display /></p>
				{/if}
				<p class="sound"><Pinyin word={card.word} size="md" /></p>
				{#if !asksHanzi}
					<p class="meaning">{fullGloss(card.word)}</p>
				{/if}
			</div>
		</div>

		<div class="drill-answers">
			{#each card.choices as choice, i (choice.id)}
				<ChoiceButton
					word={choice}
					direction={card.direction}
					index={i}
					status={choiceStatus(card, choice, picked)}
					onpick={() => choose(choice)}
				/>
			{/each}
		</div>
	{/if}

	<!-- Reserved, so the card is one height whether or not the continue button is in it. -->
	<div class="go">
		{#if answered}
			<button type="button" class="btn btn-primary btn-block" onclick={advance}>
				{last ? 'Back to results' : 'Next word'}
				<kbd class="kbd" aria-hidden="true">↵</kbd>
			</button>
		{/if}
	</div>
</section>

<style>
	.drill {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
		margin-block-start: 1.25rem;
		padding: 0.75rem 0.875rem 0.875rem;
		border: 1px solid var(--color-line);
		border-radius: var(--radius-card);
		background-color: var(--color-surface);
		box-shadow: var(--shadow-card);
		outline: none;
		scroll-margin-block-start: calc(var(--app-safe-top) + var(--app-header-h) + 0.75rem);
	}

	@media (prefers-reduced-motion: no-preference) {
		.drill {
			animation: var(--animate-rise-in);
		}
	}

	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	/* Quiet on purpose: leaving is always available and never the thing being offered. */
	.leave {
		display: inline-flex;
		align-items: center;
		gap: 0.3125rem;
		min-block-size: var(--spacing-tap);
		padding-inline: 0.5rem;
		margin-inline-end: -0.5rem;
		color: var(--color-ink-subtle);
		font-size: var(--text-xs);
		font-weight: 650;
		letter-spacing: 0.02em;
	}

	.leave svg {
		inline-size: 0.8125rem;
		block-size: 0.8125rem;
	}

	@media (hover: hover) {
		.leave:hover {
			color: var(--color-ink);
		}
	}

	.rail {
		display: flex;
		gap: 0.1875rem;
	}

	.seg {
		flex: 1 1 0;
		block-size: 0.375rem;
		border-radius: var(--radius-pill);
		background-color: var(--color-surface-sunken);
		transition: background-color 200ms var(--ease-out-soft);
	}

	.seg.hit {
		background-color: var(--color-correct);
	}

	.seg.miss {
		background-color: var(--color-wrong);
	}

	@media (prefers-contrast: more) {
		.seg {
			outline: 1px solid var(--color-line-strong);
			outline-offset: -1px;
		}
	}

	/*
	 * Three rows: the instruction, the word, the reveal. The middle row is the only elastic one,
	 * so the box is sized by its tallest state once and never by what is currently in it.
	 */
	.stage {
		display: grid;
		grid-template-rows: auto 1fr auto;
		justify-items: center;
		gap: 0.25rem;
		text-align: center;
		padding-block-start: 0.125rem;
	}

	.ask {
		margin: 0;
		font-size: var(--text-2xs);
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-ink-subtle);
	}

	/*
	 * The subject, sized against the column it actually has rather than against a step.
	 *
	 * `--drill-hero-max` is the same shape as `WordCard`'s `--card-hero-max`
	 * (`clamp(6rem, 11.5svh + 26px, 8.5rem)`), pulled 6px down at the reference phone so the
	 * drill lands a hair under the card it is quoting rather than over it, and steeper on `svh`
	 * so the 667px phone this box used to be sized for gives back the height it cannot spare:
	 * 119.6px at 812, 100px at 667, 86.7px at 568. `--drill-fit` is `WordCard`'s divisor — how
	 * much wider than the glyphs the row has to be — so the two agree on what "as big as this
	 * column allows" means.
	 */
	.subject {
		--drill-hero-max: clamp(4.5rem, calc(13.5svh + 10px), 7.5rem);
		--drill-fit: 1.07;
		--cols: 2;

		/* `.stage` is `justify-items: center`, so without this the box is shrink-to-fit — and a
		   size container whose width depends on its own contents reports 0cqw, which is exactly
		   what it did: the glyph computed to font-size 0. It fills the column and centres its
		   own contents instead. */
		inline-size: 100%;
		container-type: inline-size;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-block-size: 4.5rem;
		padding-block: 0.125rem;
	}

	.face {
		margin: 0;
	}

	/* Beats the step class from `headwordSize()` on specificity: the step is the fallback, the
	   measured size is the rule. */
	.face :global(.hz) {
		font-size: min(calc(100cqw / var(--cols) / var(--drill-fit)), var(--drill-hero-max));
		line-height: 1.04;
	}

	/* The English side of a production card, at the weight the answer deserves. */
	.gloss-ask {
		margin: 0;
		max-inline-size: 15ch;
		font-size: var(--text-2xl);
		font-weight: 620;
		line-height: 1.2;
		text-wrap: balance;
	}

	/*
	 * Deliberately the smallest block that can confirm an answer: verdict, pinyin, gloss. It is
	 * reserved on every frame, so every line in it is 40-odd px of white space in the card
	 * before the tap — and the full-size teaching card for this exact word is already stacked
	 * on the page behind the drill. Part of speech lives there; repeating it here buys nothing
	 * and costs a row of emptiness on every question.
	 */
	.reveal {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.0625rem;
		padding-block-start: 0.375rem;
	}

	.reveal:not(.shown) {
		visibility: hidden;
	}

	.verdict {
		margin: 0;
		font-size: var(--text-2xs);
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-wrong);
	}

	.verdict.right {
		color: var(--color-correct);
	}

	.answer,
	.sound {
		margin: 0.125rem 0 0;
	}

	.meaning {
		margin: 0.125rem 0 0;
		max-inline-size: 24ch;
		font-size: var(--text-sm);
		font-weight: 600;
		line-height: 1.35;
		text-wrap: balance;
	}

	.drill-answers {
		display: grid;
		gap: 0.4375rem;
	}

	.go {
		min-block-size: var(--spacing-tap);
	}

	.kbd {
		display: none;
	}

	@media (min-width: 48rem) {
		.kbd {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			min-inline-size: 1.25rem;
			padding-inline: 0.25rem;
			border-radius: var(--radius-xs);
			background-color: rgb(255 255 255 / 0.16);
			font-family: var(--font-mono);
			font-size: var(--text-2xs);
		}
	}
</style>
