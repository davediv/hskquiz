<!--
	One word, after the run. The only way this screen ever shows a word.

	SIZE IS THE WHOLE ARGUMENT, AND THE ARGUMENT IS NOW WON WITH THE QUIZ'S OWN NUMBER
	Loop 1 asked for a teaching card set at least as large as the question that beat the learner.
	A fixed step could never get there: `--text-hanzi-hero` tops out at 22vw — 82.5px on a 375px
	phone — while `QuestionPrompt` sizes its headword against the stage it was handed and lands
	on 119.38px there. So this card stops picking a step and runs the prompt's own rule instead:
	`.face` is a size container and the headword is
	`min(100cqw / cols / fit, --card-hero-max)` with `--card-hero-max` quoted verbatim from
	`QuestionPrompt`'s `--hero-max`. Measured on a 375×812 phone: 119.38px here, 119.37px there.
	The divisor is 1.1 rather than the question card's 1.28 for the reason the *teach* card uses
	1.1 — a card in a scrolling list is not competing with four answer buttons for the column.

	THE SENTENCE IS THE PART THE REVEAL DID NOT ALREADY SHOW
	Hanzi, pinyin, gloss and part of speech are exactly what the quiz put on screen ninety
	seconds ago, so a card carrying only those is a dictionary line set large. 1,270 words now
	ship an authored `example` (every HSK 1 and 2 word; none above yet), and where there is one
	it goes on the card, with the word itself picked out of its own sentence the way Pleco bolds
	它 in an example and Du Chinese bolds it in a review card. Where there is none — 70.5% of the
	corpus — there is no block, no label and no reserved gap: the card simply ends at the part of
	speech. Nothing on this card is laid out around a slot that may be empty.

	TONE COLOUR IS ON THE PINYIN, NOT THE CHARACTER
	`<Hanzi>` sets characters in ink and `<Pinyin>` paints one colour per syllable off
	`Word.syllables` — the design system's single answer to "where does tone colour go", and the
	same one `QuestionPrompt` gives. Every pinyin line on this screen is painted, the picked
	word's included, so a card two seconds after a reveal of the same word reads as the same app.
	The one exception is the example sentence, whose pinyin is a whole line of running text: it
	is the same exception `QuestionPrompt` makes, for the same reason.

	SAME CARD FOR A MISS AND A HIT
	`outcome` changes the label at the top and whether the "you picked" footer exists. Nothing
	else. A word answered correctly is still worth reading once more, and giving it a quieter
	typographic treatment would be the app deciding which of your words deserve to be legible.

	TRADITIONAL IN BRACKETS
	`Word.traditional` is in the data for roughly a third of the list and Pleco prints it beside
	every headword. It earns its place here more than anywhere: 干 is two separate cards (乾 gān
	dry, 幹 gàn to work), and the bracketed form is what tells them apart at a glance.

	TWO CONTROLS, NOT ONE — AND NEITHER OF THEM LEAVES
	Listen says the word; Entry opens it. `Entry` used to be a real link to
	`/browse/[level]?q=…`, which meant tapping it left `/quiz/1` — and coming back rebuilt the
	run, destroying the summary, the review list and every drill result. It is a button now, and
	the summary opens the app's own `WordSheet` over the top of the results: numbered senses, the
	character breakdown, the word's family, your record with it. Nothing is navigated, so nothing
	can be lost, and the destination is the full entry rather than a filtered list one tap short
	of it.

	THE LABEL IS THE DRILL'S, ONCE THERE HAS BEEN ONE
	`drilled` is `null` until the re-test runs and then says how it went, so a word that was
	missed and then answered reads **✓ Fixed** rather than carrying a red ✕ that is no longer
	true. Nothing else about the card changes: same size, same order, same place in the list, so
	the screen heals instead of rearranging itself under a thumb. `picked` is likewise the most
	recent *wrong* answer, not the oldest: a word missed a second time with a different
	distractor prints that distractor. A word that was fixed keeps the original miss under
	`First time`, because the answer that fixed it is the headword and "FIRST TIME 地方" on a
	card about 地方 says nothing at all.

	A CORRECT ANSWER INSIDE THE "10 ANSWERED CORRECTLY" DISCLOSURE SAYS SO ONCE. The green
	✓ CORRECT stamp on every one of ten solved cards restated the label directly above them and
	took the line Pleco gives to the headword, so `verdict` is simply absent there and the
	controls take the row.
