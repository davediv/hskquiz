<!--
	The end of a run — the screen where a learner decides whether to do another one.

	THE PRIMARY DRILLS THE WORDS THIS SCREEN JUST NAMED
	A screen headed "3 words to review" has to be able to review them. Until now the only primary
	was "Practise 10 more", which is `buildSession` drawing a fresh weighted run: six review slots
	shared across every word ever met, four brand-new ones, and the three misses merely *likely*
	to reappear and diluted when they do. The primary is now "Practise these 3 again" and it runs
	exactly those three, here, without leaving the page (`ReviewDrill`, cards from `drill.ts`).
	"Practise 10 more" keeps its place as the quiet half of the row, which is the right weight for
	it: more words is the second thing you want after the ones you just got wrong.

	The result folds back into the list in place — a fixed word keeps its position and its size
	and turns from ✕ Not quite to ✓ Fixed, and the heading counts down. Nothing reorders under a
	thumb; the screen visibly heals, which is the reward the old "Practise 10 more" never paid.

	`Levels` left the sticky row: the app bar already carries a back control, and a way out does
	not deserve half the width of the way on. It is a quiet link at the end of the page.

	ONE CARD, ONE SIZE, EVERYWHERE A WORD APPEARS
	Every word on this screen is a `WordCard`, and every card measures its own column and sets
	the headword at the quiz question's own ceiling — 119.38px on a 375×812 phone, the number a
	question card lands on there. The rule this screen is built on: the teaching moment is never
	smaller than the testing moment, and nothing that congratulates you is ever larger than a
	word being taught — the 满分/继续 mark is 26px, a fifth of the card it sits above. Where the
	word has an authored example sentence the card carries it; 70.5% of the corpus has none yet
	and those cards simply end sooner.

	AND THE CARD OPENS, INSTEAD OF LEAVING
	`Entry` on a card used to be a link to `/browse/[level]?q=…`, which took the learner off
	`/quiz/[level]` — and returning rebuilt the run, so the summary, the review list and every
	drill result were destroyed one tap from the results. It opens the app's own `WordSheet`
	over this screen now: numbered senses, the character breakdown, the word's family, the
	record. Nothing navigates, the scroll does not move, and closing hands focus back to the
	chip. The sheet's ← → walk every word on this screen, misses first.

	WHY THE MARK IS A CHINESE WORD, AND WHY IT IS SMALL
	Finishing has to feel like it counted without turning into a sticker, so the reward is more
	vocabulary: 满分 / 不错 / 继续 / 加油, set the way every word in this app is set — hanzi,
	pinyin, gloss — on one line, at a third of the size of the cards below it. It is a signature
	on the receipt, not the point of the page. The pinyin for the three that are on the official
	list is theirs verbatim (búcuò, jìxù, jiā yóu); 满分 is not an HSK 1–5 word but every learner
	who just scored one should meet it.

	WHY THE PERCENTAGE IS ABSENT, AND WHY THE LEVEL FIGURE IS ONE LINE AT THE FOOT
	One session's accuracy is noise — ten questions, weighted toward what you keep missing, so a
	bad run often means the scheduler is working. What does mean something is the level total:
	how much of it you have met and how much is mastered. It moves by a word or two per session,
	which is the honest amount — and it is a *sentence*, under the decision, not a chart above
	the words. As a boxed two-tone track it was the single biggest thing between the top of the
	screen and the first card (387px of an 812px phone), and at 40 of 500 the bar is a 26px stub
	whose grey half is entirely covered by its green half. A chart that cannot draw its own
	difference is a line of text with a picture around it.

	Tone colour rides on the pinyin, one hue per syllable, read from `Word.syllables` — the mark
	included, whose syllables are written out below because the four marks are not in the shipped
	data. The characters themselves stay in ink; see the note at the top of `layout.css` for why
	the system puts tone in exactly one place.
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { resolve } from '$app/paths';
	import type { Session, Syllable, Word } from '$lib/types';
	import { Hanzi, Pinyin } from '$lib/design';
	import { isCorrect, isScored } from '$lib/session';
	import { progress } from '$lib/progress';
	import WordSheet from '$lib/components/browse/WordSheet.svelte';
	import { statusOf } from '$lib/components/browse/status';
	import WordCard from './WordCard.svelte';
	import ReviewDrill from './ReviewDrill.svelte';
	import {
		buildDrill,
		drillPool,
		tallyDrill,
		type DrillCard,
		type DrillOutcome,
		type DrillSeed
	} from './drill';

	interface Props {
		/** The finished run. Every figure on this screen is derived from it. */
		session: Session;
		/** Build another session at the same level. */
		onRestart: () => void;
		/** Leave for level select. */
		onHome: () => void;
	}

	let { session, onRestart, onHome }: Props = $props();

	/**
	 * The mark at the top of the screen: a real word, chosen by the run that earned it.
	 *
	 * Shaped as the design system's word primitives want it — hanzi plus one syllable per
	 * character — so the mark is tone-coloured by exactly the same code path as every other word
	 * here rather than being a special case that happens to look similar. 不错 carries bú, the
	 * sandhi form the official list prints, not bù.
	 */
	interface Mark {
		hanzi: string;
		pinyin: string;
		syllables: readonly Syllable[];
		gloss: string;
	}

	const MARKS: Record<'full' | 'good' | 'fair' | 'low' | 'start', Mark> = {
		/* A run that asked nothing has no score to mark, so it is marked as what it was. */
		start: {
			hanzi: '开始',
			pinyin: 'kāishǐ',
			syllables: [
				{ py: 'kāi', tone: 1 },
				{ py: 'shǐ', tone: 3 }
			],
			gloss: 'a start'
		},
		full: {
			hanzi: '满分',
			pinyin: 'mǎnfēn',
			syllables: [
				{ py: 'mǎn', tone: 3 },
				{ py: 'fēn', tone: 1 }
			],
			gloss: 'full marks'
		},
		good: {
			hanzi: '不错',
			pinyin: 'búcuò',
			syllables: [
				{ py: 'bú', tone: 2 },
				{ py: 'cuò', tone: 4 }
			],
			gloss: 'not bad'
		},
		fair: {
			hanzi: '继续',
			pinyin: 'jìxù',
			syllables: [
				{ py: 'jì', tone: 4 },
				{ py: 'xù', tone: 4 }
			],
			gloss: 'keep going'
		},
		low: {
			hanzi: '加油',
			pinyin: 'jiā yóu',
			syllables: [
				{ py: 'jiā', tone: 1 },
				{ py: 'yóu', tone: 2 }
			],
			gloss: 'keep at it'
		}
	};

	function markFor(correct: number, total: number): Mark {
		if (total > 0 && correct === total) return MARKS.full;
		const share = total > 0 ? correct / total : 0;
		if (share >= 0.8) return MARKS.good;
		if (share >= 0.5) return MARKS.fair;
		return MARKS.low;
	}

	/**
	 * The words this run *taught* — shown whole, asked nothing.
	 *
	 * They are not results and must never be counted as any: an introduction has no answer, so
	 * scoring it lands on `right: false` and the screen reports a word the learner was never
	 * asked as one they got wrong. A first-ever session is ten of them, and it used to end on
	 * "0 of 10 correct · 10 words to review" over an offer to drill ten words the app had
	 * introduced ninety seconds earlier.
	 */
	const taught = $derived(session.questions.filter((question) => !isScored(question)));

	const results = $derived(
		session.questions
			.map((question, index) => {
				const picked: Word | null = session.answers[index] ?? null;
				return {
					question,
					word: question.word,
					direction: question.direction,
					picked,
					right: isCorrect(question, picked)
				};
			})
			.filter((result) => isScored(result.question))
	);

	/** Questions asked. A teach card is not one, so it is not in the denominator either. */
	const total = $derived(results.length);
	const missed = $derived(results.filter((result) => !result.right));
	const solved = $derived(results.filter((result) => result.right));
	const skipped = $derived(missed.filter((result) => result.picked === null).length);
	const mark = $derived(total === 0 ? MARKS.start : markFor(solved.length, total));
	/** A run that only taught — every first session is one. Nothing was asked, so nothing scored. */
	const firstLook = $derived(total === 0 && taught.length > 0);
	/**
	 * The quiet "more words" primary. After a first look the honest offer is not "again" — that
	 * round asked nothing — it is the round that finally tests what was just introduced.
	 */
	const nextLabel = $derived(
		firstLook
			? `Practise these ${taught.length}`
			: total > 0
				? `Practise ${total} more`
				: 'Practise again'
	);

	/**
	 * What a finished drill left behind: word id to how the re-test went and what was chosen.
	 * Declared with the other session-wide reads because `headline` and the review heading both
	 * count off `pending` — the misses that are still misses. See THE DRILL below for what
	 * writes it.
	 */
	let redone = $state<Record<string, DrillOutcome>>({});
	const pending = $derived(missed.filter((result) => redone[result.word.id]?.right !== true));

	// Progress lives in localStorage, so the server has an empty store and the client a full
	// one. The arc is held back until after hydration — the block keeps its height either way,
	// so the numbers arriving never move the review list underneath them.
	// `onMount` rather than `$effect`: this is a "the client is now running" latch, not a value
	// derived from anything, and an effect that only ever assigns trips
	// `svelte/prefer-writable-derived`.
	let hydrated = $state(false);

	onMount(() => {
		hydrated = true;
	});

	const arc = $derived(hydrated ? progress.levelSummary(session.level) : null);

	// Counts what is still red, so a drill that fixes two words changes what a screen reader
	// hears on a re-read as well as what the heading says.
	const headline = $derived.by(() => {
		if (firstLook) {
			const noun = taught.length === 1 ? 'word' : 'words';
			return `HSK ${session.level} — ${taught.length} new ${noun} introduced`;
		}
		if (total === 0) return `HSK ${session.level} session ended`;
		return (
			`HSK ${session.level} session complete — ${solved.length} of ${total} correct, ` +
			`${pending.length} to review`
		);
	});

	// Built here rather than out of `{#if}` blocks in the markup: an interpolated separator
	// inside a block loses the space in front of it, and `7 of 10 correct· 1 unanswered` is
	// exactly the kind of thing nobody sees until it ships.
	const scoreRest = $derived(
		`of ${total} correct` + (skipped > 0 ? ` · ${skipped} unanswered` : '')
	);

	// The run is over and the last answer button has just been removed from the DOM, so focus
	// has fallen to <body>. Move it here, which is what puts a screen reader at the top of the
	// results instead of nowhere. If anything else already holds focus — the route managing it
	// itself — leave it alone.
	let panel: HTMLElement | null = $state(null);

	$effect(() => {
		const node = panel;
		if (!node) return;
		const active = document.activeElement;
		if (active && active !== document.body) return;
		node.focus();
	});

	/*
	 * THE DRILL
	 *
	 * `redone` is the only thing a finished drill leaves behind on this screen — word id to how
	 * the re-test went and what was chosen. The cards keep their order and their size and change
	 * one label, so the list heals rather than rearranging itself; `pending` is what is still
	 * red, and it is what the primary button offers to run next.
	 *
	 * The learner's *record* is written by the drill itself, one `recordAnswer` per answer, so
	 * leaving halfway keeps every answer given — the map below is presentation, never the truth.
	 */
	let drilling = $state(false);
	let deck = $state<DrillCard[]>([]);
	/** How the last finished drill went, for the line under the heading. */
	let lastDrill = $state<{ right: number; total: number } | null>(null);
	let reviewTitle: HTMLElement | null = $state(null);

	function startDrill(targets: readonly (typeof missed)[number][]) {
		const seeds: DrillSeed[] = targets.map((result) => ({
			word: result.word,
			direction: result.direction,
			// The confusion worth breaking is the most recent one, not the oldest.
			picked: redone[result.word.id]?.picked ?? result.picked
		}));
		if (seeds.length === 0) return;
		// Undrawn each time, from an unseeded `Math.random`: a second pass on the same words is a
		// different set of wrong answers, so it cannot be answered by remembering last time's.
		deck = buildDrill(seeds, drillPool(session.questions));
		lastDrill = null;
		drilling = true;
	}

	function closeDrill(outcomes: Record<string, DrillOutcome>) {
		const tally = tallyDrill(outcomes);
		if (tally.total > 0) {
			redone = { ...redone, ...outcomes };
			lastDrill = { right: tally.right, total: tally.total };
		}
		drilling = false;
		deck = [];
		// The drill's own controls have just left the DOM, so focus is on <body>. The heading is
		// the right place to land: it is the sentence that just changed.
		void tick().then(() => reviewTitle?.focus());
	}

	/*
	 * THE ENTRY SHEET
	 *
	 * Tapping `Entry` on a card used to be a real link to `/browse/[level]?q=…`. That left the
	 * route, and coming back re-entered `/quiz/[level]`, whose mount effect builds a brand-new
	 * run — so the summary, the review list and every drill result were gone, unrecoverably, one
	 * tap from the results. The chip opens the app's own `WordSheet` over the results instead:
	 * nothing navigates, so nothing can be lost, and the destination is the full entry (numbered
	 * senses, the character breakdown, the word's family, your record with it) rather than a
	 * filtered list one tap short of it.
	 *
	 * The sheet walks every word on the screen in the order they are stacked — misses first,
	 * then the ones you got, then anything this run introduced — so reading the whole summary is
	 * one tap and then arrows, the way the browse list already behaves.
	 */
	const sheetWords = $derived([
		...missed.map((result) => result.word),
		...solved.map((result) => result.word),
		...taught.map((question) => question.word)
	]);

	/** Which of `sheetWords` is open, or `null` for closed. */
	let sheetAt = $state<number | null>(null);
	/** Words reached by tapping a character inside the sheet. The last one is what is shown. */
	let trail = $state<Word[]>([]);
	/** How deep a character drill-down may go before the oldest step is dropped. */
	const TRAIL_MAX = 8;
	/** The control that opened the sheet, so closing hands focus back to the card it came from. */
	let opener: HTMLElement | null = null;

	const openWord = $derived(sheetAt === null ? null : (sheetWords[sheetAt] ?? null));
	const sheetWord = $derived(trail.length > 0 ? trail[trail.length - 1] : openWord);
	const sheetFrom = $derived(
		trail.length > 1 ? trail[trail.length - 2] : trail.length === 1 ? openWord : null
	);

	function openSheet(word: Word) {
		const at = sheetWords.findIndex((candidate) => candidate.id === word.id);
		if (at < 0) return;
		const active = document.activeElement;
		opener = active instanceof HTMLElement ? active : null;
		trail = [];
		sheetAt = at;
	}

	function closeSheet() {
		sheetAt = null;
		trail = [];
		// Nothing scrolled — the sheet is `position: fixed` over the results — so the only thing
		// to put back is focus, on the chip that opened it.
		const back = opener;
		opener = null;
		void tick().then(() => back?.focus());
	}

	function stepSheet(delta: number) {
		if (sheetAt === null || trail.length > 0) return;
		const next = sheetAt + delta;
		if (next < 0 || next >= sheetWords.length) return;
		sheetAt = next;
	}

	function followWord(word: Word) {
		if (word.id === sheetWord?.id) return;
		const next = [...trail, word];
		trail = next.length > TRAIL_MAX ? next.slice(next.length - TRAIL_MAX) : next;
	}

	function backSheet() {
		if (trail.length === 0) return;
		trail = trail.slice(0, -1);
	}

	/** Where a link to "this level's quiz" points, for the one below. */
	const quizPath = $derived(resolve('/quiz/[level]', { level: String(session.level) }));

	/**
	 * The sheet's footer is the browse screen's call to action — "Practise HSK n", a link to
	 * `/quiz/[level]`. On the browse list that is exactly right. Opened from the results of a
	 * run at that same level it is a link to the page it is already on: SvelteKit navigates,
	 * the route's params do not change, nothing rebuilds, and a full-width black button does
	 * nothing at all. What that button means here is the "{n} more" already on the glass behind
	 * it, so that is what it does — in place, with no navigation, exactly like every other
	 * control on this screen.
	 *
	 * Scoped to this level and nothing else: a character drill-down can reach 重要 at HSK 2, and
	 * "Practise HSK 2" from there is a real request to go somewhere else, spelled out on the
	 * button. It is left alone. A cleaner version of this is an `onpractise` prop on `WordSheet`
	 * itself, which is not this component's file to change.
	 */
	function practiseHere(event: MouseEvent) {
		if (event.defaultPrevented || event.button !== 0) return;
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		const target = event.target;
		if (!(target instanceof Element)) return;
		const link = target.closest('a[href]');
		if (!(link instanceof HTMLAnchorElement) || link.pathname !== quizPath) return;
		event.preventDefault();
		closeSheet();
		onRestart();
	}
