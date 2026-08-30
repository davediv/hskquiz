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

	THE PRODUCTION CARD IS THE ONE THE LEARNER LIVES IN, AND IT WAS THE EMPTIEST SCREEN HERE.
	`cardKindFor` serves a word two questions in three as PICK THE CHARACTER once it has one
	correct recognition behind it. That card printed `meanings[0]` at 44px in the hero and
	`meanings.slice(1)` at 14px grey 103px lower down — two halves of one phrase, `good` and
	`fine`, with a hole between them that the reveal then closed back up into the single line
	`good · fine`. Everything else in the 328px stage was blank: 73.6px of ink, 22%.

	Three changes, and none of them moves a pixel of anything else:

	  · ONE GLOSS, ONE BLOCK, IN THE HERO. `.ask` is `fullGloss` — the same string `.meaning`
	    prints — set one sense to a line and sized to the band it was given rather than pinned
	    at 44px. `foreign language` is 65px over two lines where it was 44px over one;
	    `than` / `to compare` is two stacked lines instead of one line and a distant footnote.
	  · THE CLUE, IN TWO ROWS OF THE RESERVE. `.under` is drawn in both states so the character
	    cannot resize on the tap, which on this card left 106 of 328px reserved and completely
	    blank. Two of those rows can hold something that is not the answer: the sound slot takes
	    the word's own sentence with the word cut out of it, and the gloss slot takes that
	    sentence's translation, laid over the box the revealed meaning is measured by. A tap
	    turns the card over — clue out, word in — and neither row changes height doing it.
	  · THE PART OF SPEECH IS PART OF THE QUESTION, so the tail prints it before the tap as well
	    as after. The distractor picker weights a shared part of speech above every other signal
	    in this direction, so the four buttons almost always agree about it and it gives nothing
	    away; `the verb meaning to love` is simply a better question than `to love`.

	Ink in the stage, measured over real sessions at three viewports: 375x812 22% -> 57-69%,
	375x667 26-33% -> 51-69%, 320x568 33-42% -> 58-72%. The character on the reveal is
	untouched at every one of them — 119.38 / 94.69 / 61.60 — because none of this is spent out
	of the hero row.

	THE SENTENCE'S OWN PINYIN IS THE ONE THING THE CLUE DOES NOT SHOW. It is syllable-aligned
	with the sentence, so the syllables under the blank could be blanked with it — but the line
	either spells out the answer's sound or acquires a second hole in it, and a card that has
	already cut the word out of its own sentence does not need to cut it out twice. The
	translation carries the meaning of the line instead, which is what a learner who cannot yet
	read it actually needs.

	THE TEACH CARD IS A DIFFERENT CARD, AND IT USED TO BE THE SAME ONE MINUS THE BUTTONS. On a
	fresh device every one of a run's ten cards is an introduction, so this is the screen a new
	learner meets the app on — ten times before they are ever asked anything. It was drawn as
	the reveal with the answers deleted: the same 119.38px character held under the same cap,
	the same four lines, and 358 of the stage's 620px (58%) left empty above and below them.

	It now spends that band on the three things a question card has no room for and a first
	meeting most needs, none of which is new data or new code:

	  · the SOUND. `summary/SpeakButton` and `summary/speech.ts` already ship on the summary
	    screen; the quiz was the one word surface in the app that could not speak, while
	    printing tone-coloured pinyin the learner had no way to hear. It is absolutely placed
	    at the end of the sound row so the pinyin stays centred under its own character and so
	    its arrival at hydration costs no layout;
	  · the TRADITIONAL form, bracketed the way Pleco brackets it beside the headword
	    (几乎〔幾-〕). 251 of 500 HSK 1 words and 545 of 969 HSK 3 words carry one;
	  · a SECOND BLOCK, which is the sentence where there is one and the character-by-character
	    breakdown where there is not. Both references spend this slot on context: Du Chinese's
	    card is a `word` section over a `sentence` section, Pleco's entry is the headword over
	    four examples.

	BOTH OF THOSE NOW REACH THE REVEAL TOO, which is the card a learner sees far more often
	than a first meeting: `<SpeakButton>` and the bracketed form were gated on `teaching` and
	appeared nowhere else, so the screen that printed tone-coloured pinyin was still the one
	word surface in the app that could not say it. Neither costs the reveal any height. The
	speaker is absolutely placed at the end of the sound row, as it always was; the traditional
	form is tucked into the same row at the other end rather than given a row of its own,
	because a row here would be reserved before the tap as well as after and would take 24px
	off the character on exactly the half of the list that has a traditional form — the "the
	word decides the headword's size" bug in a new hat. On a teach card, which has 620px of
	stage and no answer buttons, it keeps its own line under the sound.

	THE SECOND BLOCK IS OPTIONAL AND ITS ABSENCE COSTS NOTHING. Every shipped word now carries
	a sentence, but `Word.example` stays optional and nothing here reserves room for one: the
	block is a grid row that is simply not rendered, a card without a sentence shows the
	character breakdown in the same slot and centres its rows instead of anchoring them, and a
	production question without one falls back to the blank reserve it had before. There is no
	empty panel, no reserved gap and no jump.

	THE HINT LIVES IN THE PINYIN'S OWN SLOT. "Show pinyin" is the first row of `.under`, which
	is exactly where the revealed pinyin appears — so tapping it swaps a button for the sound
	in place, and the tap that answers the question changes nothing about that line's position.
	It also takes the hint's slot out of the hero row, which is where the character got most of
	the size back that the reserve cost it — 320x568 went from a 40px answered headword to
	64px, and 375x667 from 72px to 95px, while reserving the whole reveal.

	THE CHARACTER IS SIZED BY THE SPACE, NOT BY A GUESS. `.hero` is a size container, so the
	headword is `min(100cqw / columns / fit, 92cqh, --hero-max)` — "n characters take this much
	of the column", "it fits the height the layout actually left", "no bigger than this
	anywhere". The `30vw` term that used to lead that list is gone: it, and not the space,
	decided every one- and two-character word, which is why 您 and 早上 came out at the same
	112.5px on a phone with room for more and kept it on a phone with room for much less. What
	is left is one width rule, one height rule, and a ceiling that is itself a `clamp` on the
	viewport, so a 6.7" phone gets 136px where a 4" phone gets 96px instead of both getting the
	number a 375px screen wanted.

	The fit divisor is the one term the teach card moves: a question card holds its characters
	to 78% of the column because four answer buttons are competing for the same screen, and a
	teach card, which has none, takes 91%. With `.hanzi`'s 0.015em of tracking that is a 26px
	margin either side at 375px — measured, not assumed.

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

	EVERY LINE OF ENGLISH ON THIS SCREEN IS SIZED BY ITS MEASURED WIDTH. It used to step on `gloss.length`, which is not
	what decides a wrap, and a wrapped gloss is a line taken straight out of the character
	above: 口 was 72.3px against 正's 97.2px in the same run on the same phone because 口's
	shorter gloss happened to be the wider one. `glossEm` measures the line in ems from a table
	built with `canvas.measureText` in this app's own face, and the column is divided by it. See
	`quiz.ts`.

	TONE COLOUR GOES ON THE PINYIN LINE AND NOWHERE ELSE ON THIS SCREEN. `Word.syllables`
	carries a build-verified tone per character, so `<Pinyin>` paints Pleco's mapping per
	syllable from real data rather than from a guess. The hero character stays ink on purpose:
	`<Hanzi>` can paint per character and Pleco does, but Pleco's headword is ~32px and ours is
	up to 152px, and a 152px character in flat purple stops being a character a learner copies.
	The example sentence's pinyin is the one pinyin line in the app that is NOT painted: ten
	syllables in five hues would out-shout the four the headword gets, and the question the
	colour answers on this card is "what tone is *this word*".
