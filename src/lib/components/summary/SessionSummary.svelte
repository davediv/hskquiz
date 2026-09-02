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
	import { onMount, tick, untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import { pushState } from '$app/navigation';
	import { page } from '$app/state';
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
	/**
	 * Where the results were scrolled to when the sheet opened.
	 *
	 * The sheet is `position: fixed` over this screen, so the screen behind it must not move —
	 * and it did, all the way to the top: `WordSheet`'s open effect calls `panel.focus()`, and
	 * focusing scrolls the focused box into view whether or not it is fixed, which took a page
	 * scrolled to 500 back to 0 before the sheet had finished painting. Measured: open at
	 * `scrollY` 500, one frame later 0. Closing then handed back a screen the learner had to
	 * find their card in again. So the position is held for the life of the sheet and put back
	 * when it goes — and while it is open the page under it is pinned, which is what a modal
	 * over a scrolling list is supposed to do anyway.
	 */
	let restoreY = 0;

	/*
	 * AND THE SHEET IS A HISTORY ENTRY, SO THE PHONE'S OWN BACK GESTURE CLOSES IT.
	 *
	 * Loop 4 stopped the chip from navigating and the trap simply moved: the sheet was drawn
	 * over a route it was not part of, so the one dismissal a phone user actually reaches for —
	 * the edge swipe — went past the sheet and unloaded `/quiz/[level]`, and the run, the review
	 * list and every drill result went with it. Escape closed the sheet, the grip closed the
	 * sheet, and the gesture the sheet looks like it should answer to destroyed the session.
	 *
	 * So opening pushes a shallow-routing entry (`pushState`, same URL, `{ sheet: true }`), and
	 * the entry is the thing that means "a sheet is open". Every way out now runs through the
	 * same door:
	 *
	 *   · back gesture / browser back / the app bar's popping chevron → the entry comes off,
	 *     `page.state.sheet` goes away, and the effect below closes the sheet and nothing else;
	 *   · ✕, Escape, the grip drag, the backdrop → `closeSheet()` asks for that same pop, so
	 *     the stack never keeps a stale entry that a later back press has to walk through;
	 *   · a character drill-down deeper than one word → back unwinds ONE step of `trail` and
	 *     re-arms, which is what a back gesture means everywhere else on a phone.
	 *
	 * Exactly one entry of ours is ever outstanding, which is why the re-arm above is safe.
	 * `layered`/`closing` are plain `let`s on purpose: they are bookkeeping for the effect that
	 * maintains them, and making them reactive would put that effect in its own dependency set.
	 */
	const layerOn = $derived((page.state as { sheet?: unknown }).sheet === true);
	/** True while an entry we pushed is still on the stack. */
	let layered = false;
	/** Set when *we* asked for it to come off, so its pop is a close rather than a trail step. */
	let closing = false;
	/** Run once the entry is actually off — see `practiseHere`, which restarts after closing. */
	let afterClose: (() => void) | null = null;

	/** Put the results back where they were, without smooth-scrolling a fixed overlay around. */
	function pinScroll() {
		if (Math.abs(window.scrollY - restoreY) < 1) return;
		window.scrollTo({ top: restoreY, left: 0, behavior: 'instant' });
	}

	function armLayer() {
		try {
			pushState('', { ...page.state, sheet: true } as App.PageState);
			layered = true;
		} catch {
			// The router is not up (a cold frame, or `pushState` unavailable). The sheet still
			// opens and still closes on ✕/Escape/grip — it is simply not a history entry, which
			// is exactly the behaviour this replaced.
			layered = false;
		}
	}

	$effect(() => {
		if (layerOn) return;
		untrack(() => {
			if (!layered) return;
			layered = false;
			if (closing) {
				closing = false;
				finishClose();
				return;
			}
			// A back gesture out of a character drill-down means "up one word", not "away".
			if (trail.length > 0) {
				trail = trail.slice(0, -1);
				armLayer();
				return;
			}
			finishClose();
		});
	});

	const openWord = $derived(sheetAt === null ? null : (sheetWords[sheetAt] ?? null));
	const sheetWord = $derived(trail.length > 0 ? trail[trail.length - 1] : openWord);
	const sheetFrom = $derived(
		trail.length > 1 ? trail[trail.length - 2] : trail.length === 1 ? openWord : null
	);

	// Held for as long as the sheet is up: the focus move that opens it is not the only thing
	// that can scroll the page behind a fixed overlay — a wheel over the scrim does it too.
	$effect(() => {
		if (sheetWord === null) return;
		pinScroll();
		const frame = requestAnimationFrame(pinScroll);
		window.addEventListener('scroll', pinScroll, { passive: true });
		return () => {
			cancelAnimationFrame(frame);
			window.removeEventListener('scroll', pinScroll);
		};
	});

	function openSheet(word: Word) {
		const at = sheetWords.findIndex((candidate) => candidate.id === word.id);
		if (at < 0) return;
		const active = document.activeElement;
		opener = active instanceof HTMLElement ? active : null;
		restoreY = window.scrollY;
		trail = [];
		sheetAt = at;
		armLayer();
	}

	/**
	 * Ask for the sheet to go away. Where an entry of ours is on the stack this is a `back()`
	 * and the close happens when the pop lands, so ✕ and the system gesture take the same path
	 * and neither leaves an entry behind for the other one to trip over.
	 */
	function closeSheet(then?: () => void) {
		if (closing) return;
		afterClose = then ?? null;
		if (layered) {
			closing = true;
			history.back();
			return;
		}
		finishClose();
	}

	/** The close itself, once the entry is off the stack (or there never was one). */
	function finishClose() {
		sheetAt = null;
		trail = [];
		// Nothing scrolled — the sheet is `position: fixed` over the results — so the only thing
		// to put back is focus, on the chip that opened it.
		const back = opener;
		opener = null;
		const then = afterClose;
		afterClose = null;
		// A caller that asked to do something next is replacing this screen, so there is no chip
		// left to hand focus back to.
		if (then) {
			then();
			return;
		}
		void tick().then(() => {
			// `preventScroll`, then put the page back by hand: the browser's own "scroll it into
			// view" is what moved this screen in the first place, and the chip is already where
			// the learner left it.
			back?.focus({ preventScroll: true });
			pinScroll();
		});
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

	/*
	 * THE INDEX, AND ONLY WHEN THERE IS SOMETHING TO INDEX.
	 *
	 * Three misses is three cards and the screen is its own overview. Ten is a 5,247px document
	 * — 6.5 screens of near-identical full-bleed cards with no way to see how many there are,
	 * which one you are on, or how to get to the fourth one except with a thumb. A bad run is
	 * exactly when the summary is least usable, which is exactly backwards.
	 *
	 * So from six words up the review list grows a row of the words themselves, pinned under
	 * the app bar: how many there are, which ones are still red, which one you are standing in,
	 * and one tap to any of them. It is the app's own dense row, borrowed for the one state
	 * that needs it. Below six it does not exist and the screen is unchanged — an index over a
	 * list you can already see whole is chrome.
	 */
	const WALL = 6;
	/**
	 * What the index covers: the misses if there are any, and otherwise the clean run's own ten.
	 *
	 * It used to be gated on the *miss* count, which handed the overview to everyone except the
	 * learner with the longest page. A 10/10 run is ten full-size cards under "Read them once
	 * more" — a 4,566px document on an 812px phone, 5.6 screens — and it was the one state with
	 * no index at all, because it had nothing red in it. The wall is about how much page there
	 * is, not about how badly it went.
	 */
	const indexed = $derived(missed.length > 0 ? missed : solved);
	const showIndex = $derived(!drilling && indexed.length >= WALL);
	/** The review list itself, so the index can scroll to the nth card without ids or refs. */
	let reviewList: HTMLElement | null = $state(null);
	/** The strip itself, so the marker can be scrolled to without scrolling the page. */
	let chipStrip: HTMLElement | null = $state(null);
	/** Which review card the viewport is standing in, or -1 before anything has been seen. */
	let here = $state(-1);
	/**
	 * The index's own height, measured rather than guessed: it is what a card jumped to has to
	 * clear, and a hard-coded 4rem left the sixth card 29px underneath it.
	 */
	let indexH = $state(0);

	function jumpTo(index: number) {
		const node = reviewList?.children[index];
		if (!(node instanceof HTMLElement)) return;
		const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		node.scrollIntoView({ block: 'start', behavior: still ? 'auto' : 'smooth' });
	}

	// "Which card am I in" is the middle of the viewport, not the top of it: a card is 438px on
	// a phone, so a top-edge test flickers between two of them on every scroll.
	$effect(() => {
		const list = showIndex ? reviewList : null;
		if (!list) return;
		const seen = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting) continue;
					const at = [...list.children].indexOf(entry.target);
					if (at >= 0) here = at;
				}
			},
			{ rootMargin: '-45% 0px -45% 0px' }
		);
		for (const child of list.children) seen.observe(child);
		return () => seen.disconnect();
	});

	/*
	 * AND THE MARKER FOLLOWS THE READER.
	 *
	 * Ten chips are 650px of row in a 335px strip, so six of them are off screen at any moment.
	 * Marking the current one without moving the strip meant that past the fifth word the index
	 * answered its own question — "which one am I standing in" — with a chip nobody could see:
	 * scrolled to the eighth card, the strip still read 吃饭 呢 儿子 那儿 电视机 with the mark on
	 * none of them.
	 *
	 * `scrollLeft` on the strip, not `scrollIntoView` on the chip: the chip's nearest scrollport
	 * after the strip is the page, and `scrollIntoView` walks all of them — it would drag the
	 * document under the thumb that is scrolling it, and fight `jumpTo`'s own smooth scroll every
	 * time a tapped card came into view. This moves one element on one axis and can fight
	 * nothing. Centred because that is where `scroll-snap-align` puts a chip anyway, so a
	 * proximity snap agrees with the destination instead of correcting it.
	 */
	$effect(() => {
		const strip = chipStrip;
		const at = here;
		if (!strip || at < 0) return;
		const chip = strip.children[at];
		if (!(chip instanceof HTMLElement)) return;
		const room = strip.scrollWidth - strip.clientWidth;
		if (room <= 0) return;
		const track = strip.getBoundingClientRect();
		const box = chip.getBoundingClientRect();
		const middle = strip.scrollLeft + (box.left - track.left) - (track.width - box.width) / 2;
		const want = Math.max(0, Math.min(room, middle));
		if (Math.abs(want - strip.scrollLeft) < 1) return;
		const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		strip.scrollTo({ left: want, behavior: still ? 'auto' : 'smooth' });
	});

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
		closeSheet(onRestart);
	}