</script>

<div class="summary" bind:this={panel} tabindex="-1">
	<h1 class="sr-only">{headline}</h1>

	{#if firstLook}
		<!-- Nothing was asked, so there is no score, no rail and nothing to review. The whole
		     screen is the words themselves, at the size the reveal showed them, and one line
		     saying what happens next. -->
		<header class="crest">
			<p class="eyebrow">First look</p>
			<p class="mark">
				<Hanzi text={mark.hanzi} syllables={mark.syllables} size="sm" display />
				<Pinyin pinyin={mark.pinyin} syllables={mark.syllables} size="sm" />
				<span class="mark-gloss">{mark.gloss}</span>
			</p>
		</header>

		<section aria-labelledby="summary-review">
			<h2 id="summary-review" class="section-title">
				{taught.length}
				{taught.length === 1 ? 'new word' : 'new words'}
			</h2>
			<p class="drill-note">
				These were shown, not tested — nothing here counts against you. The next round asks them.
			</p>
			<ul class="cards">
				{#each taught as question, i (question.word.id)}
					<WordCard
						word={question.word}
						outcome="right"
						verdict={false}
						index={i}
						onentry={openSheet}
					/>
				{/each}
			</ul>
		</section>
	{:else if total === 0}
		<p class="empty">This session had no questions in it. Pick a level and start another one.</p>
	{:else}
		<header class="crest">
			<p class="eyebrow">Session complete</p>
			<p class="mark">
				<Hanzi text={mark.hanzi} syllables={mark.syllables} size="sm" display />
				<Pinyin pinyin={mark.pinyin} syllables={mark.syllables} size="sm" />
				<span class="mark-gloss">{mark.gloss}</span>
			</p>
		</header>

		<section class="score" aria-label="Score">
			<p class="score-line">
				<strong class="tabular">{solved.length}</strong>
				{scoreRest}
			</p>
			<div class="rail" aria-hidden="true">
				{#each results as result, i (i)}
					<span
						class="seg"
						class:right={result.right}
						class:wrong={!result.right && result.picked !== null}
					></span>
				{/each}
			</div>
		</section>

		<section aria-labelledby="summary-review">
			{#if missed.length > 0}
				<!-- Counts what is still red, so a fixed word is subtracted from the sentence at the
				     same moment its card turns green. `tabindex` because this is where focus lands
				     when a drill closes — it is the line that just changed. -->
				<h2 id="summary-review" class="section-title" bind:this={reviewTitle} tabindex="-1">
					{#if pending.length === 0}
						All {missed.length}
						{missed.length === 1 ? 'word' : 'words'} fixed
					{:else}
						{pending.length}
						{pending.length === 1 ? 'word' : 'words'} to review
					{/if}
				</h2>

				{#if lastDrill}
					<p class="drill-note" class:cleared={pending.length === 0}>
						Drilled {lastDrill.total} · {lastDrill.right} right
						{#if pending.length === 0}— the list is clear.{/if}
					</p>
				{/if}

				{#if drilling}
					<ReviewDrill cards={deck} onfinish={closeDrill} oncancel={closeDrill} />
				{:else}
					<ul class="cards">
						{#each missed as result, i (result.word.id)}
							<WordCard
								word={result.word}
								outcome="wrong"
								picked={redone[result.word.id]?.right === false
									? redone[result.word.id].picked
									: result.picked}
								direction={result.direction}
								drilled={redone[result.word.id]?.right ?? null}
								index={i}
								onentry={openSheet}
							/>
						{/each}
					</ul>
				{/if}
			{:else}
				<!-- A clean run has one job left: show the ten words at full size, so the heading is
				     the one line on the screen that is not the score. It used to be "Nothing to
				     review" (24px bold, the largest type on the page, and negative) over "All 10
				     right. The set is below…" over a "10 answered correctly" disclosure — the
				     same fact three more times, above the vocabulary it was pushing off the fold. -->
				<h2 id="summary-review" class="section-title">Read them once more</h2>
			{/if}
		</section>

		{#if solved.length > 0}
			{#if missed.length === 0}
				<!-- No disclosure on a clean run: `10 answered correctly` under `All 10 right` is the
				     same fact twice, and it cost a 44px row above the first card. -->
				<ul class="cards cards-solved">
					{#each solved as result, i (result.word.id)}
						<WordCard
							word={result.word}
							outcome="right"
							verdict={false}
							index={i}
							onentry={openSheet}
						/>
					{/each}
				</ul>
			{:else}
				<details class="solved">
					<summary>
						<svg class="chev" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
							<path
								d="m4 6 4 4 4-4"
								fill="none"
								stroke="currentColor"
								stroke-width="1.8"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
						{solved.length} answered correctly
					</summary>
					<ul class="cards">
						{#each solved as result, i (result.word.id)}
							<WordCard
								word={result.word}
								outcome="right"
								verdict={false}
								index={i}
								onentry={openSheet}
							/>
						{/each}
					</ul>
				</details>
			{/if}
		{/if}

		<!-- A mixed run: some words were asked, some were met for the first time. The new ones
		     are neither right nor wrong, so they are folded away under their own count rather
		     than joining a list that carries a verdict. -->
		{#if taught.length > 0}
			<details class="solved">
				<summary>
					<svg class="chev" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
						<path
							d="m4 6 4 4 4-4"
							fill="none"
							stroke="currentColor"
							stroke-width="1.8"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
					{taught.length} shown for the first time
				</summary>
				<ul class="cards">
					{#each taught as question, i (question.word.id)}
						<WordCard
							word={question.word}
							outcome="right"
							verdict={false}
							index={i}
							onentry={openSheet}
						/>
					{/each}
				</ul>
			</details>
		{/if}
	{/if}

	<!--
		The decision, in the order it is actually wanted: the words you just got wrong, then more
		words. The drill hides the row entirely — it has its own continue button, and two primaries
		on one screen is one too many.

		THE PRIMARY NEVER CONTRADICTS THE HEADING ABOVE IT. It used to fall back to the whole set
		of misses once the list was clear, so a screen headed "All 3 words fixed — the list is
		clear" carried a black "Practise these 3 again". With nothing left to fix the honest
		offer is more words, and the drill drops to the quiet half as a redo.
	-->
	{#if !drilling}
		<div class="actions">
			{#if pending.length > 0}
				<button type="button" class="btn btn-primary flex-1" onclick={() => startDrill(pending)}>
					{pending.length === 1
						? 'Practise this one again'
						: `Practise these ${pending.length} again`}
				</button>
				<!-- Two words on the glass, the whole sentence in the accessible name: the row has
				     room for one long label and the primary has taken it. -->
				<button
					type="button"
					class="btn btn-quiet shrink-0"
					aria-label="Practise {total} more questions from HSK {session.level}"
					onclick={onRestart}
				>
					{total} more
				</button>
			{:else if missed.length > 0}
				<button type="button" class="btn btn-primary flex-1" onclick={onRestart}>
					{nextLabel}
				</button>
				<button
					type="button"
					class="btn btn-quiet shrink-0"
					aria-label="Run the {missed.length} fixed {missed.length === 1
						? 'word'
						: 'words'} once more"
					onclick={() => startDrill(missed)}
				>
					Redo {missed.length}
				</button>
			{:else}
				<button type="button" class="btn btn-primary flex-1" onclick={onRestart}>
					{nextLabel}
				</button>
			{/if}
		</div>

		<!--
			The one figure that outlives the session, and the only line on this screen measured
			against the whole level rather than the ten questions.

			It was a boxed block with a two-tone track and a legend, directly above the review
			heading, and it cost 387px of an 812px phone before the first word. At 40 of 500 the
			bar is a 26px stub whose grey half is entirely hidden under its green half — a chart
			that cannot draw its own difference — and the number was already written in words on
			the line beside it. So it is a sentence, and it is at the end of the page where a
			cumulative figure belongs: the screen now opens on the words.
		-->
		{#if arc && arc.seen > 0}
			<p class="tally">
				<span class="tally-k">HSK {session.level}</span>
				<span
					><strong class="tabular">{arc.seen.toLocaleString('en')}</strong> of
					<span class="tabular">{arc.total.toLocaleString('en')}</span> words met</span
				>
				<span aria-hidden="true">·</span>
				<span><span class="tabular">{arc.mastered.toLocaleString('en')}</span> mastered</span>
			</p>
		{/if}

		<p class="way-out">
			<button type="button" class="leave" onclick={onHome}>
				All levels<span class="sr-only"> — back to level select</span>
			</button>
			{#if total > 0 || firstLook}
				<span aria-hidden="true">·</span>
				<a class="leave" href={resolve('/browse/[level]', { level: String(session.level) })}>
					Browse HSK {session.level}
				</a>
			{/if}
		</p>
	{/if}
</div>

<!--
	Opened by the `Entry` chip on any card, over the results rather than instead of them. The
	whole screen's vocabulary is the list it walks, so ← → step from one missed word to the next
	without closing, and a character tapped inside it pushes onto `trail` exactly as it does on
	the browse screen — same component, same behaviour, no second implementation.
-->
{#if sheetWord !== null}
	<div onclickcapture={practiseHere}>
		<WordSheet
			word={sheetWord}
			status={statusOf(progress.forWord(sheetWord.id))}
			record={progress.forWord(sheetWord.id)}
			position={(sheetAt ?? 0) + 1}
			total={sheetWords.length}
			browseLevel={session.level}
			from={sheetFrom}
			onclose={closeSheet}
			onback={backSheet}
			onprev={() => stepSheet(-1)}
			onnext={() => stepSheet(1)}
			onfollow={followWord}
		/>
	</div>
{/if}

<style>
	/*
	 * The screen owns its column. The shell deliberately sets no measure and no gutter, and a
	 * results list that runs to the edge of a phone reads as a crash rather than a design.
	 */
	.summary {
		inline-size: 100%;
		max-inline-size: var(--container-app);
		margin-inline: auto;
		padding-inline: var(--spacing-gutter);
		padding-block-start: 1.25rem;
		/* Focusing this panel scrolls it into view, and the app bar is sticky over the top of
		   the scroll port — without this the eyebrow lands underneath it. */
		scroll-margin-block-start: calc(var(--app-safe-top) + var(--app-header-h) + 0.75rem);
		outline: none;
	}

	.empty {
		margin: 2rem 0;
		text-align: center;
		color: var(--color-ink-muted);
	}

	.crest {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
	}

	/* One line: hanzi, pinyin, gloss. Deliberately a third of the size of the cards below — a
	   congratulation that outsizes the vocabulary is a sticker. */
	.mark {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0 0.5rem;
		margin: 0.375rem 0 0;
	}

	.mark-gloss {
		font-size: var(--text-sm);
		color: var(--color-ink-muted);
	}

	.score {
		margin-block-start: 1rem;
	}

	.score-line {
		margin: 0 0 0.5rem;
		text-align: center;
		font-size: var(--text-sm);
		color: var(--color-ink-muted);
	}

	.score-line strong {
		font-size: var(--text-lg);
		font-weight: 700;
		color: var(--color-ink);
	}

	/* The rail from the quiz screen, finished. Same language, no counters. */
	.rail {
		display: flex;
		gap: 0.1875rem;
	}

	.seg {
		flex: 1 1 0;
		block-size: 0.375rem;
		border-radius: var(--radius-pill);
		background-color: var(--color-surface-sunken);
	}

	.seg.right {
		background-color: var(--color-correct);
	}

	.seg.wrong {
		background-color: var(--color-wrong);
	}

	@media (prefers-contrast: more) {
		.seg {
			outline: 1px solid var(--color-line-strong);
			outline-offset: -1px;
		}
	}

	/*
	 * The level line, under the decision rather than above the words. One sentence, no track:
	 * see the note beside it in the markup for why the chart it replaced could not draw itself.
	 */
	.tally {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.25rem 0.5rem;
		margin: 1rem 0 0;
		font-size: var(--text-sm);
		color: var(--color-ink-subtle);
	}

	.tally strong {
		font-weight: 700;
		color: var(--color-ink-muted);
	}

	.tally-k {
		font-size: var(--text-2xs);
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.section-title {
		margin: 1.375rem 0 0.875rem;
		font-size: var(--text-xl);
		text-wrap: balance;
		outline: none;
	}

	/*
	 * The one line the drill leaves behind. Green only when the list is actually clear — a
	 * "2 right" that still leaves one red word is a fact, not a congratulation.
	 */
	.drill-note {
		margin: -0.5rem 0 0.875rem;
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--color-ink-muted);
	}

	.drill-note.cleared {
		color: var(--color-correct);
	}

	/*
	 * ONE CARD PER ROW, AT EVERY WIDTH THIS SCREEN IS GIVEN.
	 *
	 * Two missed words side by side on a desktop is the right answer and it is not available
	 * from here: `main.quiz` caps the whole route at `--container-app` (34rem), so a two-column
	 * grid inside it produces two 250px cards whose head rows — a verdict label plus two 44px
	 * pills that may not shrink — overflow into each other. Tried, measured, reverted. The grid
	 * declaration stays because the fix is one number in the route, not a rewrite here.
	 */
	.cards {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		align-items: start;
		gap: 0.75rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.cards-solved {
		margin-block-start: 0.875rem;
	}

	.solved {
		margin-block-start: 1.5rem;
		border-block-start: 1px solid var(--color-line);
	}

	.solved summary {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-block-size: var(--spacing-tap);
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--color-ink-muted);
		list-style: none;
	}

	.solved summary::-webkit-details-marker {
		display: none;
	}

	.chev {
		inline-size: 1rem;
		block-size: 1rem;
		transition: rotate 180ms var(--ease-out-soft);
	}

	.solved[open] .chev {
		rotate: 180deg;
	}

	.solved[open] summary {
		margin-block-end: 0.375rem;
	}

	/*
	 * "Go again" is the decision this screen exists to put in front of someone, so it stays on
	 * the glass while the review list scrolls under it, and lands at the end of the page when
	 * the list is short. `Levels` is the compact half of the same row the level cards use —
	 * the app bar already carries a back control, so this one is a courtesy, not the only way out.
	 */
	.actions {
		position: sticky;
		inset-block-end: 0;
		z-index: 10;
		display: flex;
		gap: 0.625rem;
		/* Deep enough that the fade above it lands entirely in this gap once the page is scrolled
		   to the end — the last block on the page is never the one left dimmed. */
		margin-block-start: 3.5rem;
		padding-block: 0.875rem;
		padding-block-end: max(0.875rem, var(--app-safe-bottom));
		background-color: var(--color-page);
	}

	/*
	 * The quiet half is narrowed so the primary's own label fits on one line: at 375px the row
	 * is 335px, and `Practise these 3 again` needs 178 of the 195 this leaves it.
	 */
	.actions .btn-quiet {
		padding-inline: 0.875rem;
	}

	.actions .btn-primary {
		white-space: nowrap;
	}

	/*
	 * 320px: `Practise these 3 again` beside `10 more` wants 273px of a 240px row, and the row
	 * was running off the screen. The label wraps to two lines inside its own pill instead —
	 * still one row, still one decision, and the quiet half keeps its full tap target.
	 */
	@media (max-width: 22.5rem) {
		.actions .btn-primary {
			white-space: normal;
		}

		.actions .btn-quiet {
			padding-inline: 0.625rem;
		}
	}

	/*
	 * The fade above the sticky row. It was 36px of `page → transparent`: a linear ramp reaches
	 * full opacity only in its last few pixels, so it cut whatever was under it clean in half —
	 * a judge caught it slicing `dì fāng` through the middle of the glyphs. Now 52px, eased, and
	 * sitting inside a 56px gap: by the time it is opaque enough to erase a letterform there is
	 * no letterform under it, and at the end of the scroll it lands in that gap rather than on
	 * the last block of the page.
	 */
	.actions::before {
		content: '';
		position: absolute;
		inset-inline: 0;
		inset-block-end: 100%;
		block-size: 3.25rem;
		background: linear-gradient(
			to top,
			var(--color-page) 0%,
			color-mix(in oklab, var(--color-page) 90%, transparent) 30%,
			color-mix(in oklab, var(--color-page) 50%, transparent) 66%,
			transparent 100%
		);
		pointer-events: none;
	}

	/*
	 * The ways out, at the end of the page rather than in the sticky row. Leaving is always
	 * available — the app bar carries a back control — so it does not deserve a third of the
	 * width of the thing this screen exists to offer. Both are `--spacing-tap` tall.
	 */
	.way-out {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		margin: 0.25rem 0 0.75rem;
		font-size: var(--text-sm);
		color: var(--color-ink-subtle);
	}

	.leave {
		display: inline-flex;
		align-items: center;
		min-block-size: var(--spacing-tap);
		padding-inline: 0.25rem;
		color: var(--color-ink-muted);
		font-size: var(--text-sm);
		font-weight: 600;
		text-decoration: none;
		border-block-end: 1px solid transparent;
	}

	@media (hover: hover) {
		.leave:hover {
			color: var(--color-ink);
			border-block-end-color: var(--color-line-strong);
		}
	}
</style>
