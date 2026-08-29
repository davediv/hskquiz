<!--
	One word, opened out of the list.

	The list row is deliberately one line of meaning — that is what lets a thousand of them
	window — so this is where the whole entry lives, and it is modelled directly on Pleco's
	entry screen: hanzi first and large, tone-marked pinyin on its own line under it, the part
	of speech spelled out in a small grey label, then the senses at reading size. Each step down
	that order gets less weight and more air than the one below it, which is the entire reason
	Pleco's entry is scannable at arm's length.

	What Pleco has no reason to show, and this app does, is the last block: what the learner has
	actually done with this word. Browsing and practising are the same product, so the sheet
	that shows you 迷人 also shows you that you have missed it twice.

	It is a bottom sheet on a phone (the thumb is at the bottom, and the list stays visible
	behind it so you have not "gone" anywhere) and a centred card from 48rem up. Prev/next walk
	the filtered list without closing, so reading ten words in a row is nine taps, not eighteen.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import { Hanzi, Pinyin } from '$lib/design';
	import type { Level, Word, WordProgress } from '$lib/types';
	import { posLong } from './pos';
	import StatusPip from './StatusPip.svelte';
	import { STATUS_META, progressLine, type WordStatus } from './status';

	interface Props {
		word: Word;
		status: WordStatus;
		record: WordProgress;
		level: Level;
		/** 1-based position in the filtered list, and its length — "412 of 1,070". */
		position: number;
		total: number;
		onclose: () => void;
		onprev: () => void;
		onnext: () => void;
	}

	let { word, status, record, level, position, total, onclose, onprev, onnext }: Props = $props();

	/** How the tone is named out loud, so the colour is never the only thing carrying it. */
	const TONE_NAME: Record<0 | 1 | 2 | 3 | 4, string> = {
		0: 'neutral',
		1: '1st tone',
		2: '2nd tone',
		3: '3rd tone',
		4: '4th tone'
	};

	let panel = $state<HTMLElement | null>(null);

	/**
	 * The word taken apart character by character — Pleco's CHARS tab, which is the thing a
	 * learner opens an entry for that a list row cannot give them: *which* of those syllables
	 * belongs to *which* character, and what tone it carries. `Word.syllables` is built one per
	 * character and the build refuses to emit a word where that does not hold, so this is a
	 * zip, not a guess. Single-character words are their own breakdown, so they skip it.
	 */
	const characters = $derived(
		[...word.hanzi].map((hanzi, i) => {
			const syllable = word.syllables[i] ?? { py: '', tone: 0 as const };
			return { hanzi, syllable, tone: TONE_NAME[syllable.tone] };
		})
	);

	/**
	 * Hearing the word.
	 *
	 * Pleco puts a speaker on every line and it is half the reason people open it. We ship no
	 * audio files — 4,308 recordings is a data problem, not a screen problem — but the device
	 * already has a Chinese voice in it, so the entry can at least say the headword. The button
	 * only exists where the API does, and it says so rather than failing silently when the
	 * device turns out to have no Chinese voice installed.
	 *
	 * The sheet is never server-rendered (it opens on a tap), so reading `window` at init is
	 * safe and there is no hydration shape to keep in agreement.
	 */
	const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;
	let speaking = $state(false);
	let noVoice = $state(false);

	function chineseVoice(): SpeechSynthesisVoice | undefined {
		return window.speechSynthesis.getVoices().find((voice) => /^zh\b|^zh[-_]/i.test(voice.lang));
	}

	function speak() {
		if (!canSpeak) return;
		const synth = window.speechSynthesis;
		synth.cancel();

		const voice = chineseVoice();
		if (voice === undefined) {
			noVoice = true;
			speaking = false;
			return;
		}

		const utterance = new SpeechSynthesisUtterance(word.hanzi);
		utterance.voice = voice;
		utterance.lang = voice.lang;
		// Dictionary pace, not conversation pace: the point is to hear the tones separately.
		utterance.rate = 0.8;
		utterance.onend = () => (speaking = false);
		utterance.onerror = () => (speaking = false);
		noVoice = false;
		speaking = true;
		synth.speak(utterance);
	}

	// Stepping to the next word must not leave the previous one talking over it.
	$effect(() => {
		void word.id;
		untrack(() => {
			noVoice = false;
			speaking = false;
		});
		if (canSpeak) window.speechSynthesis.cancel();
	});

	const pos = $derived(posLong(word.pos));
	const meta = $derived(STATUS_META[status]);
	const line = $derived(progressLine(record));
	const hasPrev = $derived(position > 1);
	const hasNext = $derived(position < total);
	const practiseHref = $derived(resolve('/quiz/[level]', { level: String(level) }));

	// Opening moves focus into the sheet, so Escape, Tab and the arrow keys all land here and
	// not on the row underneath. The list restores focus to that row on close.
	$effect(() => {
		panel?.focus();
	});

	function focusables(): HTMLElement[] {
		if (!panel) return [];
		const selector = 'a[href], button:not([disabled])';
		return [...panel.querySelectorAll<HTMLElement>(selector)];
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.metaKey || event.ctrlKey || event.altKey) return;

		if (event.key === 'Escape') {
			event.preventDefault();
			onclose();
			return;
		}

		if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
			if (!hasNext) return;
			event.preventDefault();
			onnext();
			return;
		}

		if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
			if (!hasPrev) return;
			event.preventDefault();
			onprev();
			return;
		}

		// A modal that leaks focus to the list behind it is a modal in name only.
		if (event.key !== 'Tab') return;
		const stops = focusables();
		if (stops.length === 0) return;
		const first = stops[0];
		const last = stops[stops.length - 1];
		const active = document.activeElement;

		if (event.shiftKey && (active === first || active === panel)) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && active === last) {
			event.preventDefault();
			first.focus();
		}
	}