-->
<script lang="ts">
	import type { Direction, Word } from '$lib/types';
	import { Hanzi, Pinyin } from '$lib/design';
	import { fullGloss, posLabel, primaryGloss } from '$lib/components/quiz/quiz';
	import SpeakButton from './SpeakButton.svelte';

	interface Props {
		word: Word;
		/** How the run went on this word. Decides the label and the footer, not the size. */
		outcome: 'right' | 'wrong';
		/** What was chosen instead, on a miss. `null` is a question that ran out of run. */
		picked?: Word | null;
		/** Which way the question ran, so the footer reads in the order it was asked. */
		direction?: Direction;
		/** Position in its list, for the staggered entrance. */
		index?: number;
		/**
		 * How the re-test went on this word: `true` fixed, `false` missed again, `null` never
		 * drilled. Only ever set on a miss.
		 */
		drilled?: boolean | null;
		/** Draw the outcome label. Off inside a list whose own heading already says it. */
		verdict?: boolean;
		/** Open the full entry over the results. Absent leaves the card with one control. */
		onentry?: (word: Word) => void;
	}

	let {
		word,
		outcome,
		picked = null,
		direction = 'hanzi-to-meaning',
		index = 0,
		drilled = null,
		verdict = true,
		onentry
	}: Props = $props();

	const right = $derived(outcome === 'right');
	const fixed = $derived(!right && drilled === true);
	/**
	 * `Fixed` is the only label the drill adds. A word missed a *second* time keeps `Not quite` —
	 * the card is still red and still in the count, which says it, and `Missed again` is 30px
	 * wider than the head row has to spare beside two controls on a 375px phone.
	 */
	const label = $derived(right ? 'Correct' : fixed ? 'Fixed' : 'Not quite');
	/**
	 * The width divisor for the headword, floored at two — `QuestionPrompt`'s own rule. A
	 * one-character word left to divide the column by one would be set at the full width of the
	 * card, which is a poster rather than a headword.
	 */
	const cols = $derived(Math.max(2, [...word.hanzi].length));
	/**
	 * The real glyph count, which is what the SIDE-BY-SIDE layout measures its left column with:
	 * `--cols` is floored at two so a single character is not blown up to the width of the card,
	 * and using that floor as a width would leave 要 sitting in a 255px column with 127px of
	 * nothing beside it.
	 */
	const glyphs = $derived([...word.hanzi].length);

	/**
	 * WHETHER THIS CARD READS ACROSS OR DOWN, DECIDED BY THIS CARD.
	 *
	 * A breakpoint cannot answer this, because the question is not how wide the window is — it
	 * is whether *this word's* headword and a readable measure both fit in the column this card
	 * was given. 要 needs 128px on the left; 地方 needs 255; 对不起 needs 383. A single
	 * viewport threshold either splits 地方 into a 107px text column or leaves 要 in a 464px
	 * card with 313px of nothing beside it, and both of those are the bug being fixed.
	 *
	 * So the card measures itself. `clientWidth` here costs nothing extra — the summary is a
	 * client-only chunk, never server-rendered, so there is no hydration to mismatch — and the
	 * card's width never depends on its own contents (the grid column sets it), so there is no
	 * feedback loop to oscillate in.
	 */
	const HEAD_PER_CHAR = 128;
	const MEASURE_MIN = 220;
	const COLUMN_GAP = 20;
	const CARD_PADDING = 36;
	let cardW = $state(0);
	const side = $derived(cardW >= CARD_PADDING + glyphs * HEAD_PER_CHAR + COLUMN_GAP + MEASURE_MIN);
	/**
	 * The bracketed traditional form is a footnote to the headword, never a second one, so it is
	 * sized off the character count rather than off the headword: one or two characters leave
	 * room for 36px beside a 119px hero, three or four do not and take 26px.
	 */
	const tradSize: 'sm' | 'md' = $derived([...word.hanzi].length <= 2 ? 'md' : 'sm');
	const pos = $derived(posLabel(word));
	/** 1,270 of 4,308 words carry one. The block does not exist for the other 3,038. */
	const example = $derived(word.example ?? null);
	/**
	 * The sentence split around the word itself, so the characters just missed can be picked out
	 * of the line they are used in. The build guarantees the sentence contains the word; the
	 * `at < 0` branch is what happens if that ever stops being true.
	 */
	const sentence = $derived.by(() => {
		if (!example) return null;
		const at = example.hanzi.indexOf(word.hanzi);
		const parts =
			at < 0
				? [{ text: example.hanzi, hit: false }]
				: [
						{ text: example.hanzi.slice(0, at), hit: false },
						{ text: word.hanzi, hit: true },
						{ text: example.hanzi.slice(at + word.hanzi.length), hit: false }
					].filter((part) => part.text !== '');
		return { parts, chars: [...example.hanzi].length };
	});
	// Six cards in and the stagger has done its job; past that it is just latency.
	const delay = $derived(`${Math.min(index, 5) * 45}ms`);
