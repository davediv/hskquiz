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
	Every word on this screen is a `WordCard`, and every card sets its hanzi from the app's shared
	`headwordSize()`. A missed 干 comes back at 82px on a phone rather than a polite 48px, and the
	ten words of a clean run are that same card rather than a grey two-column receipt. The rule
	this screen is built on: the teaching moment is never smaller than the testing moment, and
	nothing that congratulates you is ever larger than a word being taught — the 满分/继续 mark
	is 26px, a third of the card it sits above.

	WHY THE MARK IS A CHINESE WORD, AND WHY IT IS SMALL
	Finishing has to feel like it counted without turning into a sticker, so the reward is more
	vocabulary: 满分 / 不错 / 继续 / 加油, set the way every word in this app is set — hanzi,
	pinyin, gloss — on one line, at a third of the size of the cards below it. It is a signature
	on the receipt, not the point of the page. The pinyin for the three that are on the official
	list is theirs verbatim (búcuò, jìxù, jiā yóu); 满分 is not an HSK 1–5 word but every learner
	who just scored one should meet it.

	WHY THE PERCENTAGE IS ABSENT AND THE LEVEL ARC IS NOT
	One session's accuracy is noise — ten questions, weighted toward what you keep missing, so a
	bad run often means the scheduler is working. What does mean something is the arc: how much of
	the level you have met and how much of it is mastered. It moves by a word or two per session,
	which is the honest amount. It reads on a different scale from the ten-segment session rail
	above it, so it is labelled, two-toned and captioned rather than left to look like a second
	score bar that failed to fill.

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
	import WordCard from './WordCard.svelte';
	import ReviewDrill from './ReviewDrill.svelte';
	import { buildDrill, drillPool, type DrillCard, type DrillSeed } from './drill';

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
	 * What a finished drill left behind: word id to whether the re-test got it. Declared with the
	 * other session-wide reads because `headline` and the review heading both count off `pending`
	 * — the misses that are still misses. See THE DRILL below for what writes it.
	 */
	let drilled = $state<Record<string, boolean>>({});
	const pending = $derived(missed.filter((result) => drilled[result.word.id] !== true));
	/** Once the list is clear, the button offers the whole set again rather than nothing. */
	const drillTargets = $derived(pending.length > 0 ? pending : missed);

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
	const pct = (part: number, whole: number) =>
		whole > 0 ? Math.min(100, (part / whole) * 100) : 0;
	const seenPct = $derived(arc ? pct(arc.seen, arc.total) : 0);
	const masteredPct = $derived(arc ? pct(arc.mastered, arc.total) : 0);

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
	 * `drilled` is the only thing a finished drill leaves behind on this screen — word id to
	 * whether the re-test got it. The cards keep their order and their size and change one
	 * label, so the list heals rather than rearranging itself; `pending` is what is still red,
	 * and it is what the primary button offers to run next.
	 *
	 * The learner's *record* is written by the drill itself, one `recordAnswer` per answer, so
	 * leaving halfway keeps every answer given — the map below is presentation, never the truth.
	 */
	let drilling = $state(false);
	let deck = $state<DrillCard[]>([]);
	/** How the last finished drill went, for the line under the heading. */
	let lastDrill = $state<{ right: number; total: number } | null>(null);
	let reviewTitle: HTMLElement | null = $state(null);

	function startDrill() {
		const seeds: DrillSeed[] = drillTargets.map((result) => ({
			word: result.word,
			direction: result.direction,
			picked: result.picked
		}));
		if (seeds.length === 0) return;
		// Undrawn each time, from an unseeded `Math.random`: a second pass on the same words is a
		// different set of wrong answers, so it cannot be answered by remembering last time's.
		deck = buildDrill(seeds, drillPool(session.questions));
		lastDrill = null;
		drilling = true;
	}

	function closeDrill(outcomes: Record<string, boolean>) {
		const answered = Object.values(outcomes);
		if (answered.length > 0) {
			drilled = { ...drilled, ...outcomes };
			lastDrill = {
				right: answered.filter(Boolean).length,
				total: answered.length
			};
		}
		drilling = false;
		deck = [];
		// The drill's own controls have just left the DOM, so focus is on <body>. The heading is
		// the right place to land: it is the sentence that just changed.
		void tick().then(() => reviewTitle?.focus());
	}
</script>