-->
<script lang="ts">
	import type { Question, Syllable, Word } from '$lib/types';
	import { Hanzi, Pinyin } from '$lib/design';
	import SpeakButton from '$lib/components/summary/SpeakButton.svelte';
	import { fullGloss, glossEm, posLabel, primaryGloss, promptLabel, splitExample } from './quiz';
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
	 * nothing hidden — plus the sound, the traditional form and a second block of context that
	 * a card with four answer buttons under it has no room for.
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
	const pos = $derived(posLabel(word));
	/**
	 * ONE GLOSS, ONE BLOCK. This is the same string the reveal prints as `.meaning`, and on a
	 * production card it is the whole question — so it is set once, whole, in the hero. It used
	 * to be `primaryGloss` up here with `word.meanings.slice(1)` overlaid 103px lower down the
	 * column: "good" at 44px black and "fine" at 14px grey, two halves of one phrase separated
	 * by a hole, which the reveal then printed back as the single line "good · fine".
	 */
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
	const showChose = $derived(answered && picked !== null && !right);
	/**
	 * A production question: the English is the prompt and the character is the answer.
	 *
	 * `cardKindFor` serves this card two questions in three once a word has one correct
	 * recognition behind it, so it is the card the learner actually spends a run in — and it
	 * was the emptiest screen in the app, a single 44px gloss floating in a 328px stage.
	 */
	const production = $derived(!teaching && question.direction === 'meaning-to-hanzi');
	/**
	 * The traditional form, when the word actually has a different one. Shown wherever the
	 * whole word is — a teach card and both directions' reveals — never while it is still the
	 * answer to something. 251 of 500 HSK 1 words and 545 of 969 HSK 3 words carry one.
	 */
	const traditional = $derived(
		word.traditional && word.traditional !== word.hanzi ? word.traditional : null
	);
	/**
	 * How much of the sound row its two ends take, both of them together.
	 *
	 * The pinyin is centred under its own character, so it grows into BOTH ends at once and the
	 * binding end is whichever is wider — hence twice the larger, not the sum. Without it
	 * `Zhōnghuá Mínzú` set 230px wide in a 335px row runs 24px under the speaker and 43px under
	 * 〔中華民族〕; with it the sound comes down the scale instead, exactly the way it already
	 * comes down when the row gets shorter.
	 *
	 * A teach card reserves only the speaker: its traditional form has a row of its own, and
	 * its speaker keeps the word `Listen` because there is room for it there.
	 */
	const soundEnds = $derived(
		teaching ? 170 : 2 * Math.max(46, traditional ? [...traditional].length * 17 + 24 : 0)
	);

	/**
	 * The senses, one per line, for the English hero.
	 *
	 * Stacked rather than joined with ` · `, because the hero is sized to the band and a
	 * two-sense word therefore gets two lines of ~60px instead of one 60px line and 90px of
	 * nothing. The reveal still joins them — down there it is a restatement on one fixed line,
	 * not the subject of the screen.
	 */
	const senses = $derived(word.meanings.length > 0 ? word.meanings : [meaning]);
	/** The widest sense, in ems: the term that decides how large the stack can be set. */
	const senseEm = $derived(Math.max(...senses.map(glossEm)));

	/*
	 * ------------------------------------------------------------- the clue ----------------
	 *
	 * THE PRODUCTION CARD'S RESERVE NOW CARRIES THE QUESTION'S OWN CONTEXT. Every row of the
	 * reveal is laid out before the tap so the character cannot resize when the answer lands
	 * (see the top of this file) — which on a production card left 106 of the stage's 328px
	 * drawn, reserved and completely blank. Two of those rows can hold something that is not
	 * the answer, and a cloze of the word in its own sentence is exactly that:
	 *
	 *   · the sound slot holds the sentence with the word cut out of it. It is the slot the
	 *     pinyin lands in, and the pinyin is precisely what this direction withholds, so the
	 *     two never want it at the same moment;
	 *   · the gloss slot holds that sentence's translation, laid over the same box the revealed
	 *     meaning is measured by — so it costs no height at all.
	 *
	 * A tap turns the card over: clue out, word in. Nothing moves, and the blank is never
	 * filled in front of the learner — the answer replaces the question rather than annotating
	 * it, which is also why the sentence's own pinyin is not shown. That line would spell out
	 * the answer's sound under a blank the card is asking the learner to fill.
	 */

	/** The word's sentence. Every shipped word carries one; the type keeps it optional. */
	const example = $derived(word.example ?? null);
	/**
	 * The sentence split around the word itself — Pleco bolds 几乎 in its examples, and the
	 * same split is what lets a question blank it instead. See `splitExample`.
	 */
	const sentence = $derived(example ? splitExample(example.hanzi, word.hanzi) : null);
	/** The sentence as a clue: production only, and only while the question is still open. */
	const clue = $derived(production && !answered ? sentence : null);
	/**
	 * The word taken apart, one character to one syllable — the second block for the 3,038
	 * words that have no sentence yet. It answers the question a joined `lǎoshī` leaves open
	 * for a learner meeting 老师: which sound belongs to which character. A one-character word
	 * has nothing to take apart, so it gets no block at all rather than a restatement of its
	 * own headword.
	 */
	const cells = $derived.by(() => {
		if (!teaching || example || chars < 2) return null;
		const glyphs = [...word.hanzi];
		if (word.syllables.length !== glyphs.length) return null;
		return glyphs.map((glyph, i) => ({ glyph, syllable: word.syllables[i] as Syllable }));
	});
	/** A teach card with neither block: the rows centre in the stage instead of anchoring. */
	const bare = $derived(teaching && !sentence && !cells);
