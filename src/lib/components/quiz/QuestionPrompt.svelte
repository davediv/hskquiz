<!--
	The top half of the quiz card: what is being asked, and — once answered — the whole word.

	ONE CHARACTER, ONE SIZE, ONE PLACE. The question and the reveal are the same three rows of
	the same grid — label / hero / under — and all three rows are the same height in both
	states, so the headword neither resizes nor moves when the answer lands. Loop 2 got the
	first half of that (nothing below the stage moves) and paid for it out of the character:
	`.under` was empty until the tap and then filled with pinyin, gloss, part of speech and the
	"you chose" chip, and every pixel of that came out of the `1fr` middle row the hanzi is
	sized against. 北京 was 112.5px while it was a question and 72.1px the moment it became an
	answer — smallest exactly when the learner had got it wrong and most needed to look at it.

	SO `.under` IS ALWAYS THERE. Every row of the reveal is rendered in both states; the ones
	that would give the answer away are `visibility: hidden` until the tap. That is not a
	reserved *guess* at the reveal's height — it is the reveal, laid out, so the middle row
	resolves to the identical number before and after the answer for any word, any gloss
	length, any outcome. Two rows needed pinning to stay honest about it: the sound slot is a
	fixed box because it holds a button before the tap and a line of pinyin after, and the tail
	is a fixed box because it holds the part of speech on a hit and the taller "you chose" chip
	on a miss.

	Measured in the running app, before the tap and after it, on both outcomes: 375x667
	94.69px -> 94.69px, 360x640 87.37 -> 87.37, 320x568 63.72 -> 63.72, 375x812 119.38 ->
	119.38, 430x932 133.18 -> 133.18.

	THE HINT LIVES IN THE PINYIN'S OWN SLOT. "Show pinyin" is the first row of `.under`, which
	is exactly where the revealed pinyin appears — so tapping it swaps a button for the sound
	in place, and the tap that answers the question changes nothing about that line's position.
	It also takes the hint's slot out of the hero row, which is where the character got most of
	the size back that the reserve cost it — 320x568 went from a 40px answered headword to
	64px, and 375x667 from 72px to 95px, while reserving the whole reveal.

	THE CHARACTER IS SIZED BY THE SPACE, NOT BY A GUESS. `.hero` is a size container, so the
	headword is `min(100cqw / columns / 1.28, 92cqh, --hero-max)` — "n characters take 78% of
	the column", "it fits the height the layout actually left", "no bigger than this anywhere".
	The `30vw` term that used to lead that list is gone: it, and not the space, decided every
	one- and two-character word, which is why 您 and 早上 came out at the same 112.5px on a
	phone with room for more and kept it on a phone with room for much less. What is left is
	one width rule, one height rule, and a ceiling that is itself a `clamp` on the viewport, so
	a 6.7" phone gets 136px where a 4" phone gets 96px instead of both getting the number a
	375px screen wanted.

	PINYIN BEFORE THE ANSWER: HIDDEN, BUT ONE TAP AWAY. Printing `ài` under 爱 answers most of
	a four-choice recognition question on its own; the sound is the word for anyone who has
	heard it. Hiding it outright is the other failure — a learner who knows the sound and not
	the shape is left with nothing to think with. So it is behind a deliberate tap, and the
	learner deciding they needed it is itself the useful signal.

	PINYIN NEVER OUT-MEASURES ITS OWN CHARACTER. A syllable runs up to six pinyin glyphs
	against one em of hanzi — `chuáng` is 3.5x the width of 床 — so the sound line stays under
	its own word only while it is below ~0.29 of the headword. The headword shrinks with the
	height it is given and the sound has to come down with it; otherwise `jīn tiān` is wider
	than 今天, as it was at 320x568 and 360x640. Checked in the running app against the five
	densest words the list ships (床 装 双 闯 撞) with their real glosses, at five viewports:
	60 of 60 pass, tightest margin 5.4%.

	TONE COLOUR GOES ON THE PINYIN LINE AND NOWHERE ELSE ON THIS SCREEN. `Word.syllables`
	carries a build-verified tone per character, so `<Pinyin>` paints Pleco's mapping per
	syllable from real data rather than from a guess. The hero character stays ink on purpose:
	`<Hanzi>` can paint per character and Pleco does, but Pleco's headword is ~32px and ours is
	up to 120px, and a 120px character in flat purple stops being a character a learner copies.

	THE TAIL IS ONE LINE, AND A MISS OWNS IT. Part of speech is the third line of a reveal you
	got right; what you actually picked is the third line of one you got wrong. They never
	stack, because a second line there is 28px taken straight off the character above, and on a
	miss the confusion is the more useful of the two.
