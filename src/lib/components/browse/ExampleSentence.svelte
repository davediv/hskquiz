<!--
	The word, used.

	This is the block both references spend their entry screen on and this app spent none of:
	Pleco gives 几乎 four sentences over most of a phone screen, Du Chinese gives 一边 three. A
	learner who reads 安慰 "to comfort" and closes the sheet has met a gloss, not a word — they
	still do not know what goes in front of it or after it.

	THE SAME THREE TIERS THE REST OF THE APP USES, one step quieter than the headword above:
	characters, then the sound, then the meaning, each with less weight and more air than the
	one over it. Nothing new is invented for it — `<Hanzi>` and `<Pinyin>` set both Chinese
	lines, so tone colour lands where the design system already puts it and a sentence reads
	like the rest of the app rather than like a quotation pasted in.

	AND THE HEADWORD IS MARKED INSIDE IT. A 12-character sentence is a wall if you have to hunt
	for the word you opened, so every occurrence of it carries the sunken ground and the accent
	rule under it, in the hanzi line and again in the pinyin. `example.ts` does the cutting;
	the mark is a ground and a rule rather than a colour precisely because the pinyin's colour
	is already spoken for — it is the tone, and nothing may overwrite that.

	ABSENCE IS NOT A STATE. 3,038 of the 4,308 shipped words carry no sentence yet (HSK 3–5
	have none), so this component renders NOTHING at all for them — no frame, no placeholder,
	no reserved height. The sheet's sections each own their own top margin, so a word without a
	sentence gets the sheet it had before, with CHARACTERS following the meanings exactly as it
	always did. A machine-written sentence would be worse than no sentence; so would an empty
	box announcing one is missing.
-->
<script lang="ts">
	import { Hanzi, Pinyin } from '$lib/design';
	import type { Word } from '$lib/types';
	import { splitSentence } from './example';

	interface Props {
		word: Word;
		/** The device has a Chinese voice, so the sentence can be played. */
		canSpeak: boolean;
		/** This sentence is the thing currently being spoken. */
		speaking: boolean;
		onspeak: (text: string) => void;
	}

	let { word, canSpeak, speaking, onspeak }: Props = $props();

	const example = $derived(word.example ?? null);
	const parts = $derived(example === null ? null : splitSentence(example, word.hanzi));

	/**
	 * The one space between two adjacent pinyin runs. It has to be a real text node rather than
	 * template whitespace — the runs are packed against each other so the compiler does not
	 * invent a gap the syllable alignment has not asked for — and a bare `{' '}` in the markup
	 * is a lint error, so the space is named here instead.
	 */
	const GAP = ' ';
</script>

{#if example !== null && parts !== null}
	<section class="example" aria-label="The word in a sentence">
		<div class="ex-top">
			<h3 class="eyebrow">In a sentence</h3>
			{#if canSpeak}
				<button
					type="button"
					class="say-ex"
					class:on={speaking}
					onclick={() => onspeak(example.hanzi)}
				>
					<span class="sr-only">Say this sentence out loud</span>
					<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
						<path
							d="M4 9.5h3.4L12 5.6v12.8L7.4 14.5H4z"
							fill="currentColor"
							stroke="currentColor"
							stroke-width="1.6"
							stroke-linejoin="round"
						/>
						<path
							d="M15.6 9.2a4 4 0 0 1 0 5.6M18.3 6.4a7.8 7.8 0 0 1 0 11.2"
							fill="none"
							stroke="currentColor"
							stroke-width="1.8"
							stroke-linecap="round"
						/>
					</svg>
				</button>
			{/if}
		</div>

		<p class="ex-hz">
			{#each parts.hanzi as run, i (i)}<Hanzi
					text={run.text}
					size="sm"
					display={run.mark}
					class={run.mark ? 'ex-run on' : 'ex-run'}
				/>{/each}
		</p>

		<p class="ex-py">
			{#if parts.pinyin === null}<Pinyin
					pinyin={example.pinyin}
					size="md"
					class="ex-run"
				/>{:else}{#each parts.pinyin as run, i (i)}{#if i > 0}{GAP}{/if}<Pinyin
						syllables={run.syllables}
						size="md"
						class={run.mark ? 'ex-run on' : 'ex-run'}
					/>{/each}{/if}
		</p>

		<p class="ex-en">{example.english}</p>
	</section>
{/if}

<style>
	/* The same section rhythm the CHARACTERS strip and the record block use, so the sheet reads
	   as one column of blocks — and so a word with no sentence simply has one block fewer. */
	.example {
		margin-block-start: 1.5rem;
		padding-block-start: 1rem;
		border-block-start: 1px solid var(--color-line);
	}

	/* The section's label and the one control it owns, on one line. The button hangs out of
	   the row on both sides rather than setting its height — a 44px target beside a 15px
	   eyebrow would otherwise cost 29px of a phone sheet to say nothing new. */
	.ex-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.example h3 {
		margin: 0;
	}

	.ex-hz {
		margin: 0.375rem 0 0;
		color: var(--color-ink);
	}

	/* A sentence wraps; a headword does not. The extra leading is what keeps the marked ground
	   on line two clear of the descenders on line one. */
	.ex-hz :global(.ex-run) {
		line-height: 1.55;
	}

	.ex-py {
		margin: 0.4375rem 0 0;
		color: var(--color-ink-muted);
		line-height: 1.55;
	}

	.ex-en {
		margin: 0.375rem 0 0;
		color: var(--color-ink-muted);
		font-size: var(--text-base);
	}

	/*
	 * THE MARK. A ground plus a rule, never a hue.
	 *
	 * `--color-surface-sunken` is one of the three grounds the palette guarantees Chinese text
	 * against (see palette.spec.ts), which the tinted state colours are not — so tone-coloured
	 * pinyin can sit on it and keep every contrast number the system has measured. The accent
	 * underneath is this app's one identity colour doing the job it is for: saying which word
	 * this entry is about. The marked hanzi also steps up to the display weight, so the mark
	 * survives a screenshot in greyscale.
	 */
	.example :global(.ex-run.on) {
		border-block-end: 2px solid var(--color-accent);
		background-color: var(--color-surface-sunken);
		box-decoration-break: clone;
		-webkit-box-decoration-break: clone;
		padding-inline: 0.09em;
		margin-inline: -0.09em;
		color: var(--color-ink);
	}

	.ex-py :global(.ex-run.on) {
		font-weight: 700;
	}

	/*
	 * The headword's speaker wears a ring; this one does not. There is already one ringed
	 * speaker on this sheet and it belongs to the word — a second identical control would read
	 * as a second headword. A full 44px target on a 20px row, hung out of it with negative
	 * block margins so the row costs what the eyebrow costs.
	 */
	.say-ex {
		display: grid;
		flex: none;
		place-items: center;
		inline-size: var(--spacing-tap);
		block-size: var(--spacing-tap);
		margin-block: -0.75rem;
		margin-inline-end: -0.625rem;
		border: 0;
		background: none;
		color: var(--color-ink-subtle);
	}

	.say-ex svg {
		inline-size: 1.0625rem;
		block-size: 1.0625rem;
	}

	/* Colour alone, because a filled disc here would overlap the two lines the button hangs
	   between. It is a transient state on a control the learner has just pressed. */
	.say-ex.on {
		color: var(--color-ink);
	}

	@media (hover: hover) {
		.say-ex:hover {
			color: var(--color-ink);
		}
	}
</style>