</script>

<div
	class="prompt"
	class:teach={teaching}
	class:bare
	style:--cols={cols}
	style:--gloss-em={glossEm(meaning)}
	style:--ask-rows={senses.length}
	style:--ask-em={senseEm}
	style:--py-em={glossEm(word.pinyin)}
	style:--sound-ends="{soundEnds}px"
>
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
			<p class="ask">
				{#each senses as sense, i (i)}<span class="sense">{sense}</span>{/each}
			</p>
		{/if}
	</div>

	<!--
		Every row below is present in both states. What changes is what is painted, never how
		much room it takes — see the note at the top of the file.
	-->
	<div class="under">
		<div class="sound-slot">
			{#if traditional && !teaching && shown}
				<!-- Tucked into the sound row's own box rather than given a row: a row here is
				     24px off the character, on the half of the list that has a traditional
				     form and not the other half. -->
				<p class="trad tucked">{@render tradMark('xs')}</p>
			{/if}
			{#if showSound}
				<p class="sound" class:arrive={answered && !hinted}><Pinyin {word} size="xl" /></p>
				<span class="say-slot" class:icon={!teaching}
					><SpeakButton text={word.hanzi} pinyin={word.pinyin} /></span
				>
			{:else if clue}
				<!-- The question's own context, in the slot the answer's sound will land in. -->
				<p class="clue-face" style:--sen-chars={clue.chars}>
					{#each clue.parts as part, i (i)}{#if part.hit}<span class="sr-only">(blank)</span><span
								class="blank"
								aria-hidden="true"
								><Hanzi text={part.text} size="sm" display class="clue-hanzi" /></span
							>{:else}<Hanzi text={part.text} size="sm" class="clue-hanzi" />{/if}{/each}
				</p>
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

		{#if traditional && teaching}
			<p class="trad">{@render tradMark('sm')}</p>
		{/if}

		<!--
			The gloss slot is measured by the revealed meaning in both states, so a question
			cannot be a different height from its own answer.
		-->
		<div class="gloss-slot">
			<p class="meaning" class:veiled={!shown}>{meaning}</p>
			{#if clue && example}
				<!-- Laid over the reserved box rather than placed in it, so what the sentence
				     says costs the character nothing — the same trick the extra glosses used,
				     spent on something that is not half of a phrase printed elsewhere. -->
				<p class="clue-en" style:--clue-em={glossEm(example.english)}>{example.english}</p>
			{/if}
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
			{:else if pos && (shown || production)}
				<!--
					Visible before the tap on a production card, because it is part of the
					question and not part of the answer: the distractor picker weights a shared
					part of speech above every other signal in this direction, so the four
					buttons almost always agree about it. "the verb meaning to love" is a better
					question than "to love", and it is one more line the reserve does not have
					to spend on nothing.
				-->
				<p class="pos">{pos}</p>
			{/if}
		</div>
	</div>

	{#if teaching && sentence && example}
		<section class="aside" aria-label="Example sentence" style:--sen-chars={sentence.chars}>
			<p class="aside-label" aria-hidden="true">Sentence</p>
			<p class="sen-face">
				{#each sentence.parts as part, i (i)}<Hanzi
						text={part.text}
						size="sm"
						display={part.hit}
						class={part.hit ? 'sen-hanzi hit' : 'sen-hanzi'}
					/>{/each}
			</p>
			<p class="sen-sound">
				<Pinyin pinyin={example.pinyin} size="sm" tones={false} sentence={example.hanzi} />
			</p>
			<p class="sen-english">{example.english}</p>
		</section>
	{:else if cells}
		<section class="aside" aria-label="Character by character">
			<p class="aside-label" aria-hidden="true">Character by character</p>
			<ul class="cells">
				{#each cells as cell, i (i)}
					<li class="cell">
						<Hanzi text={cell.glyph} size="sm" class="cell-face" />
						<Pinyin pinyin={cell.syllable.py} syllables={[cell.syllable]} size="sm" />
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>

<!-- Pleco brackets the traditional form beside the headword (几乎〔幾-〕). Same mark either
     side of the tap and on either card; only the step it is set at changes with the room. -->
{#snippet tradMark(size: 'xs' | 'sm')}
	<span class="sr-only">traditional form </span><span class="bracket" aria-hidden="true">〔</span
	><Hanzi text={traditional ?? ''} {size} /><span class="bracket" aria-hidden="true">〕</span>
{/snippet}

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
		/* The share of the column n characters may take: 100/1.28 = 78%. */
		--hero-fit: 1.28;
		/*
		 * The English hero's ceiling. Hanzi and Latin never share a scale here — a character
		 * reaches 152px and this tops out at 64 — but they do share the principle that the size
		 * comes from the room: continuous against the viewport, so the gloss on a 6.7" phone is
		 * not the number a 4" phone wanted. It is a ceiling and not the size; `.ask` below is
		 * sized by the band it was actually given.
		 */
		--ask-max: clamp(2.75rem, calc(12.3svh - 20px), 5rem);
		--sound-size: var(--text-pinyin-xl);
		--gloss-max: var(--text-lg);
		--gloss-min: var(--text-sm);

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
	 * THE TEACH CARD.
	 *
	 * Four rows, not three: label / hero / word / second block. It fills the stage rather than
	 * centring in it, and the second block is anchored to the bottom of its own `1fr` row, so
	 * the card has a top (the eyebrow), a subject (the character with its sound and meaning
	 * directly under it) and a base (the sentence, right above the thumb). What is left over
	 * lands in one gap between two labelled blocks instead of in two 180px voids above and
	 * below everything, which is what centring three rows in a 620px stage produced.
	 *
	 * The hero band is `--hero-max / 0.92` plus a little air, because the headword's height
	 * term is `92cqh`: any less and the cap stops being what decides the size. `--hero-max`
	 * itself is a third larger here than on a question card and the fit divisor is 1.1 rather
	 * than 1.28, which is where the character gets its size back — a teach card is not
	 * competing with four answer buttons for the column.
	 */
	.prompt.teach {
		/*
		 * Steeper against the viewport than the question card's ceiling, because this card is
		 * carrying a second block and the sentence panel has to fit under it: 152.9px at 812,
		 * 118.1 at 667, 94.3 at 568 — larger than the question card's 119.38 / 94.69 / 61.60 at
		 * every one of them, and small enough at the bottom that the panel never has to be
		 * squeezed out.
		 */
		--hero-max: clamp(5.5rem, calc(24svh - 42px), 10rem);
		--hero-fit: 1.1;
		/* Fixed at the tap size: this row holds a 44px button on a teach card at every height,
		   where the question card's version only ever holds a line of pinyin. */
		--sound-slot: var(--spacing-tap);
		--gloss-max: var(--text-xl);

		/*
		 * Five tracks: a top spacer, the three the question card has, and the second block on
		 * the floor. The two flexible tracks are where the slack goes, weighted 0.18 : 1 — the
		 * eyebrow stays near the top where it labels the card, and what is left opens up above
		 * the panel, which is a gap between two blocks rather than a hole in one. `fr` shares
		 * only what is left over and the last track's floor is its own content, so on a short
		 * phone the spacer collapses to zero and the panel is never squeezed.
		 */
		grid-template-rows:
			minmax(0, 0.18fr)
			auto
			minmax(0, calc(var(--hero-max) / 0.92 + 1.25rem))
			auto
			1fr;
	}

	.prompt.teach > .label {
		grid-row: 2;
	}

	.prompt.teach > .hero {
		grid-row: 3;
	}

	.prompt.teach > .under {
		grid-row: 4;
	}

	.prompt.teach > .aside {
		grid-row: 5;
	}

	/* No sentence and nothing to take apart — a one-character HSK 3–5 word. There is no second
	   block to anchor, so the three rows centre as one object, which is what they did before
	   any of this existed. */
	.prompt.teach.bare {
		/*
		 * Same five tracks — the rows are placed explicitly, so a three-track template here
		 * would leave `.hero` in an `auto` row, and `.hero` is size-contained: it measures
		 * itself as empty, the row collapses and the character drops to its 2.5rem floor.
		 * With nothing to anchor at the bottom the two flexible tracks are equal, which
		 * centres the word block in the stage.
		 */
		grid-template-rows:
			minmax(0, 1fr)
			auto
			minmax(0, calc(var(--hero-max) / 0.92 + 1.25rem))
			auto
			minmax(0, 1fr);
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
		/* Both clue rows come down a notch on a 568px phone, where the sound box they sit in is
		   32px and the gloss box below it 18.9: a 24px sentence and a 1.25-leaded second line of
		   translation between them leave 0.4px of air, and 106 translations do take a second
		   line. */
		/* `.prompt` on the front of both: the rules they override are declared further down the
		   sheet at the same specificity, and source order would otherwise win. */
		.prompt .clue-face :global(.clue-hanzi) {
			font-size: min(1.375rem, calc(100cqw / var(--sen-chars) / 1.04));
		}

		.prompt .clue-en {
			line-height: 1.18;
		}

		.prompt {
			--sound-size: var(--text-pinyin-md);
			/*
			 * The gloss steps down on a short screen for a reason the gloss cannot see: every
			 * line it wraps to is a line taken out of the headword above it, and on a 568px
			 * phone that is the difference between a 61px character and a 46px one.
			 */
			--gloss-max: var(--text-base);
		}

		.prompt.teach {
			--gloss-max: var(--text-lg);
		}

		/*
		 * The panel's own header goes first on a short phone. It is 21px of label on a block
		 * whose three lines say what it is anyway, and 21px here is 21px off the character —
		 * on a 568px screen the whole card fits only because this is gone.
		 */
		.aside-label {
			display: none;
		}

		.sen-english {
			margin-block-start: 0.1875rem;
		}
	}

	@media (max-height: 37rem) {
		.prompt {
			--sound-size: var(--text-pinyin-sm);
			--gloss-max: var(--text-sm);
			--gloss-min: var(--text-xs);
		}

		.prompt.teach {
			--gloss-max: var(--text-base);
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
		font-size: max(
			2.5rem,
			min(calc(100cqw / var(--cols) / var(--hero-fit)), 92cqh, var(--hero-max))
		);
		line-height: 1.02;
	}

	/*
	 * THE ENGLISH IS THE HEADWORD OF A PRODUCTION CARD, and it is sized the way the character
	 * is: by the band the layout actually left it, not by a step.
	 *
	 * It used to be `min(44px, 94cqh / askLines(gloss) / 1.16)`, where `askLines` guessed the
	 * wrap from the character count against a 15ch measure. The 44px won on essentially every
	 * card — the height term only bites below a 55px band — so the whole question was one 44px
	 * line adrift in a 160px row, which is the hole this card was. And the guess was
	 * load-bearing in the wrong direction: it decided how *small* to go, never whether the line
	 * would actually fit.
	 *
	 * So the wrap is solved rather than guessed. Set in `--ask-rows` lines (one per sense) the
	 * type can be `94cqh / rows / j / 1.16` tall before it overruns the band and
	 * `88cqw · j / --ask-em` wide before it overruns the column, where `j` is how many lines a
	 * single sense is allowed to wrap to and `--ask-em` is the widest sense measured in ems
	 * (see `glossEm`). The best size is the largest `j` where both hold, and since the height
	 * term falls with `j` while the width term rises, `max()` of the three `min()`s IS that
	 * crossing. Nothing is assumed about where a line breaks: whichever `j` wins, the width
	 * term guarantees the sense fits in `j` lines of column.
	 *
	 * Hanzi and Latin still never share a scale — this tops out at 80px on the phone where the
	 * character reaches 152. They are the same presence, not the same number.
	 */
	.ask {
		--ask-h: calc(94cqh / var(--ask-rows) / 1.16);
		--ask-w: calc(88cqw / var(--ask-em));

		margin: 0;
		font-size: clamp(
			var(--text-lg),
			max(
				min(var(--ask-h), var(--ask-w)),
				min(calc(var(--ask-h) / 2), calc(var(--ask-w) * 2)),
				min(calc(var(--ask-h) / 3), calc(var(--ask-w) * 3))
			),
			var(--ask-max)
		);
		font-weight: 650;
		line-height: 1.12;
		letter-spacing: -0.024em;
		text-wrap: balance;
	}

	/*
	 * ONE SENSE, ONE LINE. `good · fine` set as a single line leaves the second half of the
	 * question competing with the first for one line's worth of type; stacked, both halves are
	 * the headword and the block fills the band it was given. The reveal still joins them with
	 * a middot — down there the gloss is a restatement on one pinned line, not the subject of
	 * the screen.
	 */
	.sense {
		display: block;
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
		/* An inline-size container, so the clue sentence inside it can be divided into the
		   column the same way every other run of hanzi on this screen is. It already had a
		   definite inline size, so this contains nothing that was load-bearing. */
		container-type: inline-size;
		display: grid;
		position: relative;
		place-items: center;
		inline-size: 100%;
		block-size: var(--sound-slot);
	}

	/*
	 * Out of flow on purpose. The pinyin has to stay centred under its own character — that is
	 * the one alignment this screen is built on — so the speaker cannot share a flex row with
	 * it, and it cannot be allowed to change the row's height when `SpeakButton` decides after
	 * mount that this browser can speak.
	 */
	.say-slot {
		display: grid;
		position: absolute;
		align-items: center;
		inset-block: 0;
		inset-inline-end: 0;
	}

	/* The word `Listen` costs 40px of a row that is already lending its ends to a bracketed
	   traditional form; the icon is a 44px speaker either way and the accessible name is the
	   whole sentence regardless. The teach card, which has the room, keeps the label. */
	.say-slot.icon :global(.label) {
		display: none;
	}

	/* At 152px the headword has no room beside it, so on a teach card the bracketed form goes
	   under the sound instead — a footnote to the word, never a second headword. */
	.trad {
		display: flex;
		align-items: baseline;
		gap: 0.05em;
		margin: 0.25rem 0 0;
		color: var(--color-ink-subtle);
	}

	/*
	 * A QUESTION CARD CANNOT AFFORD A ROW FOR IT. The reveal is laid out in both states, so a
	 * `.trad` row would be reserved before the tap as well as after — 24px off the character,
	 * on the half of the list that has a traditional form and not on the other half, which is
	 * the "the word decides the headword's size" bug in a new hat. Tucked into the sound row's
	 * own fixed box instead, at the inline start, it costs the layout nothing and balances the
	 * speaker sitting at the other end. The pinyin between them stays centred under its own
	 * character, which is the alignment this screen is built on.
	 */
	.trad.tucked {
		position: absolute;
		inset-inline-start: 0;
		max-inline-size: 34%;
		margin: 0;
		overflow: hidden;
	}

	/* A step below the smallest hanzi rung, because every pixel this end takes is two pixels
	   off the pinyin in the middle (the sound is centred, so it grows into both ends at once)
	   and `soundEnds` above is derived from exactly these numbers. Pleco sets its bracketed
	   form small for the same reason: it is an aside about the word, not a second headword. */
	.trad.tucked :global(.hanzi) {
		font-size: 1rem;
	}

	.trad.tucked .bracket {
		font-size: var(--text-2xs);
	}

	.bracket {
		font-size: var(--text-sm);
	}

	.gloss-slot {
		/* An inline-size container, so the meaning can be divided into it. It has a definite
		   inline size already, so this contains nothing that was load-bearing. */
		container-type: inline-size;
		position: relative;
		display: grid;
		justify-items: center;
		inline-size: 100%;
		/*
		 * One line at the top of the scale, whatever size the line actually came out at. The
		 * fit above is continuous, so without this a gloss that resolved to 12.4px would leave
		 * a 2.7px shorter slot than one that resolved to 14px, and 2.7px of slot is 2.5px of
		 * character — the same "the English decides the hanzi" bug the fit was written to kill,
		 * two orders of magnitude smaller. With it, every word whose gloss fits on one line
		 * gets the identical headword: 4,266 of the 4,308 shipped do at 375x812.
		 */
		min-block-size: calc(var(--gloss-max) * 1.35);
		margin-block-start: 0.25rem;
	}

	/* The reveal's rows are laid out in both states; only the ink is withheld. */
	.veiled {
		visibility: hidden;
	}

	/*
	 * THE CLUE. Two rows of the reveal's reserve, spent on the question instead of on nothing.
	 * Neither costs a pixel: the sentence sits inside the sound slot's own fixed box and the
	 * translation is laid over the gloss slot, so the character above them is the same size on
	 * a card that has a sentence and a card that does not.
	 */
	.clue-face {
		margin: 0;
		line-height: 1.3;
		color: var(--color-ink-muted);
	}

	/* Divided by the characters that have to fit, exactly like the headword and the teach
	   card's panel: every shipped sentence is 5-20 characters, so this lands on the 24px cap
	   for a short one and comes down to 16px for the longest at 375px — one line either way,
	   which is what keeps it inside a slot sized for a line of pinyin. */
	.clue-face :global(.clue-hanzi) {
		font-size: min(1.5rem, calc(100cqw / var(--sen-chars) / 1.04));
	}

	/*
	 * THE BLANK IS THE WORD'S OWN WIDTH. The distractor picker weights a matching character
	 * count above every other signal in this direction, so the four buttons are almost always
	 * the same length as each other and a width-true blank gives away nothing they do not.
	 * Transparent ink with the rule drawn under it, rather than a substituted underscore, is
	 * what keeps the rest of the sentence sitting exactly where it would with the word in it.
	 *
	 * `aria-hidden` on the wrapper and not merely transparent ink: a screen reader would
	 * otherwise read out the answer the eye cannot see.
	 */
	.blank {
		text-decoration-line: underline;
		text-decoration-color: var(--color-ink-subtle);
		text-decoration-thickness: 0.055em;
		text-underline-offset: 0.16em;
	}

	.blank :global(.clue-hanzi) {
		color: transparent;
	}

	/*
	 * Over the gloss slot, not in it — see `.meaning` for what that box is measured by. Sized
	 * to its own measured width (`glossEm` again) so a long translation steps down the scale
	 * instead of wrapping, which is the same rule the revealed meaning follows one layer below
	 * it. 4,202 of the 4,308 shipped translations land on one line at 375px; the 106 that do
	 * not are already at the floor of the scale and take a second line rather than being cut
	 * off mid-sentence — the box is centred and unclipped, so those two lines borrow the 4px
	 * gaps either side of the slot instead of losing their own second half.
	 */
	.clue-en {
		position: absolute;
		inset: 0;
		display: grid;
		place-content: center;
		margin: 0;
		font-size: clamp(var(--text-2xs), calc(96cqw / var(--clue-em)), var(--text-sm));
		line-height: 1.25;
		color: var(--color-ink-subtle);
		text-wrap: pretty;
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

	/*
	 * Two rules, both of them about not out-measuring the word above. `--sound-size` is the
	 * vertical one and steps with the viewport; the divisor is the horizontal one and divides
	 * what the row has left after its two ends by the line's own measured width — `glossEm`
	 * over-estimates pinyin (its table is the sans face), which is the safe direction for a
	 * term whose whole job is to keep the line clear of a button.
	 */
	.sound :global(.pinyin) {
		font-size: min(var(--sound-size), calc((100cqw - var(--sound-ends)) / var(--py-em)));
		line-height: 1.15;
	}

	/*
	 * Divided into the column rather than stepped on a character count: `--gloss-em` is the
	 * line's measured width in ems, so this is the largest size at which it still fits on one
	 * line, clamped to the scale. See `glossEm` in `quiz.ts`.
	 */
	.meaning {
		max-inline-size: 100%;
		margin: 0;
		/*
		 * 92, not 100. Two margins are being bought here. `glossEm` is an estimate, and a text
		 * run laid out at 12–14px is up to 5% wider than the same run measured at 100px and
		 * scaled down, because glyph advances round at small sizes — so a size derived from the
		 * full column lands a hair over it and wraps, which is the one outcome this whole
		 * mechanism exists to avoid. Eight per cent covers both, measured: at 92 the only
		 * glosses that still take two lines are the ones that cannot fit at the floor.
		 */
		font-size: clamp(var(--gloss-min), calc(92cqw / var(--gloss-em)), var(--gloss-max));
		font-weight: 550;
		line-height: 1.35;
		color: var(--color-ink);
		text-wrap: pretty;
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

	/* --------------------------------------------------- the teach card's second block ----- */

	/*
	 * `align-self: end` rather than a stretched row: the panel is exactly as tall as what is in
	 * it and sits on the floor of the stage, directly above the Got it button, so the slack in
	 * the card is one measured gap between two blocks instead of padding inside an empty box.
	 * A card with no second block never renders this element at all.
	 */
	.aside {
		container-type: inline-size;
		display: grid;
		align-self: end;
		justify-items: center;
		inline-size: 100%;
		/* Continuous against the viewport, like every other vertical measure on this screen: the
		   panel is what has to fit last, so it gives its padding back on a short phone instead
		   of pushing the character down the scale. */
		margin-block-start: clamp(0.5rem, calc(2.5svh - 4px), 1.125rem);
		padding: clamp(0.4375rem, calc(5svh - 16px), 1.5rem) 0.875rem;
		border-radius: var(--radius-lg);
		background-color: var(--color-surface-sunken);
	}

	.aside-label {
		margin: 0 0 0.375rem;
		font-size: var(--text-2xs);
		font-weight: 600;
		line-height: 1.4;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-ink-subtle);
	}

	/*
	 * The sentence is set by the same rule as the headword: divide the column by how many
	 * characters have to fit. Every shipped sentence is 5–12 characters, so this lands on the
	 * 28px cap for a short one and 27px for the longest at 375px, and comes down to 22px on a
	 * 320px screen — one line either way, which is what keeps the block a fixed three lines.
	 */
	.sen-face {
		margin: 0;
		line-height: 1.3;
	}

	.sen-face :global(.sen-hanzi) {
		font-size: min(1.75rem, calc(100cqw / var(--sen-chars) / 1.04));
	}

	/* The word being taught, inside its own sentence — Pleco bolds it, Du Chinese bolds it. */
	.sen-face :global(.hit) {
		color: var(--color-ink);
	}

	.sen-face :global(.sen-hanzi:not(.hit)) {
		color: var(--color-ink-muted);
	}

	.sen-sound {
		margin: 0.25rem 0 0;
		color: var(--color-ink-subtle);
	}

	.sen-sound :global(.pinyin) {
		font-size: var(--text-pinyin-sm);
	}

	.sen-english {
		max-inline-size: 34ch;
		margin: 0.3125rem 0 0;
		font-size: var(--text-sm);
		line-height: 1.4;
		color: var(--color-ink-muted);
		text-wrap: pretty;
	}

	/* One tile per character, for the words with no sentence yet. */
	.cells {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.375rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.cell {
		display: grid;
		justify-items: center;
		gap: 0.125rem;
		min-inline-size: 3.5rem;
		padding: 0.375rem 0.5rem 0.4375rem;
		border-radius: var(--radius-md);
		background-color: var(--color-surface);
	}

	.cell :global(.cell-face) {
		font-size: var(--text-hanzi-md);
		line-height: 1.1;
	}

	.cell :global(.pinyin) {
		font-size: var(--text-pinyin-sm);
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
		.prompt,
		.prompt.teach,
		.prompt.teach.bare {
			block-size: auto;
			grid-template-rows: auto auto auto auto auto;
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

		/* Back onto one line, joined the way the reveal joins them: landscape is the one shape
		   where the run is already taller than the window, and a second sense on a second line
		   is a second line of scrolling for a phrase that fits across 812px. */
		.sense {
			display: inline;
		}

		.sense + .sense::before {
			content: ' · ';
		}

		/* Landscape is the one shape where the run is already taller than the window; a panel
		   that adds 120px to it is 120px of scrolling for context nobody asked for. */
		.aside {
			display: none;
		}
	}
</style>