-->
<script lang="ts">
	import type { Question, Word } from '$lib/types';
	import { Hanzi, Pinyin } from '$lib/design';
	import { askLines, fullGloss, meaningSize, posLabel, primaryGloss, promptLabel } from './quiz';
	import { isCorrect, isIntroduction } from '$lib/session';

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
	/**
	 * A teach card: the word's first appearance, shown whole before anything is asked. It is
	 * the reveal this file already draws, drawn from the start — same three rows, same sizes,
	 * nothing hidden — so the card a learner meets a word on and the card they are corrected
	 * on are the same object.
	 */
	const teaching = $derived(isIntroduction(question));
	/** Everything the reveal paints is painted on a teach card too. */
	const shown = $derived(answered || teaching);
	/** One character is one syllable. */
	const chars = $derived([...word.hanzi].length);
	/**
	 * The width divisor for the hero, floored at two. A one-character word left to divide the
	 * column by one asks for a 305px glyph on a 430px phone; floored, 大 is set at exactly the
	 * size 大人 would be, which is what makes the headword band one band rather than a size
	 * that lurches with the word.
	 */
	const cols = $derived(Math.max(chars, 2));
	const extraGlosses = $derived(word.meanings.slice(1).join(' · '));
	const pos = $derived(posLabel(word));
	const ask = $derived(primaryGloss(word));
	const meaning = $derived(fullGloss(word));
	/** The hanzi is the face of the card in one direction and the answer in the other. */
	const showHanzi = $derived(shown || question.direction === 'hanzi-to-meaning');
	/** The sound is on screen because it was asked for, or because there is nothing to hide. */
	const showSound = $derived(shown || hinted);
	/**
	 * Whether "Show pinyin" may be offered at all.
	 *
	 * Only on a recognition card. In the production direction the prompt is the English and the
	 * answer is the character, so the pinyin *is* the answer — printing it on request hands the
	 * learner the one thing the card is testing. That was low blast-radius while production was
	 * 0.2% of questions asked; it is a quarter of them now.
	 */
	const canHint = $derived(!teaching && question.direction === 'hanzi-to-meaning');
	/** The remaining glosses, which belong to the question only when the question is English. */
	const showAlso = $derived(
		!shown && question.direction === 'meaning-to-hanzi' && extraGlosses !== ''
	);
	const showChose = $derived(answered && picked !== null && !right);
</script>

