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

	TONE COLOUR, BECAUSE THIS IS THE REVEAL
	`QuestionPrompt` paints the character and its syllable from `Word.syllables` the moment a
	question closes, and holds plain ink while it is still open — tone colour is the answer, not
	the question. Every word on this screen is past that line, so every word here is painted:
	character, pinyin, the word that was picked instead, and the mark. Getting this wrong in
	either direction is visible — an unpainted card two seconds after a painted reveal of the
	same word reads as a different app.

	SAME CARD FOR A MISS AND A HIT
	`outcome` changes the label at the top and whether the "you picked" footer exists. Nothing
	else. A word answered correctly is still worth reading once more, and giving it a quieter
	typographic treatment would be the app deciding which of your words deserve to be legible.

	TRADITIONAL IN BRACKETS
	`Word.traditional` is in the data for roughly a third of the list and Pleco prints it beside
	every headword. It earns its place here more than anywhere: 干 is two separate cards (乾 gān
	dry, 幹 gàn to work), and the bracketed form is what tells them apart at a glance.
-->
<script lang="ts">
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
	}

	let { word, outcome, picked = null, direction = 'hanzi-to-meaning', index = 0 }: Props = $props();

	const right = $derived(outcome === 'right');
	const size = $derived(headwordSize(word.hanzi));
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

<li class="card word" style:animation-delay={delay}>
	<div class="head">
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
		<SpeakButton text={word.hanzi} pinyin={word.pinyin} />
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
			<span class="tag">{picked === null ? 'No answer' : 'You picked'}</span>
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

	/* Reserves its own height so the Listen button arriving on hydration moves nothing. */
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		min-block-size: var(--spacing-tap);
	}

	/* Word for word the verdict the quiz card shows, so the two screens agree on what happened. */
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