</script>

<li
	class="card word"
	class:card-fixed={fixed}
	class:side
	style:--glyphs={glyphs}
	style:animation-delay={delay}
	bind:clientWidth={cardW}
>
	<div class="head">
		{#if verdict}
			<p class="verdict" class:right={right || fixed} class:miss={!right && !fixed}>
				{#if right || fixed}
					<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
						<path
							d="m3.5 8.5 3 3 6-7"
							fill="none"
							stroke="currentColor"
							stroke-width="2.4"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				{:else}
					<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
						<path
							d="m4.5 4.5 7 7m0-7-7 7"
							fill="none"
							stroke="currentColor"
							stroke-width="2.4"
							stroke-linecap="round"
						/>
					</svg>
				{/if}{label}
			</p>
		{/if}
		<div class="tools">
			{#if onentry}
				<button type="button" class="tool" aria-haspopup="dialog" onclick={() => onentry?.(word)}>
					<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
						<path
							d="M3.4 4.6h4.1c1.4 0 2.5.9 2.5 2v8.2c0-.9-1.1-1.6-2.5-1.6H3.4Zm13.2 0h-4.1c-1.4 0-2.5.9-2.5 2v8.2c0-.9 1.1-1.6 2.5-1.6h4.1Z"
							fill="none"
							stroke="currentColor"
							stroke-width="1.4"
							stroke-linejoin="round"
						/>
					</svg>
					<span class="label" aria-hidden="true">Entry</span>
					<span class="sr-only">Open the full entry for {word.hanzi}, {word.pinyin}</span>
				</button>
			{/if}
			<SpeakButton text={word.hanzi} pinyin={word.pinyin} />
		</div>
	</div>

	<p class="face" style:--cols={cols}>
		<Hanzi {word} size="hero" display class="hz" />
		{#if word.traditional}
			<span class="trad" class:trad-md={tradSize === 'md'}
				><span class="sr-only">traditional form </span><Hanzi
					text={word.traditional}
					size={tradSize}
					tones={false}
				/></span
			>
		{/if}
	</p>

	<p class="sound"><Pinyin {word} size="xl" /></p>
	<p class="gloss">{fullGloss(word)}</p>
	{#if pos}<p class="pos">{pos}</p>{/if}

	{#if sentence && example}
		<!-- No wrapper, no panel and no reserved height: on a word with no authored sentence
		     this whole block is absent and the card ends at the part of speech above. -->
		<section class="sen" style:--sen-chars={sentence.chars} aria-label="Example sentence">
			<p class="sen-face">
				{#each sentence.parts as part, i (i)}<Hanzi
						text={part.text}
						size="sm"
						display={part.hit}
						class={part.hit ? 'sen-hz hit' : 'sen-hz'}
					/>{/each}
			</p>
			<p class="sen-sound">
				<Pinyin pinyin={example.pinyin} size="sm" tones={false} sentence={example.hanzi} />
			</p>
			<p class="sen-english">{example.english}</p>
		</section>
	{/if}

	{#if !right}
		<p class="picked">
			<!-- Once the drill has fixed the word, the wrong answer is history rather than news, and
			     a bare "YOU PICKED" under a green ✓ FIXED reads as if it had just happened. -->
			<span class="tag">{picked === null ? 'No answer' : fixed ? 'First time' : 'You picked'}</span>
			{#if picked !== null}
				<span class="pick">
					{#if direction === 'meaning-to-hanzi'}
						<Hanzi word={picked} size="xs" />
						<Pinyin word={picked} size="sm" />
						<span class="pick-gloss">&ldquo;{primaryGloss(picked)}&rdquo;</span>
					{:else}
						<span class="pick-gloss">&ldquo;{primaryGloss(picked)}&rdquo;</span>
						<Hanzi word={picked} size="xs" />
						<Pinyin word={picked} size="sm" />
					{/if}
				</span>
			{/if}
		</p>
	{/if}
</li>

<style>
	/* A size container, so the head row can drop its two labels on a card too narrow to hold
	   them — and so the card can lay itself out beside its own headword once it is wide enough
	   to hold both. See the two queries at the end of this block. */
	.word {
		container-type: inline-size;
		padding: 0.625rem 1.125rem 1rem;
		list-style: none;
	}

	@media (prefers-reduced-motion: no-preference) {
		.word {
			animation: var(--animate-rise-in);
		}
	}

	/*
	 * A word answered right in the drill keeps every measurement it had and changes one hairline,
	 * so a healed card is legible as healed from across the list without the list moving.
	 */
	.card-fixed {
		border-color: var(--color-correct);
	}

	/*
	 * Reserves its own height so the Listen button arriving on hydration moves nothing.
	 *
	 * `wrap` is the safety net under the container query at the end of this file: the labelled
	 * row measures 251px and a 375px phone gives it 257, which is enough but not much. If a
	 * fallback font ever makes `NOT QUITE` wider than the slack, the controls drop to a second
	 * line inside the card instead of hanging over its right edge.
	 */
	.head {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.25rem 0.375rem;
		min-block-size: var(--spacing-tap);
	}

	/* Pushed right whether or not there is a verdict label on the left to push against. */
	.tools {
		display: flex;
		align-items: center;
		gap: 0.3125rem;
		margin-inline-start: auto;
	}

	/*
	 * Same pill as Listen, and now the same element too: both open something on this page rather
	 * than one of them leaving it. Both are `--spacing-tap` tall, which is the 44pt the whole
	 * app is built on.
	 */
	.tool {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: 0.3125rem;
		min-block-size: var(--spacing-tap);
		padding-inline: 0.5rem;
		border: 1px solid var(--color-line);
		border-radius: var(--radius-pill);
		background-color: var(--color-surface);
		/*
		 * Quieter than the verdict beside it. Two 44px bordered pills at 650 outweighed a 10px
		 * `✕ NOT QUITE` set at 2xs, so the head row led with its two utilities and the thing
		 * the card is actually reporting came second. The pills keep their shape — that is the
		 * affordance — and give up a weight step and an ink step to the sentence they sit next
		 * to.
		 */
		color: var(--color-ink-subtle);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.02em;
		text-decoration: none;
		transition:
			background-color 140ms var(--ease-out-soft),
			border-color 140ms var(--ease-out-soft),
			color 140ms var(--ease-out-soft);
	}

	.tool svg {
		inline-size: 1rem;
		block-size: 1rem;
	}

	.tool:active {
		background-color: var(--color-surface-sunken);
		color: var(--color-ink);
	}

	@media (hover: hover) {
		.tool:hover {
			border-color: var(--color-line-strong);
			background-color: var(--color-surface-sunken);
			color: var(--color-ink);
		}
	}

	/* Word for word the verdict the quiz card shows, so the two screens agree on what happened. */
	/* `flex: none` + `nowrap`: the two controls beside it may shrink, this may not wrap. */
	.verdict {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: 0.3125rem;
		margin: 0;
		/* One step up, to lead the row it shares with two pills. */
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		white-space: nowrap;
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

	/*
	 * The headword's stage. A size container so the character can be sized against the width it
	 * actually has, which is the only way a card in a 335px column can be told to match a
	 * full-bleed quiz prompt and be believed.
	 */
	.face {
		/* Quoted from `QuestionPrompt`'s `--hero-max`: the ceiling the question that beat the
		   learner was drawn under. 119.38px on a 375×812 phone. */
		--card-hero-max: clamp(6rem, calc(11.5svh + 26px), 8.5rem);
		/*
		 * How much wider than the glyphs themselves a headword's row must be. The question
		 * card's divisor is 1.28 because four answer buttons are competing for its column;
		 * nothing competes for this one, so it is set at the point where the *ceiling* above
		 * decides the size on the reference phone and the column decides it only on narrower
		 * ones — 257px of card ÷ 2 characters ÷ 1.07 = 120.1px, so the 119.38px cap wins by
		 * 0.7px and a 320px screen steps down on its own. `--cols` is floored at two.
		 */
		--card-fit: 1.07;

		container-type: inline-size;
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 0 0.5rem;
		margin: 0.125rem 0 0;
	}

	/* Beats `.text-hanzi-hero` on specificity, which is the point: the step is the fallback and
	   the measured size is the rule. */
	.face :global(.hz) {
		font-size: min(calc(100cqw / var(--cols) / var(--card-fit)), var(--card-hero-max));
		line-height: 1.04;
	}

	/*
	 * 〔乾〕— Pleco's own notation, in Pleco's own brackets, from the Chinese face. Bracketing
	 * rather than labelling costs two glyphs instead of a word of English on every card, and the
	 * brackets are sized off the form they hold rather than off the UI scale, so they never end
	 * up as two small Latin parens floating beside a 36px 乾.
	 */
	.trad {
		font-family: var(--font-hanzi);
		font-size: var(--text-hanzi-sm);
		line-height: 1;
		color: var(--color-ink-subtle);
	}

	.trad-md {
		font-size: var(--text-hanzi-md);
	}

	.trad::before {
		content: '〔';
	}

	.trad::after {
		content: '〕';
	}

	/* No colour of its own: `Pinyin` paints each syllable from its tone. */
	.sound {
		margin: 0.25rem 0 0;
	}

	.gloss {
		margin: 0.4375rem 0 0;
		font-size: var(--text-lg);
		font-weight: 550;
		line-height: 1.35;
		text-wrap: pretty;
	}

	.pos {
		margin: 0.1875rem 0 0;
		font-size: var(--text-xs);
		color: var(--color-ink-subtle);
	}

	/*
	 * THE SENTENCE.
	 *
	 * Flush to the same left axis as everything above it — the card has one — and separated by
	 * air rather than by a rule, so the block reads as the continuation of the entry it is. The
	 * hanzi is set by the same rule as the headword, divided by how many characters have to fit;
	 * every shipped sentence is 5–12 characters, so a short one lands on the 24px cap and the
	 * longest comes down to ~21px in this column. One line either way.
	 */
	.sen {
		container-type: inline-size;
		margin-block-start: 0.875rem;
	}

	.sen-face {
		margin: 0;
		line-height: 1.32;
	}

	.sen-face :global(.sen-hz) {
		font-size: min(1.5rem, calc(100cqw / var(--sen-chars) / 1.04));
	}

	/* The word that was missed, inside its own sentence — Pleco bolds it, Du Chinese bolds it. */
	.sen-face :global(.hit) {
		color: var(--color-ink);
	}

	.sen-face :global(.sen-hz:not(.hit)) {
		color: var(--color-ink-muted);
	}

	.sen-sound {
		margin: 0.1875rem 0 0;
		color: var(--color-ink-subtle);
	}

	.sen-sound :global(.pinyin) {
		font-size: var(--text-pinyin-sm);
	}

	.sen-english {
		margin: 0.25rem 0 0;
		font-size: var(--text-sm);
		line-height: 1.4;
		color: var(--color-ink-muted);
		text-wrap: pretty;
	}

	/*
	 * What they chose instead — context, not the record, so it sits below a hairline and stays
	 * quiet. The whole pick is one inline run inside a single flex item: as a row of separate
	 * flex items the gloss separator wrapped onto its own line and read as a stray bullet.
	 */
	.picked {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 0.25rem 0.4375rem;
		margin: 0.875rem 0 0;
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

	.pick {
		display: inline;
	}

	.pick-gloss {
		font-size: var(--text-sm);
	}

	/*
	 * 320px. The card is 240px wide there and `✕ NOT QUITE` beside two labelled pills measures
	 * 323, so the row ran off the card and took the page's horizontal scroll with it. Both pills
	 * go to their icon alone — 44px targets, unchanged accessible names — which is 90px back.
	 * `SpeakButton` carries the matching rule for its own half of the pair.
	 */
	/*
	 * A WIDE CARD READS ACROSS, NOT DOWN.
	 *
	 * Every card on this screen is one column: 119px of character with the pinyin, the gloss,
	 * the part of speech and the example sentence stacked underneath it. On a 375px phone that
	 * is right — the character takes the width it is given and nothing else fits beside it. On
	 * a desktop it is the same column with 313px of nothing to the right of the headword, 67%
	 * of the card, and three cards make a 1,880px scroll in a 900px window.
	 *
	 * Once the card has the width for it, the entry lays out the way a dictionary entry does:
	 * the headword on the left at exactly the size it had before, everything that reads as text
	 * to the right of it. The verdict row still spans the top — it is about the card, not about
	 * the word — and nothing changes size, so a card is the same card in both layouts and only
	 * its shape moves.
	 *
	 * `.side` is set by the card itself once it has the width for this particular word — see
	 * the note in the script. Nothing here is behind a breakpoint: the character never gives
	 * width back, so the layout waits until there is enough for both halves of it.
	 */
	.word.side {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		column-gap: 1.25rem;
		row-gap: 0;
		align-items: start;
	}

	.side .head {
		grid-column: 1 / -1;
		grid-row: 1;
	}

	/*
	 * Given the width its own ceiling asks for, rather than a share of the card: `.face` is
	 * the size container the glyph measures itself against, so `100cqw / cols / fit` lands
	 * exactly on `--card-hero-max` and the headword is the same 119.38px it is on a phone.
	 * An `auto` column would have made that circular — the container sized by the glyph
	 * sized by the container — which resolves to 0cqw and a font-size of nothing.
	 */
	.side .face {
		grid-column: 1;
		/* Spans past the end of the card on purpose: the right-hand column is between two
		   and five blocks depending on what the word has (a part of speech, an example, a
		   wrong answer to print), so there is no row count to name. `row-gap: 0` is what
		   makes the surplus rows cost nothing. */
		grid-row: 2 / span 20;
		inline-size: calc(var(--card-hero-max) * var(--glyphs) * var(--card-fit));
		align-self: start;
		margin-block-start: 0;
	}

	/*
	 * Divided by the real glyph count, not by `--cols`.
	 *
	 * `--cols` is floored at two so a single character in a stacked card is not blown up to
	 * the full width of it. Here the column is exactly one headword wide by construction, so
	 * that floor halves the character instead — measured 64.75px against a 129.5px ceiling —
	 * and 要 came out smaller beside its own entry than the pinyin next to it.
	 */
	.side .face :global(.hz) {
		font-size: min(calc(100cqw / var(--glyphs) / var(--card-fit)), var(--card-hero-max));
	}

	.side .sound,
	.side .gloss,
	.side .pos,
	.side .sen,
	.side .picked {
		grid-column: 2;
	}

	.side .sound {
		margin-block-start: 0;
	}

	@container (max-width: 15.5rem) {
		.tool .label {
			display: none;
		}

		.tool {
			padding-inline: 0.4375rem;
		}
	}
</style>
