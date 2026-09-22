<!--
	The quiz. Ten questions, one screen, both directions.

	LAYOUT — the shape is Pleco's headword over Du Chinese's action row. The run is a flex
	column exactly one viewport tall: the progress rail pins to the top, the answer buttons and
	the continue button pin to the bottom where a thumb already is, and the question takes every
	pixel in between so the 汉字 can be set as large as the space allows.

	THE ONLY ELASTIC THING IN THE COLUMN IS THE STAGE. Every other row — rail, answers, action —
	is `flex: none` and is the same height before and after an answer, and the stage is
	`flex: 1 1 0`, so it is sized purely by subtraction and never by its contents. That is the
	fix for the bug that failed this screen at 375×667: the stage used to be `flex: 1 1 auto`,
	which sizes intrinsically, so on a short phone the taller answered state simply grew the
	page — `scrollHeight` went 667 → 806 the instant an answer landed and the black "Next word"
	pill left the frame by up to 127px. Nothing in the column moves on the tap now, which is
	also what stops a fast second tap from hitting a different control than the one that was
	under the finger. Two rules keep it true, and both are load-bearing:

	  · the answer buttons reserve the missed-pick line whether or not they show it
	    (ChoiceButton), so the stack is one height;
	  · the prompt draws the whole reveal in both states and hides what would give the answer
	    away (QuestionPrompt), so the stage never has to grow AND the headword never has to
	    shrink to let the reveal in. Loop 2 had only the first half of that, and paid for it
	    out of the character: 北京 was 112.5px as a question and 72.1px as an answer.

	PACE — the learner always taps to continue, on a right answer as much as a wrong one. Auto-
	advancing on a correct answer would buy half a second and cost the only moment the whole
	word (hanzi, tone-marked pinyin, every gloss, part of speech) is on screen at full size; that
	moment is the point of the exercise, not an interstitial. Enter, Space, → and `n` all mean
	"go on" for anyone on a keyboard, so it is one keystroke rather than a reach for the mouse.

	AND IT ARRIVES BEFORE IT ARMS. Reserving the continue button's space is what stops the
	answers moving, but it also means a black pill materialises in one frame, 8px under the
	thumb that just tapped, in a strip that read as empty when the finger came down. A tap 60ms
	behind the first one skipped the reveal 6/6. So `.next` rises in over 260ms and refuses
	presses — pointer and keyboard alike — for the first 400ms of its life. A deliberate press
	is unaffected; a bounce is not a press.

	STATE — everything lives here, in `$state`, for the length of the run. There is no `+page.ts`
	on purpose: progress is `localStorage` and session construction is random, so a server render
	could only ever produce a different session than the client, and shipping 500 words of JSON
	through the SSR payload to avoid one dynamic import would be a bad trade. The server renders
	the shell and the skeleton; the run is built on the client, from the same lazily-loaded level
	chunk the browse screen uses.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { LEVELS, type Level, type Word } from '$lib/types';
	import { loadLevel } from '$lib/data';
	import { progress } from '$lib/progress';
	import StorageNotice from '$lib/progress/StorageNotice.svelte';
	import { buildSession, isIntroduction, recordOutcome, seededRng } from '$lib/session';
	import {
		availableSessionStorage,
		clearSession,
		restoreSession,
		saveSession
	} from '$lib/session/persistence';
	import ChoiceButton from '$lib/components/quiz/ChoiceButton.svelte';
	import QuestionPrompt from '$lib/components/quiz/QuestionPrompt.svelte';
	import QuizProgress from '$lib/components/quiz/QuizProgress.svelte';
	import ResultsFallback from '$lib/components/quiz/ResultsFallback.svelte';
	import { readKey } from '$lib/components/quiz/keys';
	import {
		choiceStatus,
		introductionAnnouncement,
		marks,
		parseLevel,
		tally,
		verdictAnnouncement
	} from '$lib/components/quiz/quiz';
	import {
		DEMO_SEED,
		demoProgress,
		isSummaryPreview,
		loadSummary,
		seedDemoAnswers,
		type SummaryComponent
	} from '$lib/components/quiz/summary';
	import type { Session } from '$lib/types';

	type Status = 'loading' | 'ready' | 'empty' | 'failed' | 'no-level';

	const level = $derived(parseLevel(page.params.level));
	/** `?state=summary` — a finished run, seeded, so the summary can be opened directly. */
	const preview = $derived(isSummaryPreview(page.url));

	let session = $state<Session | null>(null);
	let status = $state<Status>('loading');
	let hinted = $state(false);
	let Summary = $state<SummaryComponent | null>(null);
	let summarySettled = $state(false);
	let answersEl = $state<HTMLElement | null>(null);
	/**
	 * Whether “Next word” will accept a press yet. The button materialises 8px under the
	 * answer the thumb just hit, into space that read as empty when the finger came down, so
	 * for its first frames it is drawn but inert — a second tap 60ms after the first landed on
	 * it 6/6 and skipped the reveal entirely, which is the one thing this screen exists for.
	 */
	let armed = $state(false);

	/** Guards a slow level fetch from landing on top of a newer run. Not reactive by design. */
	let runId = 0;

	const question = $derived(
		session && session.index < session.questions.length ? session.questions[session.index] : null
	);
	const picked = $derived(session && question ? (session.answers[session.index] ?? null) : null);
	const answered = $derived(picked !== null);
	/**
	 * A teach card, not a question: the word's very first appearance. It shows the whole entry
	 * up front and asks nothing, so there are no choices to render and nothing to get wrong —
	 * the only control is "Got it". Nobody can be wrong about a word they have not been taught,
	 * and the ten `lastMissed` stamps a first run used to write about words it had shown once
	 * and never asked went straight back into the scheduler that chose them.
	 */
	const teaching = $derived(question !== null && isIntroduction(question));
	const finished = $derived(
		session !== null && session.questions.length > 0 && session.index >= session.questions.length
	);
	const score = $derived(session ? tally(session) : { answered: 0, correct: 0, wrong: 0 });
	const rail = $derived(session ? marks(session) : []);
	const lastQuestion = $derived(session !== null && session.index === session.questions.length - 1);
	/** Nothing on screen announces itself to a screen reader, so the verdict is spoken here. */
	const spoken = $derived.by(() => {
		if (!question) return '';
		if (teaching) return introductionAnnouncement(question);
		return picked ? verdictAnnouncement(question, picked) : '';
	});

	async function startSession(target: Level, demo: boolean, fresh = false) {
		const id = ++runId;
		status = 'loading';
		session = null;
		hinted = false;
		const storage = availableSessionStorage();
		if (fresh && !demo) clearSession(storage, target);

		// Warmed now, needed ten answers from now. The run never blocks on it.
		void loadSummary().then((component) => {
			if (id !== runId) return;
			Summary = component;
			summarySettled = true;
		});

		let words: Word[];
		try {
			words = await loadLevel(target);
		} catch {
			if (id === runId) status = 'failed';
			return;
		}
		if (id !== runId) return;

		// `buildSession` reads the whole progress map. Untracked: this runs from an effect, and
		// a tracked read would rebuild the session on every answer it records.
		const restored = demo || fresh ? null : restoreSession(storage, target, words, null);
		const built =
			restored ??
			untrack(() =>
				demo
					? // The demo answers its own questions, so it is built against a synthetic record
						// rather than the learner's: the preview is then the same ten words on every
						// device and in every screenshot. `demoProgress`, not `null` — a learner with no
						// record is owed an introduction for every word, and this URL exists to show the
						// scored summary.
						seedDemoAnswers(
							buildSession(words, target, demoProgress(words), 10, { rng: seededRng(DEMO_SEED) })
						)
					: buildSession(words, target, progress)
			);

		if (built.questions.length === 0) {
			status = 'empty';
			return;
		}
		session = built;
		status = 'ready';
		if (!demo) saveSession(storage, built, null);
	}

	$effect(() => {
		const target = level;
		const demo = preview;
		if (target === null) {
			runId++;
			session = null;
			status = 'no-level';
			return;
		}
		void startSession(target, demo);
	});

	/* Re-arms from scratch on every card, and disarms the moment one is answered. */
	$effect(() => {
		// The card's identity, read so this re-runs between two consecutive teach cards. They
		// never change `answered`, and a first run is ten of them with the same control in the
		// same place — a bounce tap would otherwise walk straight through a word.
		const card = session?.index ?? null;
		if (card === null || (!answered && !teaching)) {
			armed = false;
			return;
		}
		armed = false;
		const timer = setTimeout(() => (armed = true), 400);
		return () => clearTimeout(timer);
	});

	function choose(choice: Word) {
		// Two guards, because a phone can deliver two taps before a frame is painted: the
		// buttons are `disabled` the moment an answer exists, and this refuses a second one.
		if (!session || !question || teaching || picked !== null) return;
		session.answers[session.index] = choice;
		// Not `recordAnswer` directly: `recordOutcome` is the one place a card becomes a change
		// to the record, and it honours `isScored` so this screen cannot get it half right.
		recordOutcome(progress, question, choice);
		if (!preview) saveSession(availableSessionStorage(), session, null);
	}

	/** "Got it" on a teach card: note the exposure — never an answer — and move on. */
	function acknowledge() {
		if (!session || !question || !teaching || !armed) return;
		recordOutcome(progress, question, null);
		step();
	}

	/** Move to the next card. The two ways off a card differ only in what they record. */
	function step() {
		if (!session) return;
		const next = session.index + 1;
		session.index = next;
		hinted = false;
		// Once per finished run.
		if (next >= session.questions.length) progress.noteSession(session.level);
		if (!preview) saveSession(availableSessionStorage(), session, null);
	}

	function advance() {
		if (!session || picked === null || !armed) return;
		step();
	}

	async function restart() {
		if (level === null) return;
		// Leaving the preview flag behind is the whole job here: the effect sees the URL change
		// and builds a real session instead of re-seeding the demo.
		if (preview) {
			clearSession(availableSessionStorage(), level);
			await goto(resolve('/quiz/[level]', { level: String(level) }), { replaceState: true });
			return;
		}
		await startSession(level, false, true);
	}

	function goHome() {
		void goto(resolve('/'));
	}

	/** Arrow keys walk the four buttons in document order — whatever is on screen is the truth. */
	function moveFocus(delta: number) {
		const buttons = [...(answersEl?.querySelectorAll('button') ?? [])].filter((b) => !b.disabled);
		if (buttons.length === 0) return;
		const at = buttons.findIndex((b) => b === document.activeElement);
		const next =
			at < 0
				? delta > 0
					? 0
					: buttons.length - 1
				: (at + delta + buttons.length) % buttons.length;
		buttons[next]?.focus();
	}

	function onKeydown(event: KeyboardEvent) {
		if (!question) return;
		// A teach card has nothing to choose and nothing to walk, so it reads as "answered": the
		// only key that means anything on it is the one that means "go on".
		const action = readKey(event, {
			answered: answered || teaching,
			choices: teaching ? 0 : question.choices.length
		});
		if (!action) return;

		if (action.type === 'choose') {
			const choice = question.choices[action.index];
			if (!choice) return;
			event.preventDefault();
			choose(choice);
			return;
		}
		event.preventDefault();
		if (action.type === 'move') moveFocus(action.delta);
		else if (teaching) acknowledge();
		else advance();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<main class="quiz">
	<p class="sr-only" role="status" aria-live="polite">{spoken}</p>

	<!-- Silent while writes are landing. When they are not, this is the screen that most needs
	     to say so: it is where the answers are being given. -->
	<StorageNotice />

	{#if status === 'no-level'}
		<section class="panel">
			<p class="eyebrow">Not a level</p>
			<h1 class="panel-title">hskquiz covers HSK 1 to 5</h1>
			<p class="panel-body">
				There is no level “{page.params.level}”. Pick one of the five below, or go back to the level
				list to see where you left off.
			</p>
			<ul class="levels">
				{#each LEVELS as choice (choice)}
					<li>
						<a class="level-link" href={resolve('/quiz/[level]', { level: String(choice) })}>
							HSK {choice}
						</a>
					</li>
				{/each}
			</ul>
			<a class="btn btn-quiet btn-block" href={resolve('/')}>Back to levels</a>
		</section>
	{:else if status === 'failed'}
		<section class="panel">
			<p class="eyebrow">Could not load</p>
			<h2 class="panel-title">The HSK {level} word list did not arrive</h2>
			<!-- The reassurance is claimed only while writes are actually landing. When storage is
			     unavailable or failing it is a flat lie, and `StorageNotice` is on screen saying
			     so — the two must never contradict each other. -->
			<p class="panel-body">
				That is usually the network. {#if progress.status === 'saving'}Nothing you have practised is
					lost — progress is kept on this device.{/if}
			</p>
			<button type="button" class="btn btn-primary btn-block" onclick={restart}>Try again</button>
			<a class="btn btn-quiet btn-block mt-2.5" href={resolve('/')}>Back to levels</a>
		</section>
	{:else if status === 'empty'}
		<section class="panel">
			<p class="eyebrow">Nothing to ask</p>
			<h2 class="panel-title">HSK {level} has no questions to build from</h2>
			<a class="btn btn-quiet btn-block" href={resolve('/')}>Back to levels</a>
		</section>
	{:else if status === 'loading' || !session}
		<!-- Shaped like the run it becomes, so the first frame does not jump into the second. -->
		<div class="run" aria-hidden="true">
			<div class="skeleton-rail"></div>
			<div class="stage"><div class="skeleton-stage"><div class="skeleton-word"></div></div></div>
			<div class="answers">
				{#each [0, 1, 2, 3] as slot (slot)}
					<div class="skeleton-choice"></div>
				{/each}
			</div>
			<div class="action"></div>
		</div>
	{:else if finished}
		{#if Summary}
			<Summary {session} onRestart={restart} onHome={goHome} />
		{:else if summarySettled}
			<ResultsFallback {session} onRestart={restart} onHome={goHome} />
		{/if}
	{:else if question}
		<div class="run">
			<QuizProgress
				marks={rail}
				index={session.index}
				correct={score.correct}
				wrong={score.wrong}
			/>

			<div class="stage">
				<QuestionPrompt {question} {picked} {hinted} onhint={() => (hinted = true)} />
			</div>

			<!-- Keyed by position, not by word: the badge on a button says `1`–`4`, so position
			     is its identity, and a new question is a change of props rather than a reshuffle
			     of the DOM under someone's thumb.

			     A teach card has no choices at all — it asks nothing — so the whole grid is gone
			     rather than disabled, and the stage takes the height back for the character. -->
			{#if !teaching}
				<div class="answers" bind:this={answersEl}>
					{#each question.choices as choice, i (i)}
						<ChoiceButton
							word={choice}
							direction={question.direction}
							index={i}
							status={choiceStatus(question, choice, picked)}
							onpick={() => choose(choice)}
						/>
					{/each}
				</div>
			{/if}

			<div class="action">
				{#if teaching}
					<button
						type="button"
						class="btn btn-primary btn-block next"
						class:arming={!armed}
						onclick={acknowledge}
					>
						{lastQuestion ? 'See results' : 'Got it'}
						<kbd class="kbd" aria-hidden="true">↵</kbd>
					</button>
				{:else if answered}
					<button
						type="button"
						class="btn btn-primary btn-block next"
						class:arming={!armed}
						onclick={advance}
					>
						{lastQuestion ? 'See results' : 'Next word'}
						<kbd class="kbd" aria-hidden="true">↵</kbd>
					</button>
				{/if}
			</div>
		</div>
	{/if}
</main>

<style>
	.quiz {
		display: flex;
		flex-direction: column;
		inline-size: 100%;
		/*
		 * The shell is a column flex box one viewport tall and the focus-mode content wrapper is
		 * its growing item, so growing into it is exactly "the space left under the app bar" —
		 * measured, rather than recomputed from `100dvh` minus a list of things that might change
		 * height. It has to be `flex`, not `block-size: 100%`: the wrapper's height comes from
		 * flexing and is therefore indefinite, so a percentage against it resolves to `auto`.
		 */
		flex: 1 1 auto;
		max-inline-size: var(--container-app);
		margin-inline: auto;
		padding-inline-start: max(var(--spacing-gutter), var(--app-safe-left, 0px));
		padding-inline-end: max(var(--spacing-gutter), var(--app-safe-right, 0px));
	}

	/*
	 * One viewport, minus the chrome above and the home indicator below.
	 *
	 * The vertical rhythm is five custom properties rather than five literals, because the
	 * phone this has to FIT (568px) and the phone it should FILL (932px) want different
	 * numbers: 364px of difference is five answer buttons. Each one is a `clamp` on `svh`
	 * rather than a step at a breakpoint, and that is not a style preference — the stage is
	 * whatever is left after this rhythm, so a rhythm that jumps 40px at 704px of viewport
	 * hands a 706px window a stage with nothing in it. It did: the headword collapsed to its
	 * 2.5rem floor and overflowed the reveal at 593px, 706px and 545px, the first pixel above
	 * each old breakpoint. Continuous in, continuous out. The lines are fitted to the two
	 * phones that matter — every one of them lands on the old 568px number at 568px and the
	 * old 812px number at 812px, and interpolates in between instead of jumping. `svh`, not
	 * `vh`: the small viewport is the one with the URL bar showing, which is the height this
	 * has to fit. ChoiceButton clamps its own height on the same principle.
	 */
	.run {
		--choice-gap: clamp(0.375rem, calc(2.46svh - 8px), 1rem);
		--action-gap: clamp(0.375rem, calc(3.28svh - 12.6px), 1.125rem);
		--stage-pad-t: clamp(0.25rem, calc(4.92svh - 23.9px), 1.375rem);
		--stage-pad-b: clamp(0.5rem, calc(4.92svh - 19.9px), 1.625rem);
		--run-pad-b: clamp(0.5rem, calc(3.28svh - 10.6px), 1.25rem);
		/*
		 * The answer pill's own two measures live here rather than in `ChoiceButton`, because
		 * they are two more lines of this rhythm and not a property of a button: they are
		 * `svh`-driven for the same reason as the five above, they are subtracted from the same
		 * stage, and — see the desktop block below — they have to stop growing at the same
		 * height the rest of them do. Split across two files, one half of the rhythm was capped
		 * and the other half was not, which is exactly the bug that block fixes.
		 */
		--choice-h: clamp(2.875rem, calc(7.38svh + 4.1px), 4.5rem);
		--choice-face: clamp(1.625rem, calc(4.1svh + 2.7px), 2.5rem);

		display: flex;
		flex-direction: column;
		flex: 1 1 auto;
		min-block-size: 0;
		/* The shell adds the home-indicator inset under this, so a notched phone gets both. */
		padding-block-end: var(--run-pad-b);
	}

	/*
	 * On anything bigger than a phone a full-height column strands the buttons at the far edge
	 * of the window; capped and centred, the run reads as one object again.
	 *
	 * AND EVERY MEASURE INSIDE IT STOPS GROWING WHERE THE RUN DOES. This is the second half of
	 * that cap and it was missing. The seven lines above are `svh` because the stage is
	 * whatever the rhythm leaves behind — but on a wide window the run stops at 46rem while
	 * `svh` keeps climbing, so the answer stack, the gaps and the padding went on taking room
	 * out of a column that could not get any bigger. Measured at 1440x900 before this block:
	 * the run was 736px and the four answer buttons alone were 324.4px of it (70.5px each,
	 * against 64px on a 375x812 phone), which left the stage 271.1px against the phone's 328.3
	 * — a SHORTER stage on a window 332px taller. The hero row came out at 90.4px and the
	 * headword at 83.2px, 30% smaller than the same word on a phone and, at 5.8% of screen
	 * width per glyph, below Pleco's ~6.9% at the one viewport with the most room to spare.
	 *
	 * The run hits 46rem at ~793px of viewport (736 + the app bar), so each ceiling below is
	 * simply the value its own clamp already takes at that height — the same curve, stopped
	 * where the column it is measured against stops. Nothing changes on any phone: every one
	 * of these is above the value its clamp reaches at 375x932, so the cap never binds there.
	 */
	@media (min-width: 48rem) {
		.quiz {
			justify-content: center;
		}

		.run {
			--choice-gap: clamp(0.375rem, calc(2.46svh - 8px), 0.71875rem);
			--action-gap: clamp(0.375rem, calc(3.28svh - 12.6px), 0.8125rem);
			--stage-pad-t: clamp(0.25rem, calc(4.92svh - 23.9px), 0.9375rem);
			--stage-pad-b: clamp(0.5rem, calc(4.92svh - 19.9px), 1.1875rem);
			--run-pad-b: clamp(0.5rem, calc(3.28svh - 10.6px), 0.9375rem);
			--choice-h: clamp(2.875rem, calc(7.38svh + 4.1px), 3.875rem);
			--choice-face: clamp(1.625rem, calc(4.1svh + 2.7px), 2.1875rem);

			max-block-size: 46rem;
		}
	}

	/*
	 * `flex: 1 1 0`, not `auto`: the basis is zero, so this row is whatever is left over and
	 * never one pixel of what its contents would like. The prompt inside is stretched to it
	 * and sizes its own character against it. `min-block-size` is the floor for a landscape
	 * phone, where there is genuinely not enough height for all of this — there the page
	 * scrolls rather than collapsing the question to nothing.
	 */
	.stage {
		display: grid;
		align-items: stretch;
		flex: 1 1 0;
		min-block-size: 7.5rem;
		padding-block: var(--stage-pad-t) var(--stage-pad-b);
	}

	/* Landscape. See the matching block in QuestionPrompt: below ~544px of viewport there is
	   no fit to find, so the run stops being one screen tall and becomes a page. */
	@media (max-height: 35rem) {
		.stage {
			flex: 0 0 auto;
			min-block-size: 0;
		}

		.run {
			max-block-size: none;
		}
	}

	/* `1fr` rows: if one gloss wraps, all four buttons take the taller height together, so the
	   stack never turns into four different sizes. */
	.answers {
		display: grid;
		grid-auto-rows: 1fr;
		flex: none;
		gap: var(--choice-gap);
	}

	/*
	 * Reserved whether or not there is a button in it, and reserved at 2.875rem rather than at
	 * the 2.75rem tap minimum: the pill's own content box comes out at 45.2px, so a 44px
	 * reservation still grew by 1.2px when the button appeared, and every answer button above
	 * it slid 1.2px up the screen. 46px is the number that makes the two states identical.
	 */
	.action {
		display: flex;
		align-items: center;
		flex: none;
		min-block-size: 2.875rem;
		margin-block-start: var(--action-gap);
	}

	/*
	 * It rises into place rather than appearing, and it is `pointer-events: none` while it
	 * does — the space was already reserved (that is what stopped the answers moving), but a
	 * control that becomes tappable in one frame, one thumb-width below where the finger just
	 * was, is a skipped reveal waiting to happen.
	 */
	.next {
		gap: 0.625rem;
		animation: next-in 260ms var(--ease-out-soft) both;
	}

	.next.arming {
		pointer-events: none;
	}

	@keyframes next-in {
		from {
			opacity: 0;
			translate: 0 0.5rem;
		}
		to {
			opacity: 1;
			translate: 0 0;
		}
	}

	.kbd {
		display: none;
		min-inline-size: 1.25rem;
		padding-block: 0.0625rem;
		border-radius: var(--radius-xs);
		background-color: color-mix(in srgb, var(--color-primary-ink) 18%, transparent);
		font-family: var(--font-sans);
		font-size: var(--text-xs);
		line-height: 1.3;
	}

	/* A keyboard hint, shown only where there is a keyboard. */
	@media (hover: hover) and (pointer: fine) {
		.kbd {
			display: inline-block;
		}
	}

	/* ------------------------------------------------------------------ dead ends ----- */

	.panel {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		padding-block: 3rem 2rem;
	}

	.panel-title {
		margin: 0.5rem 0 0;
		font-size: var(--text-2xl);
	}

	.panel-body {
		margin: 0.625rem 0 1.5rem;
		color: var(--color-ink-muted);
	}

	.levels {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 0 0 1.5rem;
		padding: 0;
		list-style: none;
	}

	.level-link {
		display: inline-flex;
		align-items: center;
		min-block-size: var(--spacing-tap);
		padding-inline: 1rem;
		border: 1px solid var(--color-line-strong);
		border-radius: var(--radius-pill);
		color: var(--color-ink);
		font-size: var(--text-sm);
		font-weight: 600;
		text-decoration: none;
	}

	@media (hover: hover) {
		.level-link:hover {
			background-color: var(--color-surface-sunken);
		}
	}

	/* ------------------------------------------------------------------- skeleton ----- */

	.skeleton-rail,
	.skeleton-word,
	.skeleton-choice {
		border-radius: var(--radius-md);
		background-color: var(--color-surface-sunken);
		animation: quiz-fade 1.4s var(--ease-in-out-soft) infinite;
	}

	.skeleton-rail {
		block-size: 0.375rem;
		margin-block: 1.75rem 0.75rem;
		border-radius: var(--radius-pill);
	}

	.skeleton-stage {
		display: grid;
		place-items: center;
	}

	.skeleton-word {
		inline-size: 8rem;
		block-size: 5rem;
	}

	/* Matched to a real answer button so the first frame does not jump into the second. */
	.skeleton-choice {
		min-block-size: 3.625rem;
	}

	@keyframes quiz-fade {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}
</style>