</script>

<div class="root">
	<!-- A real button, so tapping outside closes without a div that pretends to be clickable. -->
	<button type="button" class="scrim" onclick={onclose}>
		<span class="sr-only">Close</span>
	</button>

	<div
		bind:this={panel}
		class="panel"
		role="dialog"
		aria-modal="true"
		aria-labelledby="word-sheet-title"
		tabindex="-1"
		onkeydown={onKeydown}
	>
		<span class="grip" aria-hidden="true"></span>

		<div class="bar">
			<p class="counter tabular">{position.toLocaleString('en')} of {total.toLocaleString('en')}</p>
			<div class="nav">
				<button type="button" class="step" disabled={!hasPrev} onclick={onprev}>
					<span class="sr-only">Previous word</span>
					<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
						<path
							d="M15 5 8 12l7 7"
							fill="none"
							stroke="currentColor"
							stroke-width="2.1"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				</button>
				<button type="button" class="step" disabled={!hasNext} onclick={onnext}>
					<span class="sr-only">Next word</span>
					<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
						<path
							d="m9 5 7 7-7 7"
							fill="none"
							stroke="currentColor"
							stroke-width="2.1"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				</button>
				<button type="button" class="step close" onclick={onclose}>
					<span class="sr-only">Close</span>
					<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
						<path
							d="m6 6 12 12M18 6 6 18"
							fill="none"
							stroke="currentColor"
							stroke-width="2.1"
							stroke-linecap="round"
						/>
					</svg>
				</button>
			</div>
		</div>

		<div class="body">
			<!-- Pleco puts the level badge on the right of the headword line and it is the first
			     thing you look for; ours sat empty. -->
			<div class="head">
				<h2 id="word-sheet-title" class="headword">
					<Hanzi {word} size="lg" display />
				</h2>
				<span class="level" aria-label={`HSK level ${level}`}>HSK {level}</span>
			</div>

			{#if word.traditional}
				<p class="trad">
					traditional <span lang="zh-Hant" class="hanzi">{word.traditional}</span>
				</p>
			{/if}

			<p class="say">
				<Pinyin {word} size="xl" class="py" />
				{#if canSpeak}
					<button type="button" class="speak" class:on={speaking} onclick={speak}>
						<span class="sr-only">Say {word.hanzi} out loud</span>
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
			</p>

			{#if noVoice}
				<p class="no-voice">
					This device has no Chinese voice installed, so there is nothing to play.
				</p>
			{/if}

			<!-- One block, so the gap above the meanings is the same whether or not the word
			     carries a part-of-speech annotation — plenty of them do not. -->
			<div class="gloss">
				{#if pos}<p class="pos eyebrow">{pos}</p>{/if}

				{#if word.meanings.length > 1}
					<ol class="senses">
						{#each word.meanings as meaning, i (i)}
							<li><span class="num tabular">{i + 1}</span>{meaning}</li>
						{/each}
					</ol>
				{:else}
					<p class="sense">{word.meanings[0] ?? '—'}</p>
				{/if}
			</div>

			{#if characters.length > 1}
				<!-- Pleco's CHARS tab, inline: a compound is only learnable once you know which
				     syllable belongs to which character. -->
				<section class="chars" aria-label="Characters">
					<h3 class="eyebrow">Characters</h3>
					<ol class="char-list">
						{#each characters as char, i (i)}
							<li class="char">
								<Hanzi text={char.hanzi} syllables={[char.syllable]} size="sm" class="char-hz" />
								<Pinyin
									pinyin={char.syllable.py}
									syllables={[char.syllable]}
									size="sm"
									class="char-py"
								/>
								<span class="char-tone">{char.tone}</span>
							</li>
						{/each}
					</ol>
				</section>
			{/if}

			<div class="record">
				<p class="state">
					<StatusPip {status} />
					<span class="label">{meta.label}</span>
					<span class="detail">{record.seen > 0 ? line : meta.description}</span>
				</p>
			</div>
		</div>

		<div class="foot">
			<a class="btn btn-primary btn-block" href={practiseHref}>Practise HSK {level}</a>
		</div>
	</div>
</div>

<style>
	.root {
		position: fixed;
		inset: 0;
		z-index: 60;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
	}

	.scrim {
		position: absolute;
		inset: 0;
		min-block-size: 0;
		border: 0;
		/*
		 * The one colour here that is not a token, and deliberately so: a scrim has to darken
		 * in BOTH themes, and every ink token flips to near-white in the dark one — mixing
		 * with `--color-ink` lightens the list behind the sheet instead of pushing it back.
		 * This is the dark theme's own page value, used as a dimmer rather than as a surface.
		 */
		background-color: rgb(16 15 14 / 0.5);
		animation: sheet-fade 180ms var(--ease-out-soft) both;
	}

	.panel {
		position: relative;
		display: flex;
		flex-direction: column;
		max-block-size: min(88dvh, 44rem);
		padding-block-end: max(1rem, var(--app-safe-bottom));
		border-start-start-radius: var(--radius-xl);
		border-start-end-radius: var(--radius-xl);
		background-color: var(--color-surface);
		box-shadow: var(--shadow-lift);
		outline: none;
		animation: sheet-rise 240ms var(--ease-out-soft) both;
	}

	.grip {
		align-self: center;
		inline-size: 2.25rem;
		block-size: 0.25rem;
		margin-block-start: 0.5rem;
		border-radius: var(--radius-pill);
		background-color: var(--color-line-strong);
		opacity: 0.5;
	}

	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding-inline: 0.75rem 0.5rem;
	}

	.counter {
		margin: 0;
		padding-inline-start: 0.5rem;
		color: var(--color-ink-subtle);
		font-size: var(--text-xs);
	}

	.nav {
		display: flex;
		align-items: center;
	}

	.step {
		display: grid;
		place-items: center;
		inline-size: var(--spacing-tap);
		block-size: var(--spacing-tap);
		border: 0;
		border-radius: var(--radius-pill);
		background: none;
		color: var(--color-ink-muted);
	}

	.step svg {
		inline-size: 1.25rem;
		block-size: 1.25rem;
	}

	.step:disabled {
		opacity: 0.3;
	}

	.step.close {
		color: var(--color-ink);
	}

	@media (hover: hover) {
		.step:not(:disabled):hover {
			background-color: var(--color-surface-sunken);
			color: var(--color-ink);
		}
	}

	.body {
		flex: 1 1 auto;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding-inline: max(1.25rem, var(--app-safe-left)) max(1.25rem, var(--app-safe-right));
		padding-block-end: 1.25rem;
	}

	/* Pleco's ranking, and Pleco's air: each step down gets less weight and more space above
	   it than the thing it belongs to. */
	.head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
	}

	.headword {
		margin: 0.25rem 0 0;
		font-size: inherit;
		font-weight: inherit;
		letter-spacing: normal;
	}

	/* Quiet where Pleco's is a red block: red already means "wrong" and "practise" in this app,
	   and a badge that never changes should not shout louder than the meaning under it. */
	.level {
		flex: none;
		margin-block-start: 0.5rem;
		padding: 0.1875rem 0.5rem;
		border: 1px solid var(--color-line-strong);
		border-radius: var(--radius-xs);
		color: var(--color-ink-muted);
		font-size: var(--text-2xs);
		font-weight: 700;
		letter-spacing: 0.08em;
		white-space: nowrap;
	}

	.say {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0.375rem 0 0;
	}

	.speak {
		display: grid;
		flex: none;
		place-items: center;
		inline-size: 2.25rem;
		block-size: 2.25rem;
		border: 1px solid var(--color-line);
		border-radius: var(--radius-pill);
		background: none;
		color: var(--color-ink-muted);
	}

	.speak svg {
		inline-size: 1.125rem;
		block-size: 1.125rem;
	}

	.speak.on {
		border-color: transparent;
		background-color: var(--color-surface-sunken);
		color: var(--color-ink);
	}

	@media (hover: hover) {
		.speak:hover {
			border-color: var(--color-line-strong);
			color: var(--color-ink);
		}
	}

	.no-voice {
		margin: 0.5rem 0 0;
		color: var(--color-ink-subtle);
		font-size: var(--text-xs);
	}

	.trad {
		margin: 0.375rem 0 0;
		color: var(--color-ink-subtle);
		font-size: var(--text-xs);
	}

	.trad .hanzi {
		margin-inline-start: 0.25rem;
		color: var(--color-ink-muted);
		font-size: var(--text-base);
	}

	.panel :global(.py) {
		min-inline-size: 0;
		color: var(--color-ink-muted);
	}

	.gloss {
		margin-block-start: 1.125rem;
	}

	.pos {
		margin: 0;
	}

	.sense,
	.senses {
		margin: 0.375rem 0 0;
		color: var(--color-ink);
		font-size: var(--text-lg);
		line-height: 1.5;
	}

	.senses {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		padding: 0;
		list-style: none;
	}

	.num {
		display: inline-block;
		min-inline-size: 1.125rem;
		margin-inline-end: 0.375rem;
		color: var(--color-ink-subtle);
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.chars {
		margin-block-start: 1.5rem;
		padding-block-start: 1rem;
		border-block-start: 1px solid var(--color-line);
	}

	.chars h3 {
		margin: 0;
	}

	.char-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 0.625rem 0 0;
		padding: 0;
		list-style: none;
	}

	/* One tile per character, so the compound reads left to right as the word does and each
	   syllable sits directly under the character it belongs to. */
	.char {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.125rem;
		min-inline-size: 3.5rem;
		padding: 0.5rem 0.625rem 0.4375rem;
		border: 1px solid var(--color-line);
		border-radius: var(--radius-sm);
		background-color: var(--color-surface-sunken);
	}

	.char-tone {
		color: var(--color-ink-subtle);
		font-size: var(--text-2xs);
		letter-spacing: 0.02em;
	}

	.record {
		margin-block-start: 1.5rem;
		padding-block-start: 1rem;
		border-block-start: 1px solid var(--color-line);
	}

	.state {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		margin: 0;
		font-size: var(--text-sm);
	}

	.label {
		font-weight: 600;
		color: var(--color-ink);
	}

	.detail {
		color: var(--color-ink-muted);
	}

	.foot {
		padding-block-start: 0.75rem;
		padding-inline: max(1.25rem, var(--app-safe-left)) max(1.25rem, var(--app-safe-right));
	}

	/* From tablet up the sheet stops being a sheet: a centred card reads as an entry rather
	   than a drawer, and there is no thumb at the bottom of a laptop screen. */
	@media (min-width: 48rem) {
		.root {
			justify-content: center;
			align-items: center;
			padding: 2rem;
		}

		.panel {
			inline-size: 100%;
			max-inline-size: 30rem;
			padding-block-end: 1.25rem;
			border-radius: var(--radius-card);
			animation-name: sheet-zoom;
		}

		.grip {
			display: none;
		}

		.bar {
			padding-block-start: 0.5rem;
		}
	}

	@keyframes sheet-fade {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes sheet-rise {
		from {
			opacity: 0;
			transform: translate3d(0, 12%, 0);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}

	@keyframes sheet-zoom {
		from {
			opacity: 0;
			transform: scale(0.97);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}
</style>
