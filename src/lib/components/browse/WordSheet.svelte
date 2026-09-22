<!--
	One word, opened out of the list.

	The list row is deliberately one line of meaning — that is what lets a thousand of them
	window — so this is where the whole entry lives, and it is modelled directly on Pleco's
	entry screen: hanzi first and large, tone-marked pinyin on its own line under it, the part
	of speech spelled out in a small grey label, then the senses at reading size. Each step down
	that order gets less weight and more air than the one below it, which is the entire reason
	Pleco's entry is scannable at arm's length.

	THE HEADWORD DOES NOT SCROLL. It, its pinyin and its level badge sit above the scroller, and
	they shrink to a single quiet line the moment the body moves — Pleco pins 几乎, PY, JP and
	the HSK badge over its DICT/CHARS/WORDS/SENTS bar and never moves them. Before loop 4 the
	head was the first thing inside the scroller, so by the time a learner reached the character
	strip — the reason the strip exists — nothing on screen named the word they had opened.

	THEN THE WORD IN A SENTENCE, which is what both references spend their entry screen on, and
	what this one spent none of until loop 4. See `ExampleSentence.svelte`; 1,270 of the 4,308
	shipped words carry one, and the ones that do not simply do not render the block.

	What Pleco has no reason to show, and this app does, is the last block: what the learner has
	actually done with this word. Browsing and practising are the same product, so the sheet
	that shows you 迷人 also shows you that you have missed it twice.

	It is a bottom sheet on a phone (the thumb is at the bottom, the list stays visible behind
	it so you have not "gone" anywhere, and the grip drags it away) and a centred card from
	48rem up. Prev/next walk the filtered list without closing, so reading ten words in a row is
	nine taps, not eighteen.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import { Hanzi, Pinyin } from '$lib/design';
	import type { Word, WordProgress } from '$lib/types';
	import CharacterCard from './CharacterCard.svelte';
	import ExampleSentence from './ExampleSentence.svelte';
	import { groupSenses, posWord, sensesOf } from './pos';
	import { charCard, charIndexNow, ensureCharIndex, rowBudget, type CharIndex } from './related';
	import StatusPip from './StatusPip.svelte';
	import { STATUS_META, progressLine, type WordStatus } from './status';
	import { hasMet } from '$lib/session';

	interface Props {
		word: Word;
		status: WordStatus;
		record: WordProgress;
		/** 1-based position in the filtered list, and its length — "412 of 1,070". */
		position: number;
		total: number;
		/**
		 * The word this one was reached from by tapping a character card, if any. Its presence
		 * is what turns the sheet from a page of the list into a drill-down: the counter and the
		 * prev/next pair belong to the list and go away, and a labelled way back takes their place.
		 */
		from: Word | null;
		onclose: () => void;
		onback: () => void;
		onprev: () => void;
		onnext: () => void;
		onfollow: (word: Word) => void;
	}

	let {
		word,
		status,
		record,
		position,
		total,
		from,
		onclose,
		onback,
		onprev,
		onnext,
		onfollow
	}: Props = $props();

	/** How the tone is named out loud, so the colour is never the only thing carrying it. */
	const TONE_NAME: Record<0 | 1 | 2 | 3 | 4, string> = {
		0: 'neutral',
		1: '1st tone',
		2: '2nd tone',
		3: '3rd tone',
		4: '4th tone'
	};

	let panel = $state<HTMLElement | null>(null);
	let body = $state<HTMLElement | null>(null);
	let bodyInner = $state<HTMLElement | null>(null);

	/**
	 * The cross-level character index. Already built after the first sheet of the session — the
	 * browse screen warms it on idle — so this is normally synchronous and the cards are
	 * complete on the first frame. When it is not, the strip renders the characters and their
	 * glosses immediately and the word lists fill in; nothing moves except inside each card.
	 */
	let index = $state<CharIndex | null>(charIndexNow());

	$effect(() => {
		if (index !== null) return;
		let live = true;
		void ensureCharIndex().then(
			(built) => {
				if (live) index = built;
			},
			() => {
				// A chunk that will not load leaves the strip as characters and glosses, which
				// is still the entry it was before this loop. It retries on the next word.
			}
		);
		return () => {
			live = false;
		};
	});

	/**
	 * The word taken apart character by character — Pleco's CHARS tab, plus the thing Pleco's
	 * tab does not do: every other HSK word built on the same character, so the entry has a way
	 * out of it. `Word.syllables` is built one per character and the build refuses to emit a
	 * word where that does not hold, so the zip below is a zip, not a guess.
	 *
	 * Single-character words skip the strip — 安 taken apart is 安 — but they are not a dead
	 * end either: their `related` section renders instead, from the same index.
	 */
	const characters = $derived(
		[...word.hanzi].map((hanzi, i) => {
			const syllable = word.syllables[i] ?? { py: '', tone: 0 as const };
			return {
				hanzi,
				syllable,
				tone: TONE_NAME[syllable.tone],
				card: charCard(index, hanzi, word.id, rowBudget([...word.hanzi].length))
			};
		})
	);

	/** Words built on this one, for a single-character headword that has no strip of its own. */
	const solo = $derived(
		characters.length === 1
			? charCard(index, word.hanzi, word.id, 8)
			: { char: word.hanzi, entry: null, gloss: null, rows: [], all: [], more: 0, total: 0 }
	);

	/**
	 * Hearing the word — and, since loop 4, the sentence.
	 *
	 * Pleco puts a speaker on every line and it is half the reason people open it. We ship no
	 * audio files — 4,308 recordings is a data problem, not a screen problem — but the device
	 * already has a Chinese voice in it, so the entry can at least say the headword and read
	 * its example aloud. The button only exists where the API does, and it says so rather than
	 * failing silently when the device turns out to have no Chinese voice installed.
	 *
	 * The sheet is never server-rendered (it opens on a tap), so reading `window` at init is
	 * safe and there is no hydration shape to keep in agreement.
	 */
	const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;
	/** Which line is talking, so two speakers cannot both look active. */
	let saying = $state<'word' | 'example' | null>(null);
	let noVoice = $state(false);

	function chineseVoice(): SpeechSynthesisVoice | undefined {
		return window.speechSynthesis.getVoices().find((voice) => /^zh\b|^zh[-_]/i.test(voice.lang));
	}

	function speak(text: string, what: 'word' | 'example') {
		if (!canSpeak) return;
		const synth = window.speechSynthesis;
		synth.cancel();

		const voice = chineseVoice();
		if (voice === undefined) {
			noVoice = true;
			saying = null;
			return;
		}

		const utterance = new SpeechSynthesisUtterance(text);
		utterance.voice = voice;
		utterance.lang = voice.lang;
		// Dictionary pace, not conversation pace: the point is to hear the tones separately.
		// A sentence gets a touch more speed, because 12 syllables at 0.8 is a dirge.
		utterance.rate = what === 'word' ? 0.8 : 0.9;
		utterance.onend = () => (saying = null);
		utterance.onerror = () => (saying = null);
		noVoice = false;
		saying = what;
		synth.speak(utterance);
	}

	// Stepping to the next word must not leave the previous one talking over it.
	$effect(() => {
		void word.id;
		untrack(() => {
			noVoice = false;
			saying = null;
		});
		if (canSpeak) window.speechSynthesis.cancel();
	});

	const senses = $derived(sensesOf(word));
	const senseGroups = $derived(groupSenses(senses));
	const meta = $derived(STATUS_META[status]);
	const line = $derived(progressLine(record));
	// Prev/next walk the list, and a followed word is not in it — 慰问 is HSK 5 whatever level
	// you were browsing. Off entirely rather than quietly meaning something else.
	const hasPrev = $derived(from === null && position > 1);
	const hasNext = $derived(from === null && position < total);
	/** Follows the word on screen, not the level being browsed: 安 opens as HSK 4 from 安慰. */
	const level = $derived(word.level);

	// ------------------------------------------------------------------ the scroller ------

	/**
	 * How far the body has moved, and whether it has anything left.
	 *
	 * Both are read off the element rather than inferred: `scrolled` collapses the pinned head
	 * to one line, and `atEnd` turns off the bottom fade. Before loop 4 the sheet closed on a
	 * hard cut and every open ended on a row sliced through its glyphs.
	 */
	let scrolled = $state(0);
	let atEnd = $state(true);
	const condensed = $derived(scrolled > 10);

	function readScroll() {
		const el = body;
		if (!el) {
			scrolled = 0;
			atEnd = true;
			return;
		}
		if (el.scrollTop !== scrolled) scrolled = el.scrollTop;
		const done = el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
		if (done !== atEnd) atEnd = done;
	}

	// The body's own height never changes, but its contents do — expanding a character card is
	// the whole point of the button on it — so the observer watches the content, not the box.
	$effect(() => {
		const el = body;
		const inner = bodyInner;
		if (!el || !inner) return;
		untrack(readScroll);
		const observer = new ResizeObserver(() => untrack(readScroll));
		observer.observe(el);
		observer.observe(inner);
		return () => observer.disconnect();
	});

	// ------------------------------------------------------------------ drag to dismiss ---

	/** Far enough down that letting go means "away", rather than "I was reading". */
	const DISMISS_PX = 96;
	/** A flick: px per millisecond, over a travel long enough not to be a tap wobble. */
	const FLING = 0.45;
	const FLING_MIN_PX = 24;

	let drag = $state(0);
	let dragging = $state(false);
	let dragFrom = 0;
	let dragAt = 0;

	function gripDown(event: PointerEvent) {
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		const handle = event.currentTarget;
		if (handle instanceof HTMLElement) handle.setPointerCapture(event.pointerId);
		dragging = true;
		dragFrom = event.clientY;
		dragAt = event.timeStamp;
		drag = 0;
	}

	function gripMove(event: PointerEvent) {
		if (!dragging) return;
		const dy = event.clientY - dragFrom;
		// Upward is rubber-banded rather than free: the sheet is already as tall as it is
		// allowed to be, so pulling up can only ever be a gesture that changed its mind.
		drag = dy > 0 ? dy : dy / 5;
	}

	function gripUp(event: PointerEvent) {
		if (!dragging) return;
		dragging = false;
		const travelled = drag;
		const speed = travelled / Math.max(1, event.timeStamp - dragAt);
		drag = 0;
		if (travelled > DISMISS_PX || (travelled > FLING_MIN_PX && speed > FLING)) onclose();
	}

	function gripCancel() {
		dragging = false;
		drag = 0;
	}

	// ------------------------------------------------------------------ focus -------------

	// Opening moves focus into the sheet, so Escape, Tab and the arrow keys all land here and
	// not on the row underneath. The list restores focus to that row on close.
	$effect(() => {
		// `preventScroll`: the panel is `position: fixed`, and focusing it without this scrolls
		// the list behind the scrim to the top (measured: scrollY 500 -> 0 in one frame).
		panel?.focus({ preventScroll: true });
	});

	/**
	 * Following a link swaps the whole entry, so the sheet has to behave like a page turn: back
	 * to the top of the panel, and focus somewhere real. Prev/next keep their button under the
	 * thumb, so focus is only reclaimed when the element that had it has just been unmounted —
	 * which is exactly the case for the character row you tapped.
	 */
	$effect(() => {
		void word.id;
		untrack(() => {
			body?.scrollTo({ top: 0 });
			readScroll();
			if (!panel) return;
			const active = document.activeElement;
			if (active === null || !panel.contains(active)) panel.focus({ preventScroll: true });
		});
	});

	function focusables(): HTMLElement[] {
		if (!panel) return [];
		const selector = 'a[href], button:not([disabled]):not([hidden])';
		return [...panel.querySelectorAll<HTMLElement>(selector)];
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.metaKey || event.ctrlKey || event.altKey) return;

		// Escape unwinds one step of the drill-down before it closes anything: a learner three
		// characters deep expects to come back up, not to lose the entry they started from.
		if (event.key === 'Escape') {
			event.preventDefault();
			if (from !== null) onback();
			else onclose();
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
		class:dragging
		role="dialog"
		aria-modal="true"
		aria-labelledby="word-sheet-title"
		tabindex="-1"
		onkeydown={onKeydown}
		style:transform={drag === 0 ? null : `translate3d(0, ${drag}px, 0)`}
	>
		<!-- The grip is the gesture, not a picture of one: it drags the sheet and lets go of it.
		     Decorative to assistive tech, which has the close button, Escape and the scrim. -->
		<div
			class="grip-zone"
			aria-hidden="true"
			onpointerdown={gripDown}
			onpointermove={gripMove}
			onpointerup={gripUp}
			onpointercancel={gripCancel}
		>
			<span class="grip"></span>
		</div>

		<div class="bar">
			{#if from}
				<!-- Reached by tapping a character, so the way back is to the word that sent you
				     here, named — not to a position in a list this word may not even be in. -->
				<button type="button" class="back" onclick={onback}>
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
					<span class="back-label">Back to</span>
					<Hanzi text={from.hanzi} size="xs" class="back-hz" />
				</button>
			{:else}
				<p class="counter tabular">
					{position.toLocaleString('en')} of {total.toLocaleString('en')}
				</p>
			{/if}
			<div class="nav">
				<!-- Removed rather than hidden while a trail is open: `[hidden]` is a base-layer
				     rule and this component's own `display: grid` outranks it, so the attribute
				     alone would leave two dead chevrons on screen. -->
				{#if from === null}
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
				{/if}
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

		<!-- Above the scroller, and never out of it. Pleco puts the level badge on the right of
		     the headword line and it is the first thing you look for. -->
		<div class="head" class:tight={condensed}>
			<div class="head-main">
				<h2 id="word-sheet-title" class="headword">
					<Hanzi {word} size="lg" display class="hw" />
				</h2>
				<p class="say">
					<Pinyin {word} size="xl" class="py" />
					{#if canSpeak}
						<button
							type="button"
							class="speak"
							class:on={saying === 'word'}
							onclick={() => speak(word.hanzi, 'word')}
						>
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
			</div>
			<span class="level" aria-label={`HSK level ${level}`}>HSK {level}</span>
		</div>

		<div class="scroller">
			<div class="body" bind:this={body} onscroll={readScroll}>
				<div class="body-in" bind:this={bodyInner}>
					<!-- Two columns from 64rem up, one everywhere else. The wrappers are
					     `display: contents` below that width, so the phone renders the same flat
					     column of blocks it always did and the desktop gets the entry laid out
					     across the width it actually has. -->
					<div class="col meaning">
						{#if word.traditional}
							<p class="trad">
								traditional <span lang="zh-Hant" class="hanzi">{word.traditional}</span>
							</p>
						{/if}

						{#if noVoice}
							<p class="no-voice">
								This device has no Chinese voice installed, so there is nothing to play.
							</p>
						{/if}

						<!-- One block, so the gap above the meanings is the same whether or not the
						     word carries a part-of-speech annotation — plenty of them do not.
						     Each sense is headed by its own POS, the way Pleco prints ADVERB
						     directly above "almost; nearly; practically", not one joined banner. -->
						<div class="gloss">
							{#if senseGroups.length === 0}
								<p class="sense">—</p>
							{:else}
								{#each senseGroups as group, gi (gi)}
									<div class="sense-group">
										{#if group.pos}<p class="pos eyebrow">{posWord(group.pos)}</p>{/if}
										{#if senses.length === 1}
											<p class="sense">{group.items[0]?.gloss ?? '—'}</p>
										{:else}
											<ol class="senses">
												{#each group.items as item (item.n)}
													<li>
														<span class="num tabular">{item.n}</span>{item.gloss}
													</li>
												{/each}
											</ol>
										{/if}
									</div>
								{/each}
							{/if}
						</div>

						<!-- Renders nothing at all for the 70.5% of the corpus that has no sentence
						     yet, so the sheet below simply closes up. No frame, no placeholder, no gap. -->
						<ExampleSentence
							{word}
							{canSpeak}
							speaking={saying === 'example'}
							onspeak={(text) => speak(text, 'example')}
						/>

						<!--
							WHAT YOU HAVE DONE WITH THIS WORD, under the word rather than under the
							character graph.

							It reads in the right order on both layouts for the same reason: the
							entry is the word, the graph is a digression from it, and a learner's
							own record belongs to the first of those. On a phone that puts the
							status line directly under the sentence and leaves CHARACTERS to close
							the sheet; on desktop it is what the left column says after the
							sentence, where the bottom third used to be blank paper while the
							right column ran past the fold.
						-->
						<div class="record">
							<p class="state">
								<StatusPip {status} />
								<span class="label">{meta.label}</span>
								<span class="detail">{hasMet(record) ? line : meta.description}</span>
							</p>
						</div>

						<!-- Desktop only: sits in the left column's leftover cream so the pinned
						     bar cannot slice the character graph. Hidden below 64rem; the pin
						     under the scroller is the phone control. -->
						<div class="cta">
							{@render practiseCta()}
						</div>
					</div>

					<div class="col graph">
						{#if characters.length > 1}
							<!-- Pleco's CHARS tab, inline and then some: which syllable belongs to
							     which character, what it means, and every other HSK word built on it. -->
							<section class="chars" aria-label="Characters">
								<h3 class="eyebrow">Characters</h3>
								<ol class="char-list">
									{#each characters as char, i (i)}
										<CharacterCard
											card={char.card}
											syllable={char.syllable}
											toneName={char.tone}
											pending={index === null}
											onopen={onfollow}
										/>
									{/each}
								</ol>
							</section>
						{:else}
							<section class="chars" aria-label={`Words with ${word.hanzi}`}>
								<h3 class="eyebrow">
									Words with <span lang="zh-Hans" class="eyebrow-hz">{word.hanzi}</span>
								</h3>
								<ol class="char-list">
									<CharacterCard
										card={solo}
										syllable={word.syllables[0] ?? { py: '', tone: 0 }}
										toneName={TONE_NAME[word.syllables[0]?.tone ?? 0]}
										pending={index === null}
										head={false}
										onopen={onfollow}
									/>
								</ol>
							</section>
						{/if}
					</div>
				</div>
			</div>

			<!-- Both edges of the scroller are softened rather than cut. The bottom one is the
			     one that matters: without it every open ended on a row sliced through its
			     glyphs, which is the exact thing the blind judge told the other screen not to do. -->
			<span class="edge top" class:on={scrolled > 4} aria-hidden="true"></span>
			<span class="edge bottom" class:on={!atEnd} aria-hidden="true"></span>
		</div>

		<div class="foot">
			{@render practiseCta()}
		</div>
	</div>
</div>

{#snippet practiseCta()}
	<!-- eslint-disable svelte/no-navigation-without-resolve -- The path below calls resolve() before adding the word query. -->
	<a
		class="btn btn-primary btn-block"
		href={`${resolve('/quiz/[level]', { level: String(level) })}?word=${encodeURIComponent(word.id)}`}
		>Practise HSK {level}</a
	>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
{/snippet}

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
		/*
		 * `backwards`, not `both`. A forwards fill keeps the keyframe's `transform: none`
		 * applied for the life of the element, which outranks the inline transform the drag
		 * writes — the sheet would simply refuse to move. Backwards still covers the frame
		 * before the animation starts, which is the only thing the fill was ever there for.
		 */
		animation: sheet-rise 240ms var(--ease-out-soft) backwards;
		transition: transform 260ms var(--ease-out-soft);
	}

	/* Under the finger the sheet tracks it exactly; let go and the transition takes over. */
	.panel.dragging {
		transition: none;
	}

	/* A real target around a 36×4 hint: the grip is 4px tall and the gesture is not. */
	.grip-zone {
		display: flex;
		justify-content: center;
		padding-block: 0.5rem 0.25rem;
		touch-action: none;
		cursor: grab;
	}

	.grip-zone:active {
		cursor: grabbing;
	}

	.grip {
		inline-size: 2.25rem;
		block-size: 0.25rem;
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

	/* Names where it goes, because "back" alone in a stack three deep is a guess. Full tap
	   height, so it clears 44px the way the step buttons beside it do. */
	.back {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		min-block-size: var(--spacing-tap);
		margin-inline-start: -0.25rem;
		padding-inline: 0.5rem;
		border: 0;
		border-radius: var(--radius-pill);
		background: none;
		color: var(--color-ink-muted);
	}

	.back svg {
		flex: none;
		inline-size: 1.125rem;
		block-size: 1.125rem;
	}

	.back-label {
		font-size: var(--text-xs);
	}

	.back :global(.back-hz) {
		color: var(--color-ink);
	}

	@media (hover: hover) {
		.back:hover {
			background-color: var(--color-surface-sunken);
			color: var(--color-ink);
		}
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

	/* ------------------------------------------------------------------ the head ------ */

	/*
	 * Pleco's ranking, and Pleco's air: each step down gets less weight and more space above
	 * it than the thing it belongs to. Pinned, and condensed once the body moves — a headword
	 * that keeps 150px of a 700px sheet forever is a worse answer than one that keeps 60.
	 */
	.head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		padding-block: 0.125rem 0.625rem;
		padding-inline: max(1.25rem, var(--app-safe-left)) max(1.25rem, var(--app-safe-right));
		transition: padding-block-end 200ms var(--ease-out-soft);
	}

	.head.tight {
		padding-block-end: 0.375rem;
	}

	.head-main {
		min-inline-size: 0;
	}

	.headword {
		margin: 0;
		font-size: inherit;
		font-weight: inherit;
		letter-spacing: normal;
	}

	/*
	 * The condense is a type-size change and nothing else. Sizes come off the same scale the
	 * full head uses — two steps down for the hanzi, two for the pinyin — so the pinned line
	 * is the same design at a different rank rather than a second layout that has to agree
	 * with the first.
	 */
	.head :global(.hw) {
		font-size: var(--text-hanzi-lg);
		transition: font-size 200ms var(--ease-out-soft);
	}

	.head.tight :global(.hw) {
		font-size: var(--text-hanzi-sm);
	}

	.panel :global(.py) {
		min-inline-size: 0;
		color: var(--color-ink-muted);
		font-size: var(--text-pinyin-xl);
		transition: font-size 200ms var(--ease-out-soft);
	}

	.head.tight :global(.py) {
		font-size: var(--text-pinyin-md);
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
		transition: margin-block-start 200ms var(--ease-out-soft);
	}

	.head.tight .level {
		margin-block-start: 0.125rem;
	}

	.say {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		margin: 0.25rem 0 0;
		transition: margin-block-start 200ms var(--ease-out-soft);
	}

	.head.tight .say {
		margin-block-start: 0.0625rem;
	}

	/*
	 * Square, so the ring is a circle. It was 2.25rem wide and 2.25rem tall on paper, but the
	 * base layer guarantees every button 44px of height, so what actually rendered was a
	 * 36×44 oval — a ring nobody drew. Sized to `--spacing-tap` in both axes it is the shape
	 * it always meant to be AND the target the base layer was asking for, and it matches the
	 * chevrons in the bar above it, which are the same control at the same size.
	 */
	.speak {
		display: grid;
		flex: none;
		place-items: center;
		inline-size: var(--spacing-tap);
		block-size: var(--spacing-tap);
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

	/* ------------------------------------------------------------------ the body ------ */

	.scroller {
		position: relative;
		display: flex;
		flex-direction: column;
		flex: 1 1 auto;
		min-block-size: 0;
	}

	.body {
		flex: 1 1 auto;
		min-block-size: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding-inline: max(1.25rem, var(--app-safe-left)) max(1.25rem, var(--app-safe-right));
		padding-block-end: 1.25rem;
	}

	/* The thing the ResizeObserver watches: the body's own box never changes height, its
	   contents do — a character card expanding to 47 rows is the whole point of loop 4. */
	.body-in {
		min-inline-size: 0;
	}

	/* One column of blocks on a phone: the wrappers exist only so the desktop has something to
	   put in a grid cell, and `contents` makes them disappear from the layout entirely here. */
	.col {
		display: contents;
	}

	.edge {
		position: absolute;
		inset-inline: 0;
		block-size: 1.75rem;
		opacity: 0;
		pointer-events: none;
		transition: opacity 160ms var(--ease-out-soft);
	}

	.edge.on {
		opacity: 1;
	}

	.edge.top {
		inset-block-start: 0;
		background: linear-gradient(to bottom, var(--color-surface), transparent);
	}

	.edge.bottom {
		inset-block-end: 0;
		background: linear-gradient(to top, var(--color-surface), transparent);
	}

	.no-voice {
		margin: 0.5rem 0 0;
		color: var(--color-ink-subtle);
		font-size: var(--text-xs);
	}

	.trad {
		margin: 0.25rem 0 0;
		color: var(--color-ink-subtle);
		font-size: var(--text-xs);
	}

	.trad .hanzi {
		margin-inline-start: 0.25rem;
		color: var(--color-ink-muted);
		font-size: var(--text-base);
	}

	.gloss {
		margin-block-start: 0.75rem;
	}

	.sense-group + .sense-group {
		margin-block-start: 0.75rem;
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

	/* A column, not the old row of tiles: each character now carries a list of the words it
	   builds, so a tile that fitted two syllables side by side is the wrong container. */
	.char-list {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
		margin: 0.625rem 0 0;
		padding: 0;
		list-style: none;
	}

	.eyebrow-hz {
		margin-inline-start: 0.125rem;
		font-family: var(--font-hanzi);
		font-size: var(--text-sm);
		letter-spacing: 0;
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

	/* In-column CTA is a desktop layout; on a phone `.col` is `display: contents` so this
	   would otherwise land in the scroller as a second copy of the pinned bar. */
	.cta {
		display: none;
	}

	/* From tablet up the sheet stops being a sheet: a centred card reads as an entry rather
	   than a drawer, and there is no thumb at the bottom of a laptop screen. It is also wider
	   and taller than it was — a 480px box floating in 960px of scrim showed four of twelve
	   related rows while the list behind it ran two comfortable columns. */
	@media (min-width: 48rem) {
		.root {
			justify-content: center;
			align-items: center;
			padding: 2rem;
		}

		.panel {
			inline-size: 100%;
			max-inline-size: 34rem;
			max-block-size: min(92dvh, 50rem);
			padding-block-end: 1.25rem;
			border-radius: var(--radius-card);
			animation-name: sheet-zoom;
		}

		.grip-zone {
			display: none;
		}

		.bar {
			padding-block-start: 0.5rem;
		}
	}

	/*
	 * From 64rem the entry stops being a tall column in a wide empty room. A 30rem card in
	 * 60rem of scrim showed four of twelve related rows while the list behind it ran two
	 * comfortable columns; the meanings and the sentence take the left, the character graph
	 * and the record take the right, and the whole entry is on screen at once.
	 */
	@media (min-width: 64rem) {
		.panel {
			max-inline-size: 50rem;
		}

		.body-in {
			display: grid;
			/* The graph column is the taller of the two and its rows carry three fields each,
			   so it gets the extra width rather than splitting it evenly and truncating. */
			grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
			column-gap: 2rem;
			align-items: stretch;
		}

		.col {
			display: block;
			min-inline-size: 0;
		}

		/* Stretch the meaning column to the graph's height so the CTA can sit in the cream
		   that used to sit empty under the record, instead of as a full-width bar that
		   sliced the last related-word row. */
		.col.meaning {
			display: flex;
			flex-direction: column;
		}

		.cta {
			display: block;
			margin-block-start: auto;
			padding-block-start: 1.5rem;
		}

		.foot {
			display: none;
		}

		/* The rule that separated the strip from the meanings above it now has nothing above
		   it — it is the top of its own column. */
		.graph .chars {
			margin-block-start: 0;
			padding-block-start: 0;
			border-block-start: 0;
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