<div class="prompt" class:teach={teaching} style:--cols={cols} style:--ask-lines={askLines(ask)}>
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
			<p class="eyebrow">{promptLabel(teaching ? 'introduce' : question.direction)}</p>
		{/if}
	</div>

	<div class="hero" class:swap={answered && question.direction === 'meaning-to-hanzi'}>
		{#if showHanzi}
			<Hanzi {word} size="hero" tones={false} class="face" />
		{:else}
			<p class="ask">{ask}</p>
		{/if}
	</div>

	<!--
		Every row below is present in both states. What changes is what is painted, never how
		much room it takes — see the note at the top of the file.
	-->
	<div class="under">
		<div class="sound-slot">
			{#if showSound}
				<p class="sound" class:arrive={answered && !hinted}><Pinyin {word} size="xl" /></p>
			{:else if canHint}
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

		<!--
			The gloss slot is measured by the revealed meaning in both states, so a question
			cannot be a different height from its own answer. A production question's extra
			glosses are laid over it rather than in it, for the same reason.
		-->
		<div class="gloss-slot">
			<p class="meaning" class:veiled={!shown} data-size={meaningSize(meaning)}>{meaning}</p>
			{#if showAlso}<p class="also">{extraGlosses}</p>{/if}
		</div>

		<div class="tail">
			{#if showChose && picked}
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
			{:else if shown && pos}
				<p class="pos">{pos}</p>
			{/if}
		</div>
	</div>
</div>

<style>
	/*
	 * The stage hands this a definite height and it never asks for more. All three rows are
	 * the same height before and after the tap — the top two because their content is the
	 * same shape, the bottom one because it *is* the reveal, drawn either way — so the `1fr`
	 * middle row resolves to one number and the character has one size.
	 */
	.prompt {
		/* Continuous, for the same reason `+page.svelte` clamps its rhythm: the middle row is
		   whatever these two leave behind, so a slot that steps 8px at a breakpoint steps the
		   headword with it. */
		--sound-slot: clamp(2rem, calc(2.46svh + 18px), 2.75rem);
		--tail-slot: clamp(1.625rem, calc(1.64svh + 16.7px), 2rem);
		--hero-max: clamp(6rem, calc(11.5svh + 26px), 8.5rem);
		--sound-size: var(--text-pinyin-xl);

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

	/*
	 * A teach card carries no answer buttons, so the stage hands the prompt the whole column
	 * and the `1fr` hero row stretches to fill it — the character floated in the middle with
	 * its own pinyin 400px below it, which reads as two things rather than one word.
	 *
	 * So in this mode the hero row is a band rather than a claim on everything left, and the
	 * three rows are centred in the stage as one object. The band is `--hero-max / 0.92`
	 * because the headword's height term is `92cqh`: any less and the cap stops being what
	 * decides the size, and the character on a teach card would be smaller than the same
	 * character on the question that follows it.
	 */
	.prompt.teach {
		grid-template-rows: auto minmax(0, calc(var(--hero-max) / 0.92)) auto;
		align-self: center;
		block-size: auto;
		max-block-size: 100%;
	}

	/*
	 * THE SOUND SCALE IS THE ONE THING THAT STILL STEPS, and it steps because the thing it is
	 * measured against is a word, not a viewport. A syllable is up to six pinyin glyphs wide
	 * against one em of hanzi, so `chuáng` under 床 runs 3.5x the width of its own character
	 * and only stays under it while the sound is below ~0.29 of the headword. The headword
	 * shrinks with the height it is given; the sound has to come down the ladder with it, or
	 * `jīn tiān` is wider than 今天 — which it was, at 320x568 and 360x640.
	 *
	 * Measured in the running app on the list's five densest words (床 装 双 闯 撞) with their
	 * real glosses, at five viewports, 60 of 60 clear: 28px above 44rem, 22px down to 40rem,
	 * 17px down to 37rem, 14px below it. Tightest margin 5.4%.
	 */
	@media (max-height: 44rem) {
		.prompt {
			--sound-size: var(--text-pinyin-lg);
		}
	}

	@media (max-height: 40rem) {
		.prompt {
			--sound-size: var(--text-pinyin-md);
		}
	}

	@media (max-height: 37rem) {
		.prompt {
			--sound-size: var(--text-pinyin-sm);
		}
	}

	/*
	 * Fixed, like every other row. PICK THE MEANING and ✕ NOT QUITE are the same type at the
	 * same size, but `.eyebrow` carries its own 1.4 leading and this one inherited the body's
	 * 1.55 — 1.66px of difference, which came out of the character below as surely as a whole
	 * line would have. Pinning the row means it cannot happen again for any reason.
	 */
	.label {
		display: grid;
		place-items: center;
		block-size: 1.625rem;
		padding-block-end: 0.625rem;
	}

	/*
	 * A size container, which is the whole trick: `cqh` below is the height this row actually
	 * got, so the character can be told to fit it. Size containment is also what keeps the row
	 * from being sized *by* the character — no circularity.
	 *
	 * Nothing else lives in here any more. The pinyin hint used to, and it charged the
	 * character a 52px reserve for the privilege; it is now the first row of `.under`, where
	 * it shares a slot with the pinyin it reveals.
	 */
	.hero {
		container-type: size;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-block-size: 0;
	}

	.hero.swap {
		animation: var(--animate-rise-in);
	}

	/* :global because the span is `<Hanzi>`'s, and it has to beat a Tailwind size utility. */
	.hero :global(.face) {
		/* The `max()` is a floor, not a preference: on a landscape phone the row can be shorter
		   than a readable character, and a negative `font-size` invalidates the declaration
		   outright rather than clamping to something small. */
		font-size: max(2.5rem, min(calc(100cqw / var(--cols) / 1.28), 92cqh, var(--hero-max)));
		line-height: 1.02;
	}

	/* The English side of a production question — the headword of the screen in that
	   direction, so it is allowed the top of the Latin scale. Hanzi and Latin never share a
	   scale in this system, which is why this tops out at 44px where the character reaches
	   120px: they are the same *presence*, not the same number. */
	.ask {
		margin: 0;
		font-size: max(var(--text-lg), min(var(--text-4xl), calc(94cqh / var(--ask-lines) / 1.16)));
		font-weight: 650;
		line-height: 1.12;
		letter-spacing: -0.024em;
		text-wrap: balance;
	}

	.under {
		display: grid;
		justify-items: center;
		padding-block-start: 0.375rem;
	}

	/*
	 * Fixed, because it holds a 36px button before the tap and a line of pinyin after it. The
	 * sound therefore lands on the exact baseline the hint occupied, and revealing it moves
	 * nothing — not the character above it and not the answers below.
	 */
	.sound-slot {
		display: grid;
		place-items: center;
		block-size: var(--sound-slot);
	}

	.gloss-slot {
		position: relative;
		display: grid;
		justify-items: center;
		inline-size: 100%;
		margin-block-start: 0.25rem;
	}

	/* The reveal's rows are laid out in both states; only the ink is withheld. */
	.veiled {
		visibility: hidden;
	}

	/*
	 * One line, and a miss owns it: part of speech when the answer was right, what the learner
	 * actually picked when it was not. Fixed height so the two never differ.
	 */
	.tail {
		display: grid;
		place-items: center;
		block-size: var(--tail-slot);
		margin-block-start: 0.25rem;
	}

	.also {
		position: absolute;
		inset: 0;
		display: grid;
		place-content: center;
		margin: 0;
		padding-inline: 1rem;
		font-size: var(--text-sm);
		color: var(--color-ink-subtle);
		text-wrap: pretty;
		overflow: hidden;
	}

	.hint {
		display: inline-flex;
		position: relative;
		align-items: center;
		gap: 0.4375rem;
		/* Beats the global 44px floor on `<button>`: the tap target is restored below as a
		   pseudo-element, so the control is 44px to a thumb and one sound slot to the layout. */
		min-block-size: 0;
		block-size: var(--sound-slot);
		padding-inline: 0.875rem;
		border: 0;
		border-radius: var(--radius-pill);
		background-color: transparent;
		color: var(--color-ink-subtle);
		font-size: var(--text-sm);
		font-weight: 600;
		transition: background-color 140ms var(--ease-out-soft);
	}

	/* The tap target the layout does not have to pay for: always exactly 44px tall, whatever
	   the slot around it is doing. */
	.hint::after {
		content: '';
		position: absolute;
		inset-block: calc((var(--sound-slot) - var(--spacing-tap)) / 2);
		inset-inline: -0.5rem;
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
		line-height: 1.4;
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
		margin: 0;
		line-height: 1;
	}

	.sound.arrive {
		animation: var(--animate-rise-in);
	}

	.sound :global(.pinyin) {
		font-size: var(--sound-size);
		line-height: 1.15;
	}

	.meaning {
		max-inline-size: 30ch;
		margin: 0;
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

	/*
	 * The gloss steps down on a short screen for a reason the gloss cannot see: every line it
	 * wraps to is a line taken out of the headword above it, and on a 568px phone that is the
	 * difference between a 61px character and a 46px one. A 48-character gloss set at 12px is
	 * one line on a 320px screen and two at 14px, so the smaller type buys back more than it
	 * costs. The measure opens to the full column at the same time — at this size the column
	 * IS the measure.
	 */
	@media (max-height: 40rem) {
		.meaning {
			font-size: var(--text-base);
		}

		.meaning[data-size='base'],
		.meaning[data-size='sm'] {
			font-size: var(--text-sm);
		}
	}

	@media (max-height: 37rem) {
		.meaning {
			font-size: var(--text-sm);
		}

		.meaning[data-size='base'],
		.meaning[data-size='sm'] {
			max-inline-size: 100%;
			font-size: var(--text-xs);
		}
	}

	.pos {
		margin: 0;
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
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		max-inline-size: 100%;
		block-size: 100%;
		margin: 0;
		padding-inline: 0.6875rem;
		border-radius: var(--radius-pill);
		background-color: var(--color-surface-sunken);
		/* 2xs, so `YOU CHOSE diàn shì jī television set` still lands on one line at 375px: a
		   second line here is 22px taken straight off the character above. */
		font-size: var(--text-2xs);
		letter-spacing: 0;
		color: var(--color-ink-muted);
		white-space: nowrap;
		overflow: hidden;
	}

	.chose-label {
		flex: none;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--color-ink-subtle);
	}

	.chose-gloss {
		min-inline-size: 0;
		overflow: hidden;
		color: var(--color-ink-muted);
		text-overflow: ellipsis;
	}

	.chose :global(.chose-hanzi) {
		flex: none;
		line-height: 1;
	}

	.chose :global(.pinyin) {
		flex: none;
	}

	/*
	 * A landscape phone has ~319px under the bar and the answer stack alone wants 240 of it.
	 * 35rem, not 34: at 545px of viewport the reveal still fits only by flooring the character
	 * at 2.5rem and letting it overflow, and 560 is under every portrait phone this ships to
	 * (the shortest is the 568px SE).
	 * There is no arrangement of this screen that fits, so it stops pretending: the prompt
	 * sizes to its contents, the run grows past the viewport and the page scrolls. The size
	 * container has to be switched off with it — `cqh` against no container resolves against
	 * the viewport, which would ask for a 345px character.
	 */
	@media (max-height: 35rem) {
		.prompt {
			block-size: auto;
			grid-template-rows: auto auto auto;
			padding-block: 0.75rem;
		}

		.hero {
			container-type: normal;
			min-block-size: 3.5rem;
		}

		.hero :global(.face) {
			font-size: min(18vw, 4rem);
		}

		.ask {
			font-size: var(--text-2xl);
		}
	}
</style>
