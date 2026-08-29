<!--
	One word, after the run. The only way this screen ever shows a word.

	SIZE IS THE WHOLE ARGUMENT
	The hanzi is set with the app's shared `headwordSize()` — 82.5px for a one- or two-character
	word on a 375px phone, stepping down as characters are added — rather than a size invented
	for a summary row. It was 48px before, which said the test mattered more than the word. This
	is the back of the flashcard, and the back of a flashcard is not a receipt. Everything under
	it (tone-marked pinyin at `xl`, every gloss at `lg`, the part of speech) is the quiz's own
	reveal block, flush left instead of centred so ten of them read as a list.

	The quiz prompt itself now runs larger still (it measures the viewport row it was handed and
	lands near 112px on the same phone). That is a stage this screen does not have — ten cards
	scroll, one question does not — so the card takes the largest fixed step on the scale instead
	of copying a number that only makes sense full-bleed.

	TONE COLOUR IS ON THE PINYIN, NOT THE CHARACTER
	`<Hanzi>` sets characters in ink and `<Pinyin>` paints one colour per syllable off
	`Word.syllables` — the design system's single answer to "where does tone colour go", and the
	same one `QuestionPrompt` gives. Every pinyin line on this screen is painted, the picked
	word's included, so a card two seconds after a reveal of the same word reads as the same app.

	SAME CARD FOR A MISS AND A HIT
	`outcome` changes the label at the top and whether the "you picked" footer exists. Nothing
	else. A word answered correctly is still worth reading once more, and giving it a quieter
	typographic treatment would be the app deciding which of your words deserve to be legible.

	TRADITIONAL IN BRACKETS
	`Word.traditional` is in the data for roughly a third of the list and Pleco prints it beside
	every headword. It earns its place here more than anywhere: 干 is two separate cards (乾 gān
	dry, 幹 gàn to work), and the bracketed form is what tells them apart at a glance.

	TWO CONTROLS, NOT ONE
	Listen says the word; Entry leaves for it. A card with one audio button on it is still a
	printout — Du Chinese's equivalent card offers Dictionary, Pinyin and a hint, and every Pleco
	row pushes into the entry. `Entry` is the browse screen for this word's own level, which is
	where the character breakdown, the sense list and your record with the word live: the card is
	the back of the flashcard, and this is the way out of it that is not "answer ten more".

	THE LABEL IS THE DRILL'S, ONCE THERE HAS BEEN ONE
	`drilled` is `null` until the re-test runs and then says how it went, so a word that was
	missed and then answered reads **✓ Fixed** rather than carrying a red ✕ that is no longer
	true. Nothing else about the card changes: same size, same order, same place in the list, so
	the screen heals instead of rearranging itself under a thumb.

	A CORRECT ANSWER INSIDE THE "10 ANSWERED CORRECTLY" DISCLOSURE SAYS SO ONCE. The green
	✓ CORRECT stamp on every one of ten solved cards restated the label directly above them and
	took the line Pleco gives to the headword, so `verdict` is simply absent there and the
	controls take the row.
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Direction, Word } from '$lib/types';
	import { Hanzi, Pinyin } from '$lib/design';
	import { fullGloss, headwordSize, posLabel, primaryGloss } from '$lib/components/quiz/quiz';
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
	}

	let {
		word,
		outcome,
		picked = null,
		direction = 'hanzi-to-meaning',
		index = 0,
		drilled = null,
		verdict = true
	}: Props = $props();

	const right = $derived(outcome === 'right');
	const fixed = $derived(!right && drilled === true);
	/**
	 * `Fixed` is the only label the drill adds. A word missed a *second* time keeps `Not quite` —
	 * the card is still red and still in the count, which says it, and `Missed again` is 30px
	 * wider than the head row has to spare beside two controls on a 375px phone.
	 */
	const label = $derived(right ? 'Correct' : fixed ? 'Fixed' : 'Not quite');
	const size = $derived(headwordSize(word.hanzi));
	/**
	 * The word, searched for on its own level's browse screen.
	 *
	 * `?q=` is the query the browse route seeds its search field from, and an exact hanzi is the
	 * top band of its ranking — so tapping Entry lands on a list with this word at the head of
	 * it, one tap from the full Pleco-style sheet. `Word.level` rather than a prop: a session is
	 * one level, but the word already knows which, and one source of truth is one fewer thing a
	 * caller can get wrong. The path itself is built by `resolve()` inside the attribute, which
	 * is where the lint rule guarding internal links wants to see it.
	 */
	const entryQuery = $derived(encodeURIComponent(word.hanzi));
	/**
	 * The bracketed traditional form is a footnote to the headword, never a second one, so it is
	 * sized off the character count rather than off `size`: one or two characters leave room for
	 * 36px beside an 82px hero, three or four do not and take 26px.
	 */
	const tradSize: 'sm' | 'md' = $derived([...word.hanzi].length <= 2 ? 'md' : 'sm');
	const pos = $derived(posLabel(word));
	// Six cards in and the stagger has done its job; past that it is just latency.
	const delay = $derived(`${Math.min(index, 5) * 45}ms`);
</script>

<li class="card word" class:card-fixed={fixed} style:animation-delay={delay}>
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
			<a
				class="tool"
				href="{resolve('/browse/[level]', { level: String(word.level) })}?q={entryQuery}"
			>
				<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
					<path
						d="M3.4 4.6h4.1c1.4 0 2.5.9 2.5 2v8.2c0-.9-1.1-1.6-2.5-1.6H3.4Zm13.2 0h-4.1c-1.4 0-2.5.9-2.5 2v8.2c0-.9 1.1-1.6 2.5-1.6h4.1Z"
						fill="none"
						stroke="currentColor"
						stroke-width="1.4"
						stroke-linejoin="round"
					/>
				</svg>
				<span aria-hidden="true">Entry</span>
				<span class="sr-only"
					>Open {word.hanzi}, {word.pinyin}, in the HSK {word.level} word list</span
				>
			</a>
			<SpeakButton text={word.hanzi} pinyin={word.pinyin} />
		</div>
	</div>

	<p class="face">
		<Hanzi {word} {size} display />
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
	.word {
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

	/* Reserves its own height so the Listen button arriving on hydration moves nothing. */
	.head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-block-size: var(--spacing-tap);
	}

	/* Pushed right whether or not there is a verdict label on the left to push against. */
	.tools {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		margin-inline-start: auto;
	}

	/*
	 * Same pill as Listen, so the two read as one pair of controls rather than a button and a
	 * link. Both are `--spacing-tap` tall, which is the 44pt the whole app is built on.
	 */
	.tool {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: 0.3125rem;
		min-block-size: var(--spacing-tap);
		padding-inline: 0.625rem;
		border: 1px solid var(--color-line);
		border-radius: var(--radius-pill);
		background-color: var(--color-surface);
		color: var(--color-ink-muted);
		font-size: var(--text-xs);
		font-weight: 650;
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
		font-size: var(--text-2xs);
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

	.face {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 0 0.5rem;
		margin: 0.125rem 0 0;
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
</style>