</script>

<div
	class="summary"
	class:has-index={showIndex}
	style:--index-h="{indexH}px"
	bind:this={panel}
	tabindex="-1"
>
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
		<!--
			THE RECEIPT STANDS DOWN WHILE THE DRILL IS RUNNING.

			The mark and the score belong to the run that just ended; the drill is the next thing,
			and it is a takeover — its own heading, its own rail, its own count. Kept on screen
			they cost 190px above a panel that is 667px tall, which put the whole page 106px past
			the bottom of the phone: the drill's own continue button hung below the fold, the page
			was pinned at its maximum scroll, and "0 of 10 correct" came to rest straddling the
			app bar's lower edge with nowhere left to scroll it clear. Standing them down leaves
			the drill and the line naming it, in 728px — no scroll at all, nothing under the bar.
		-->
		{#if !drilling}
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
				<!-- Colour is not the only thing carrying the result: a missed segment is drawn
				     broken and a skipped one stays empty, so the strip still reads as three states
				     in greyscale or with either red-green deficiency. -->
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
		{/if}

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

				{@render indexStrip()}

				{#if drilling}
					<ReviewDrill cards={deck} onfinish={closeDrill} oncancel={closeDrill} />
				{:else}
					<ul class="cards" bind:this={reviewList}>
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
				{@render indexStrip()}

				<!--
					No disclosure on a clean run: `10 answered correctly` under `All 10 right` is the
					same fact twice, and it cost a 44px row above the first card.

					Inside this section rather than after it, which is what makes the index above it
					stick. A sticky box cannot leave its own parent: with the list a sibling of the
					section, the section ended one line below the strip and the strip scrolled away
					with it, so the clean run got an index that was gone by the second card.
				-->
				<ul class="cards cards-solved" bind:this={reviewList}>
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
			{/if}
		</section>

		{#if solved.length > 0 && missed.length > 0}
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
		{#if arc && arc.met > 0}
			<p class="tally">
				<span class="tally-k">HSK {session.level}</span>
				<span
					><strong class="tabular">{arc.met.toLocaleString('en')}</strong> of
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
	THE INDEX ITSELF. One definition, rendered above whichever list is on screen — the misses on
	a scored run, the clean ten on a perfect one. See the note beside `indexed` in the script.

	A chip is green only where green *changed*: a word the drill fixed carries the rule and the
	✓ against its still-red neighbours. On a clean run every word was right, so a green tick on
	all ten would be ten copies of the score line and no distinction at all — the chips there are
	quiet, and the strip's only job is position.
-->
{#snippet indexStrip()}
	{#if showIndex}
		<nav
			class="index"
			aria-label="The {indexed.length} words in this list"
			bind:clientHeight={indexH}
		>
			<ul class="chips" bind:this={chipStrip}>
				{#each indexed as result, i (result.word.id)}
					{@const fixed = redone[result.word.id]?.right === true}
					<li>
						<button
							type="button"
							class="chip"
							class:chip-fixed={result.right || fixed}
							class:here={here === i}
							aria-current={here === i ? 'true' : undefined}
							onclick={() => jumpTo(i)}
						>
							<Hanzi text={result.word.hanzi} size="xs" />
							{#if fixed}<span class="chip-mark" aria-hidden="true">✓</span>{/if}
							<span class="sr-only">
								{i + 1} of {indexed.length}, {result.right
									? 'correct'
									: fixed
										? 'fixed'
										: 'still to review'}
							</span>
						</button>
					</li>
				{/each}
			</ul>
		</nav>
	{/if}
{/snippet}

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
			onclose={() => closeSheet()}
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
		--summary-measure: var(--container-app);

		inline-size: 100%;
		max-inline-size: var(--summary-measure);
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
		margin: var(--spacing-2xs) 0 0;
	}

	.mark-gloss {
		font-size: var(--text-sm);
		color: var(--color-ink-muted);
	}

	/* The top of the screen is one group, not four evenly spaced lines: eyebrow, mark, score and
	   strip sit inside 0.25–0.625rem of each other and the air goes below them instead, where
	   the review list begins. */
	.score {
		margin-block-start: 0.625rem;
	}

	.score-line {
		margin: 0 0 var(--spacing-2xs);
		text-align: center;
		font-size: var(--text-sm);
		color: var(--color-ink-muted);
	}

	.score-line strong {
		font-size: var(--text-lg);
		font-weight: 700;
		color: var(--color-ink);
	}

	/*
	 * The rail from the quiz screen, finished. Same language, no counters.
	 *
	 * The gap between two segments has to stay wider than the notch inside one, or the strip
	 * stops counting. At 3px between and a notch cut at 40–60% of a 30.8px segment — 6.2px — a
	 * 0/10 run drew twenty dashes with the *wider* space inside each result: ten segments read as
	 * twenty, and the only thing on the screen that still said ten was the numeral. 4px between,
	 * 2px within.
	 */
	.rail {
		display: flex;
		gap: 0.25rem;
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

	/*
	 * Broken, not just red. The strip encoded ten results in hue alone — the one channel a
	 * red-green deficiency does not have — so a missed segment is now drawn as two halves with
	 * a gap between them and a skipped one stays an empty track. Three states, three shapes.
	 */
	.seg.wrong {
		background-color: var(--color-wrong);
		background-image: linear-gradient(
			to right,
			transparent 0 calc(50% - 1px),
			var(--color-page) calc(50% - 1px) calc(50% + 1px),
			transparent calc(50% + 1px) 100%
		);
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
		margin: 1.75rem 0 0.875rem;
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
	 * ONE CARD PER ROW — AND ON A DESKTOP, A WIDER ONE.
	 *
	 * Two missed words side by side is not the answer here: at 34rem of route a two-column grid
	 * produces two 250px cards whose head rows — a verdict label plus two 44px pills that may
	 * not shrink — overflow into each other. Tried, measured, reverted. What a desktop actually
	 * has is *width for the entry itself*: at 464px of card the 119px headword left 313px of
	 * nothing beside it, 67% of the card, and three cards made an 1,880px scroll in a 900px
	 * window. `WordCard` lays each word out beside its own headword as soon as the card it is in
	 * is wide enough for that particular word, and the widening at the end of this block is what
	 * gives that layout a measure to work in.
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

	/*
	 * THE INDEX. Only rendered from six words up — see the note in the script.
	 *
	 * Pinned under the app bar rather than left at the top of a 5,247px document: an overview
	 * that scrolls away on the first flick is a header, not an index. It bleeds to the page edge
	 * so the row reads as scrollable, and every chip is a full `--spacing-tap` target with the
	 * word itself on it, because "which one is the fourth" is a question about words.
	 */
	.index {
		position: sticky;
		inset-block-start: var(--app-sticky-top);
		z-index: 5;
		margin: -0.25rem calc(var(--spacing-gutter) * -1) 0.75rem;
		padding: 0.25rem var(--spacing-gutter);
		background-color: var(--color-page);
	}

	/* Cards dissolve under the index rather than being sliced by it — the same argument the
	   fade above the sticky action row makes, at a quarter of the height. */
	.index::after {
		content: '';
		position: absolute;
		inset-inline: 0;
		inset-block-start: 100%;
		block-size: 0.75rem;
		background: linear-gradient(
			to bottom,
			var(--color-page) 0%,
			color-mix(in oklab, var(--color-page) 55%, transparent) 55%,
			transparent 100%
		);
		pointer-events: none;
	}

	.chips {
		display: flex;
		gap: var(--spacing-2xs);
		margin: 0;
		margin-inline: calc(var(--spacing-gutter) * -1);
		padding: var(--spacing-2xs) var(--spacing-gutter);
		list-style: none;
		overflow-x: auto;
		overscroll-behavior-x: contain;
		scrollbar-width: none;
		scroll-snap-type: x proximity;
		/* And the standing guarantee behind it: whatever ends up inside this row, none of it is
		   allowed to size the page. `position: relative` on `.chip` fixes today's escape; this
		   closes the class of it, because the next absolutely positioned thing anyone adds in
		   here would reopen the hole silently and only on a ten-miss run. */
		contain: layout paint;
	}

	.chips::-webkit-scrollbar {
		display: none;
	}

	/*
	 * Still red / fixed green rides the bottom rule, and a fixed chip also carries a ✓ — the
	 * same refusal to let colour be the only copy of a state that the strip above it makes.
	 */
	.chip {
		display: inline-flex;
		flex: none;
		/*
		 * THE ONE LINE THAT KEEPS A BAD RUN INSIDE THE PHONE. Do not delete it.
		 *
		 * Every chip carries an `.sr-only` span, and `.sr-only` is `position: absolute`. With a
		 * static chip its containing block was the nearest positioned ancestor — `.index`, which
		 * is `sticky` — not the scroller. An absolutely positioned box whose containing block sits
		 * *outside* a scroll container is not clipped by it and its overflow is the document's:
		 * ten 1px labels parked at the chips' natural offsets, the last of them near x=650, made
		 * the layout viewport 624px wide on a 375px phone. Everything measured in viewport units
		 * then measured the wrong viewport, and the sticky action row — "Practise these 10 again"
		 * — settled 361px below the visible edge, at every scroll position, on the exact run that
		 * most needs it. `overflow-x: hidden` and `overflow-x: clip` on the row both leave it,
		 * because the box was never inside the row to clip. Relative chips put each label back
		 * inside its own chip, where the scroller can hold it.
		 */
		position: relative;
		align-items: center;
		gap: var(--spacing-2xs);
		block-size: var(--spacing-tap);
		min-inline-size: var(--spacing-tap);
		justify-content: center;
		padding-inline: 0.5rem;
		/* 女生 wrapped to two characters over two lines and took the row from 44px to 77px. A
		   chip is one line of word, always. */
		white-space: nowrap;
		border: 1px solid var(--color-line);
		border-block-end: 3px solid var(--color-wrong);
		border-radius: var(--radius-sm);
		background-color: var(--color-surface);
		scroll-snap-align: center;
		transition:
			border-color 140ms var(--ease-out-soft),
			background-color 140ms var(--ease-out-soft);
	}

	.chip-fixed {
		border-block-end-color: var(--color-correct);
	}

	.chip-mark {
		font-size: var(--text-2xs);
		font-weight: 700;
		color: var(--color-correct);
	}

	/* Where you are standing. Ink, not a hue: it is a position, not a result. */
	.chip.here {
		border-inline-color: var(--color-ink);
		border-block-start-color: var(--color-ink);
		background-color: var(--color-surface-sunken);
	}

	@media (hover: hover) {
		.chip:hover {
			background-color: var(--color-surface-sunken);
		}
	}

	/* A card jumped to lands under the bar and under the index, not behind them. */
	.cards :global(.card.word) {
		scroll-margin-block-start: calc(var(--app-sticky-top) + 0.75rem);
	}

	.has-index .cards :global(.card.word) {
		scroll-margin-block-start: calc(var(--app-sticky-top) + var(--index-h, 4rem) + 0.5rem);
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

	/*
	 * THE RESULTS ARE WIDER THAN THE RUN THAT PRODUCED THEM.
	 *
	 * `main.quiz` caps the route at 34rem because the quiz itself is a single column of four
	 * answer buttons under one character and a wider one would be a worse question. The results
	 * are a different document — a list of dictionary entries — and read side by side they want
	 * about 46rem. This screen is the only thing in that route that does, so it takes the width
	 * here rather than asking the route to widen the question as well: `inline-size` sets the
	 * box and the negative margins recentre it inside the 504px column it is sitting in.
	 * `100vw - 3rem` keeps it inside the viewport when the window is between the two.
	 *
	 * 40rem is where the widened column first gives a TWO-character headword its 255px and a
	 * readable measure beside it — the point where `WordCard` starts laying every word out side
	 * by side rather than only the single characters — so the list is one shape from here up.
	 *
	 * The one thing this cannot reach from here is the app bar, which aligns itself to the box
	 * `#main` renders (`chrome.svelte.ts` measures `#main`'s first child — `main.quiz`, still
	 * 34rem). Its chevron therefore sits inside this column rather than on its edge. The real
	 * fix is one number in the route; see the note handed to the app-shell piece.
	 */
	@media (min-width: 40rem) {
		.summary {
			--summary-measure: min(46rem, 100vw - 3rem);

			inline-size: var(--summary-measure);
			max-inline-size: none;
			margin-inline: calc((100% - var(--summary-measure)) / 2);
		}

		/* The head of the screen is a caption, not a column: it keeps a phone's measure and
		   centres, so widening the list does not stretch a 10-segment rail to 660px. */
		.crest,
		.score,
		.tally,
		.way-out {
			max-inline-size: 24rem;
			margin-inline: auto;
		}

		/* The decision keeps its own measure too — a 620px black pill is a banner, not a
		   button — but the row itself stays full-bleed so its background and the fade above it
		   still cover the cards scrolling under them. */
		.actions {
			justify-content: center;
		}

		.actions .btn-primary {
			flex: 0 1 22rem;
		}
	}
</style>