<div class="summary" bind:this={panel} tabindex="-1">
	<h2 class="sr-only">{headline}</h2>

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
			<h3 id="summary-review" class="section-title">
				{taught.length}
				{taught.length === 1 ? 'new word' : 'new words'}
			</h3>
			<p class="drill-note">
				These were shown, not tested — nothing here counts against you. The next round asks them.
			</p>
			<ul class="cards">
				{#each taught as question, i (question.word.id)}
					<WordCard word={question.word} outcome="right" verdict={false} index={i} />
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

		<!-- The one figure that outlives the session, and the only block on this screen measured
		     against the whole level rather than the ten questions. Absent until there is one: a
		     learner whose storage rejected every write should not be told they practised nothing. -->
		{#if arc && arc.seen > 0}
			<section class="arc" aria-label="HSK {session.level} overall">
				<p class="eyebrow">HSK {session.level} overall</p>
				<p class="arc-line">
					<strong class="tabular">{arc.seen.toLocaleString('en')}</strong>
					of <span class="tabular">{arc.total.toLocaleString('en')}</span> words met
				</p>
				<div class="track" aria-hidden="true">
					<span class="fill fill-seen" style:inline-size="max(3px, {seenPct}%)"></span>
					{#if arc.mastered > 0}
						<span class="fill fill-mastered" style:inline-size="max(3px, {masteredPct}%)"></span>
					{/if}
				</div>
				<p class="legend">
					<span class="key"><span class="dot dot-seen"></span>met once</span>
					<span class="key"
						><span class="dot dot-mastered"></span>{arc.mastered.toLocaleString('en')} mastered</span
					>
				</p>
			</section>
		{/if}

		<section aria-labelledby="summary-review">
			{#if missed.length > 0}
				<!-- Counts what is still red, so a fixed word is subtracted from the sentence at the
				     same moment its card turns green. `tabindex` because this is where focus lands
				     when a drill closes — it is the line that just changed. -->
				<h3 id="summary-review" class="section-title" bind:this={reviewTitle} tabindex="-1">
					{#if pending.length === 0}
						All {missed.length}
						{missed.length === 1 ? 'word' : 'words'} fixed
					{:else}
						{pending.length}
						{pending.length === 1 ? 'word' : 'words'} to review
					{/if}
				</h3>

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
								picked={result.picked}
								direction={result.direction}
								drilled={drilled[result.word.id] ?? null}
								index={i}
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
				<h3 id="summary-review" class="section-title">Read them once more</h3>
			{/if}
		</section>

		{#if solved.length > 0}
			{#if missed.length === 0}
				<!-- No disclosure on a clean run: `10 answered correctly` under `All 10 right` is the
				     same fact twice, and it cost a 44px row above the first card. -->
				<ul class="cards cards-solved">
					{#each solved as result, i (result.word.id)}
						<WordCard word={result.word} outcome="right" verdict={false} index={i} />
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
							<WordCard word={result.word} outcome="right" verdict={false} index={i} />
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
						<WordCard word={question.word} outcome="right" verdict={false} index={i} />
					{/each}
				</ul>
			</details>
		{/if}
	{/if}

	<!--
		The decision, in the order it is actually wanted: the words you just got wrong, then more
		words. The drill hides the row entirely — it has its own continue button, and two primaries
		on one screen is one too many.
	-->
	{#if !drilling}
		<div class="actions">
			{#if drillTargets.length > 0}
				<button type="button" class="btn btn-primary flex-1" onclick={startDrill}>
					{drillTargets.length === 1
						? 'Practise this one again'
						: `Practise these ${drillTargets.length} again`}
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
			{:else}
				<button type="button" class="btn btn-primary flex-1" onclick={onRestart}>
					{nextLabel}
				</button>
			{/if}
		</div>

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
	 * Holds its height before hydration, so the review list never shifts under a thumb.
	 *
	 * Everything here exists to stop it being read as a second session score: its own eyebrow
	 * naming the scale, a continuous two-tone track rather than ten segments, a legend, and a
	 * 3px floor on the fill so 10-of-500 reads as "barely started" instead of "failed to draw".
	 */
	.arc {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		margin-block-start: 1.125rem;
		padding: 0.875rem 0.9375rem 0.8125rem;
		border-radius: var(--radius-md);
		background-color: var(--color-surface-sunken);
	}

	.arc-line {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--color-ink-muted);
	}

	.arc-line strong {
		font-size: var(--text-lg);
		font-weight: 700;
		color: var(--color-ink);
	}

	.track {
		position: relative;
		block-size: 0.5rem;
		border-radius: var(--radius-pill);
		background-color: var(--color-page);
		overflow: hidden;
	}

	.fill {
		position: absolute;
		inset-block: 0;
		inset-inline-start: 0;
		border-radius: inherit;
	}

	/* Met-once is ink, not green: green is mastery in this system and nothing else. */
	.fill-seen {
		background-color: var(--color-line-strong);
	}

	.fill-mastered {
		background-color: var(--color-correct);
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.875rem;
		margin: 0;
		font-size: var(--text-xs);
		color: var(--color-ink-subtle);
	}

	.key {
		display: inline-flex;
		align-items: center;
		gap: 0.3125rem;
	}

	.dot {
		inline-size: 0.5rem;
		block-size: 0.5rem;
		border-radius: var(--radius-pill);
	}

	.dot-seen {
		background-color: var(--color-line-strong);
	}

	.dot-mastered {
		background-color: var(--color-correct);
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

	.cards {
		display: flex;
		flex-direction: column;
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
		margin-block-start: 1.5rem;
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

	.actions::before {
		content: '';
		position: absolute;
		inset-inline: 0;
		inset-block-end: 100%;
		block-size: 2.25rem;
		background: linear-gradient(to top, var(--color-page), transparent);
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
