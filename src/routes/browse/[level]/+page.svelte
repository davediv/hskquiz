<!--
	Browse one HSK level: every word in it, searchable, filtered by what you have done with it.

	WHY THIS SCREEN EXISTS
	A quiz app that only quizzes is a black box — you cannot see the syllabus, you cannot look
	something up, and you cannot answer "which ones do I keep missing?". This is the screen that
	makes the app worth opening when you are not in the mood to practise, and it competes
	directly with Pleco's search results (reference/screenshots/pleco/pleco-iphone-01.png): the
	same hanzi-then-pinyin-then-meaning ranking, the same hairline list, the same instant search.

	SCROLLING AND WINDOWING
	HSK 5 is 1,070 words. The list windows itself — only the rows near the viewport exist — but
	it scrolls with the *page*, not inside its own scroller, so iOS keeps its collapsing address
	bar and the sticky search field above it keeps working. All the arithmetic lives in
	`virtual.ts`; this file only feeds it six measured numbers and renders the slice it names.

	Everything about the geometry is measured rather than assumed: the row height comes off a
	real rendered row (so it is defined once, in CSS), and the sticky block publishes its own
	height as `--browse-sticky-h` so focus rings and scroll targets clear it.

	NO `+page.ts`
	Progress is `localStorage` and the word list is a lazily-loaded chunk, so a load function
	could only shift 1,070 entries of JSON into the SSR payload to save one dynamic import. The
	server renders the chrome and a skeleton; the list arrives on the client.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import { error } from '@sveltejs/kit';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { Hanzi, Pinyin } from '$lib/design';
	import { loadLevel } from '$lib/data';
	import { SHIPPED_SIZES } from '$lib/data/sizes';
	import { progress } from '$lib/progress';
	import { parseLevelSegment as toLevel } from '$lib/levels/route';
	import { LEVELS, LEVEL_SIZES, type Level, type Word } from '$lib/types';
	import LevelSwitch from '$lib/components/browse/LevelSwitch.svelte';
	import SearchField from '$lib/components/browse/SearchField.svelte';
	import StatusChips from '$lib/components/browse/StatusFilter.svelte';
	import WordRow from '$lib/components/browse/WordRow.svelte';
	import WordSheet from '$lib/components/browse/WordSheet.svelte';
	import { ensureCharIndex, levelLists } from '$lib/components/browse/related';
	import { searchWords } from '$lib/components/browse/search';
	import { scrollToShow, windowFor } from '$lib/components/browse/virtual';
	import {
		STATUS_META,
		hasChips,
		statusCounts,
		statusFor,
		statusMap,
		statusOf,
		visibleFilters,
		type StatusFilter,
		type WordStatus
	} from '$lib/components/browse/status';

	type Phase = 'loading' | 'ready' | 'failed';

	/** Rows rendered before the first measurement, and the whole list without JavaScript. */
	const PROBE_ROWS = 24;
	/** List width at which a second column stops being cramped. */
	const TWO_COLUMN_PX = 640;
	/** Breathing room between a keyboard-focused row and the edge it was scrolled to. */
	const FOCUS_GAP = 8;
	/** Placeholder rows while the level's chunk is in flight. */
	const SKELETON = Array.from({ length: 10 }, (_, i) => i);

	if (toLevel(page.params.level) === null) {
		error(404, 'Not a level');
	}

	const level = $derived(toLevel(page.params.level));

	let words = $state<Word[]>([]);
	let phase = $state<Phase>('loading');
	/**
	 * Seeded from `?q=`, which is how the empty screen hands a query to another level: search is
	 * one level at a time, so "nothing here matches aihao, HSK 1 has 1" has to arrive there with
	 * the query still typed or the offer is a dead link.
	 */
	let query = $state(page.url.searchParams.get('q') ?? '');
	let filter = $state<StatusFilter>('all');
	let openIndex = $state<number | null>(null);
	/**
	 * Words reached from inside the sheet by tapping a character's word list. The list row you
	 * started from is still `openIndex`, so closing still returns focus to it and the trail is
	 * only the detour — 安慰 → 安 → 安排 is one row and two pushes, and Escape unwinds it.
	 * Cross-level by design: 慰问 is HSK 5 no matter which level you were browsing.
	 */
	let trail = $state<Word[]>([]);

	// Progress lives in localStorage, so the server renders an empty store and the client a
	// full one. Holding every progress-driven value back until after hydration keeps the two
	// in agreement — the markup is the same shape either way, so nothing jumps.
	// NB: must not be named `state` — Svelte reads `$state` as store access on such a binding.
	let hydrated = $state(false);

	/** Guards a slow chunk from landing after the learner has already switched level. */
	let loadId = 0;

	async function load(target: Level) {
		const id = ++loadId;
		phase = 'loading';
		words = [];
		try {
			const list = await loadLevel(target);
			if (id !== loadId) return;
			words = list;
			phase = 'ready';
		} catch {
			if (id === loadId) phase = 'failed';
		}
	}

	$effect(() => {
		const target = level;
		// Arriving from another level's "HSK 1 has 1 match" carries the query with it; arriving
		// from the level pills carries none, which clears whatever was typed. Both are the URL
		// speaking, so both are read from it.
		const carried = page.url.searchParams.get('q') ?? '';
		untrack(() => {
			if (carried !== query) query = carried;
		});
		// The first client effect on this screen, so it is also the moment the server's
		// empty-progress markup has been matched and the real store is safe to read.
		hydrated = true;
		if (target === null) {
			error(404, 'Not a level');
		}
		openIndex = null;
		trail = [];
		void load(target);
	});

	/**
	 * Warm the cross-level character index once this level's own list has landed.
	 *
	 * The sheet's character cards read every level, so without this the first word a learner
	 * opens would wait on four more chunks. Deferred rather than eager: the level in front of
	 * them loads first and uncontended, and a learner who only ever scrolls the list pays
	 * nothing for it. `requestIdleCallback` is not in Safari, hence the timeout fallback.
	 */
	$effect(() => {
		if (phase !== 'ready') return;
		const warm = () => void ensureCharIndex().catch(() => {});
		if (typeof requestIdleCallback === 'function') {
			const handle = requestIdleCallback(warm, { timeout: 2000 });
			return () => cancelIdleCallback(handle);
		}
		const handle = setTimeout(warm, 600);
		return () => clearTimeout(handle);
	});

	const snapshot = $derived(hydrated ? progress.state : null);

	const statuses = $derived(
		level === null ? new Map<string, WordStatus>() : statusMap(snapshot, level, words)
	);
	const searched = $derived(
		level === null ? ([] as readonly Word[]) : searchWords(level, words, query)
	);
	const filtered = $derived(
		filter === 'all' ? searched : searched.filter((word) => statusFor(statuses, word.id) === filter)
	);

	/** The level's own buckets. What a chip says is scoped to the search; whether it exists is
	    not — see `visibleFilters`. */
	const levelCounts = $derived(statusCounts(statuses, words.length));

	// Chip counts describe the current *search*, so tapping a chip can never produce fewer
	// results than its own number. With no query that is the whole level, and `statusMap` has
	// already done the walk; with a query the result set is small enough to bucket directly.
	const counts = $derived.by(() => {
		if (query.trim() === '') return levelCounts;
		const scoped: [string, WordStatus][] = [];
		for (const word of searched) {
			const status = statuses.get(word.id);
			if (status) scoped.push([word.id, status]);
		}
		return statusCounts(new Map(scoped), searched.length);
	});

	const chipList = $derived(visibleFilters(levelCounts, filter));

	/**
	 * Does the store hold anything at all for this level?
	 *
	 * Answerable before the word list arrives, which the chip list is not: `statusMap` checks
	 * every record against the shipped ids, so until the chunk lands every bucket reads 0. A
	 * record for this level means a second bucket exists — `new` is always offered and a record
	 * is by definition not `new` — so this is exactly the question "will there be a chip row",
	 * asked early enough to reserve its height instead of dropping the list 45px when the
	 * chunk lands. Prefix only, because it decides a row's existence and not a number.
	 */
	const hasLevelHistory = $derived.by(() => {
		const byWord = snapshot?.byWord;
		if (!byWord || level === null) return false;
		const prefix = `L${level}-`;
		for (const wordId of Object.keys(byWord)) {
			if (wordId.startsWith(prefix)) return true;
		}
		return false;
	});

	/**
	 * Whether the chip row is worth a row.
	 *
	 * On a level nobody has practised there is exactly one bucket, and a lone "500 New" chip
	 * under a header that has just said 500 was the third printing of one number. Below two
	 * chips the row does not render at all and this screen's whole chrome is one 44px control
	 * row — 118px to the first Chinese character, which is what a first open should cost.
	 */
	const showChips = $derived(phase === 'ready' ? hasChips(chipList) : hasLevelHistory);

	// ---------------------------------------------------------------- geometry ---------

	let listEl = $state<HTMLElement | null>(null);
	let controlsEl = $state<HTMLElement | null>(null);
	let rowHeight = $state(0);
	let listTop = $state(0);
	let cols = $state(1);
	let viewportHeight = $state(0);
	let scrollTop = $state(0);
	/** Everything pinned above the list: the app bar plus this screen's controls. */
	let stickyH = $state(0);

	/** Signed px of the last scroll step, which is what buys the window reach on a fling. */
	let travel = $state(0);

	const measured = $derived(rowHeight > 0);
	const win = $derived(
		windowFor({
			count: filtered.length,
			cols,
			rowHeight,
			listTop,
			scrollTop,
			viewportHeight,
			travel
		})
	);
	const startIndex = $derived(measured ? win.startIndex : 0);
	const visible = $derived(
		measured ? filtered.slice(win.startIndex, win.endIndex) : filtered.slice(0, PROBE_ROWS)
	);

	/**
	 * Read the six numbers `windowFor` runs on straight off the DOM. Every write is guarded by
	 * a comparison so this is safe to call from a ResizeObserver without looping.
	 */
	function measure() {
		if (typeof window === 'undefined') return;

		if (window.innerHeight !== viewportHeight) viewportHeight = window.innerHeight;

		if (controlsEl) {
			// The sticky offset is authored as a calc() in CSS; the computed value is px, so the
			// header height never has to be restated in TypeScript.
			const offset = Number.parseFloat(getComputedStyle(controlsEl).top) || 0;
			const next = offset + controlsEl.offsetHeight;
			if (Math.abs(next - stickyH) > 0.5) stickyH = next;
		}

		if (!listEl) return;

		const top = listEl.getBoundingClientRect().top + window.scrollY;
		if (Math.abs(top - listTop) > 0.5) listTop = top;

		const nextCols = listEl.clientWidth >= TWO_COLUMN_PX ? 2 : 1;
		if (nextCols !== cols) cols = nextCols;

		const row = listEl.querySelector<HTMLElement>('[data-index]');
		if (row) {
			const height = row.getBoundingClientRect().height;
			if (height > 0 && Math.abs(height - rowHeight) > 0.5) rowHeight = height;
		}
	}

	$effect(() => {
		untrack(measure);
		scrollTop = window.scrollY;

		// Read on the event rather than inside a requestAnimationFrame. The rAF hop was one
		// frame of latency between the compositor moving the page and the rows for the new
		// position existing, and on a fast fling that frame is a screen of blank cream. A
		// passive scroll listener already fires at most once per frame, and Svelte flushes the
		// re-render before paint, so the rows land in the same frame the scroll did.
		let settle: ReturnType<typeof setTimeout> | undefined;
		const onScroll = () => {
			const next = window.scrollY;
			travel = next - scrollTop;
			scrollTop = next;
			// Travel is momentary. Left standing it would keep a fling-sized window in the DOM
			// for as long as the learner sits still reading it.
			clearTimeout(settle);
			settle = setTimeout(() => (travel = 0), 120);
		};
		const onResize = () => untrack(measure);

		window.addEventListener('scroll', onScroll, { passive: true });
		window.addEventListener('resize', onResize);

		// The controls are what sits between the top of the document and the top of the list, so
		// a chip row appearing is the one thing that can move `listTop` without a resize.
		const observer = new ResizeObserver(onResize);
		if (controlsEl) observer.observe(controlsEl);

		return () => {
			clearTimeout(settle);
			window.removeEventListener('scroll', onScroll);
			window.removeEventListener('resize', onResize);
			observer.disconnect();
		};
	});

	// Re-measure whenever the thing being measured has just changed shape: the first rows to
	// arrive are what the row height is read from.
	$effect(() => {
		void phase;
		void filtered.length;
		untrack(measure);
	});

	// Narrowing the list should show its top. Only ever scrolls up, and only when the first
	// result is above the fold — a learner who has not scrolled sees nothing move.
	let lastKey = '';
	$effect(() => {
		const key = `${level}|${query}|${filter}`;
		untrack(() => {
			if (key === lastKey) return;
			const first = lastKey === '';
			lastKey = key;
			if (first) return;
			const ceiling = Math.max(0, listTop - stickyH - 8);
			if (window.scrollY > ceiling) window.scrollTo({ top: ceiling });
		});
	});

	// ---------------------------------------------------------------- keyboard ---------

	let pendingFocus = $state<number | null>(null);

	/** Put row `index` on screen, clear of the sticky controls, then focus it once it exists. */
	function focusRow(index: number) {
		if (filtered.length === 0) return;
		const target = Math.max(0, Math.min(index, filtered.length - 1));
		const raw = scrollToShow(
			target,
			{ cols, rowHeight, listTop, scrollTop: window.scrollY, viewportHeight: window.innerHeight },
			stickyH + FOCUS_GAP
		);
		// `scrollToShow` lands the row flush against the edge it came in from. The focus ring is
		// 3px thick at 3px offset, so flush against the *bottom* clips it — going one gap further
		// costs nothing and keeps the ring whole. The top edge already has its inset.
		const next = raw > window.scrollY ? raw + FOCUS_GAP : raw;
		if (Math.abs(next - window.scrollY) > 1) {
			// Set the state as well as scrolling: the window has to widen in this tick, or the
			// row we are about to focus is not in the DOM yet.
			scrollTop = next;
			window.scrollTo({ top: next });
		}
		pendingFocus = target;
	}

	$effect(() => {
		const target = pendingFocus;
		if (target === null) return;
		// Depend on the rendered slice, so this retries after a scroll widens it.
		void win.startIndex;
		void win.endIndex;
		const row = listEl?.querySelector<HTMLElement>(`[data-index="${target}"]`);
		if (!row) return;
		row.focus();
		untrack(() => (pendingFocus = null));
	});

	function onWindowKeydown(event: KeyboardEvent) {
		if (openIndex !== null) return;
		if (event.metaKey || event.ctrlKey || event.altKey) return;

		const target = event.target;
		if (!(target instanceof HTMLElement)) return;
		const row = target.closest<HTMLElement>('[data-index]');
		if (!row || !listEl?.contains(row)) return;

		const at = Number(row.dataset.index);
		if (!Number.isFinite(at)) return;

		const step =
			event.key === 'ArrowDown'
				? cols
				: event.key === 'ArrowUp'
					? -cols
					: event.key === 'ArrowRight'
						? 1
						: event.key === 'ArrowLeft'
							? -1
							: 0;

		if (step !== 0) {
			event.preventDefault();
			focusRow(at + step);
			return;
		}
		if (event.key === 'Home') {
			event.preventDefault();
			focusRow(0);
		} else if (event.key === 'End') {
			event.preventDefault();
			focusRow(filtered.length - 1);
		}
	}

	// ---------------------------------------------------------------- the sheet --------

	const openWord = $derived(openIndex === null ? null : (filtered[openIndex] ?? null));
	/** What the sheet actually shows: the row you opened, or the last word you followed to. */
	const sheetWord = $derived(trail.length > 0 ? trail[trail.length - 1] : openWord);
	const sheetFrom = $derived(
		trail.length > 1 ? trail[trail.length - 2] : trail.length === 1 ? openWord : null
	);

	// The list can narrow under an open sheet — a level chunk landing late, another tab's
	// progress arriving. If the word it was showing is gone, so is the sheet.
	$effect(() => {
		if (openIndex !== null && openWord === null) {
			openIndex = null;
			trail = [];
		}
	});

	function closeSheet() {
		const index = openIndex;
		openIndex = null;
		trail = [];
		if (index !== null) focusRow(index);
	}

	function stepSheet(delta: number) {
		if (openIndex === null || trail.length > 0) return;
		const next = openIndex + delta;
		if (next < 0 || next >= filtered.length) return;
		openIndex = next;
	}

	/**
	 * Follow a character's word list. Capped so a learner cannot walk 安 → 安全 → 全部 → … into
	 * a stack that Escape takes a minute to unwind; at the cap the oldest step is dropped, which
	 * keeps "back" honest about the word it names.
	 */
	const TRAIL_MAX = 12;

	function followWord(word: Word) {
		if (word.id === sheetWord?.id) return;
		const next = [...trail, word];
		trail = next.length > TRAIL_MAX ? next.slice(next.length - TRAIL_MAX) : next;
	}

	function backSheet() {
		if (trail.length === 0) return;
		trail = trail.slice(0, -1);
	}

	// ---------------------------------------------------------------- copy -------------

	/** Official rows minus shipped cards for this level: 1 for HSK 5, 2 for HSK 2, 0 for HSK 1. */
	const merged = $derived(level === null ? 0 : LEVEL_SIZES[level] - SHIPPED_SIZES[level]);

	const countLabel = $derived.by(() => {
		// Deliberately not the official size from `LEVEL_SIZES`: a handful of official rows
		// collapse into one card (爸爸|爸), so the shipped list is a word or two shorter and
		// showing 1,071 here would only be corrected to 1,070 a moment later.
		if (phase !== 'ready') return 'Loading…';
		const n = filtered.length;
		const shown = n.toLocaleString('en');
		if (query.trim() !== '') return n === 1 ? '1 match' : `${shown} matches`;
		if (filter !== 'all') return `${shown} ${STATUS_META[filter].label.toLowerCase()}`;
		return n === 1 ? '1 word' : `${shown} words`;
	});

	/** This level's own list has nothing for what was typed — the one state the offer serves. */
	const stranded = $derived(phase === 'ready' && query.trim() !== '' && searched.length === 0);

	/**
	 * The other four levels' word lists, mirrored into reactive state.
	 *
	 * `related.ts` caches them as a module binding and hands them out through `levelLists()`;
	 * that is a snapshot, so it has to be *pulled* into `$state` at the moment it becomes true,
	 * exactly as `WordSheet` mirrors `charIndexNow()`. Nothing else on this screen may read the
	 * function directly.
	 */
	let crossLists = $state<ReadonlyMap<Level, readonly Word[]> | null>(null);
	let crossPhase = $state<'idle' | 'loading' | 'failed'>('idle');

	/**
	 * Fetch them the moment the learner is stranded, rather than on the idle warm-up.
	 *
	 * The warm-up exists for the sheet's character cards and is deliberately lazy — up to two
	 * seconds of `requestIdleCallback` timeout. That is the right budget for something nobody is
	 * waiting on and the wrong one for the answer to the question on screen, so an empty search
	 * asks for the lists itself. `ensureCharIndex` de-duplicates: if the warm-up is already in
	 * flight this joins it rather than pulling the four chunks twice.
	 */
	$effect(() => {
		if (!stranded) return;
		untrack(() => {
			if (crossLists !== null || crossPhase === 'loading') return;
			crossPhase = 'loading';
			void ensureCharIndex()
				.then(() => {
					crossLists = levelLists();
					crossPhase = 'idle';
				})
				.catch(() => {
					crossPhase = 'failed';
				});
		});
	});

	/**
	 * The same query run against the other four levels, and only when this one found nothing.
	 *
	 * Search is level-scoped — one index per level, built lazily — and until loop 4 the empty
	 * screen dealt with that by suggesting “aihao”, a query that returns nothing anywhere except
	 * HSK 1. Being level-scoped is a defensible design; stranding the learner inside it twice is
	 * not. The word lists are already in memory (the character index pulled them down), so the
	 * screen can say exactly where the word they typed actually lives.
	 *
	 * IT READS `crossLists`, NEVER `levelLists()`. That function returns a plain module-level
	 * binding — not `$state` — so a `$derived` that called it had no dependency on it and never
	 * re-ran when the lists landed. The offer therefore appeared for a query the learner *typed*
	 * (some later keystroke re-ran the derivation by accident) and never for one that arrived in
	 * the URL: `/browse/1?q=安慰` said “Nothing in HSK 1 matches 安慰” and stopped there, for a
	 * word the app ships. A shared link, a back-navigation and this screen's own `?q=` hop all
	 * took that dead path. `crossLists` below is the same map mirrored into reactive state.
	 */
	const elsewhere = $derived.by(() => {
		if (level === null || phase !== 'ready') return [];
		// `searched`, not `filtered`: if the level has the word and a status chip is hiding it,
		// the answer is that chip, not another level.
		if (query.trim() === '' || searched.length > 0) return [];
		const lists = crossLists;
		if (lists === null) return [];

		const found: { level: Level; count: number; first: Word }[] = [];
		for (const other of LEVELS) {
			if (other === level) continue;
			const list = lists.get(other);
			if (list === undefined) continue;
			const hits = searchWords(other, list, query);
			if (hits.length > 0) found.push({ level: other, count: hits.length, first: hits[0] });
		}
		return found;
	});

	/** True while the other four levels are still on their way. */
	const crossPending = $derived(stranded && crossLists === null && crossPhase !== 'failed');

	/** The query, escaped once, for the `?q=` the offers above carry to the level they name. */
	const carried = $derived(encodeURIComponent(query.trim()));

	/**
	 * What the field can be told, in as many words as the field is wide.
	 *
	 * The level switch shares its row now, so the field is 189px at 375 and the sentence it
	 * carried does not fit — it rendered as "hanzi, pinyin or me", which teaches nothing and
	 * looks broken. Below 480px the two inputs a learner reaches for first are named and the
	 * third is left to `aria-label` and the empty screen's own manual, both of which still say
	 * meanings are searchable; below 360px the conjunction goes too. Measured, not guessed:
	 * 180 / 108 / 92px of text against 141px of field at 375 and 98px at 320. CSS cannot set an
	 * attribute, which is the one case `MediaQuery` is for; `roomy` falls back to true so the
	 * server renders the 375px answer and the common phone never changes text on hydrate.
	 */
	const wide = new MediaQuery('min-width: 30rem', false);
	const roomy = new MediaQuery('min-width: 22.5rem', true);
	const searchHint = $derived(
		wide.current ? 'hanzi, pinyin or meaning' : roomy.current ? 'hanzi or pinyin' : 'hanzi, pinyin'
	);

	/** The search manual, which is only worth reading once the app has run out of answers. */
	const SEARCH_HELP =
		'Pinyin needs no tone marks and is matched whole syllables at a time; you can also search a character, or an English word from the meaning.';

	/**
	 * Why the list is empty, and what to do about it. Never a bare "no results".
	 *
	 * THE COPY WAITS FOR THE LOOKUP. Until this loop the query branch printed four lines about
	 * how search works and the rescue card appeared *underneath* them — the learner read a
	 * manual and only then met the answer. The body is now one line while the other levels are
	 * checked, one line handing off to the card when there is one, and the manual only in the
	 * case it was written for: the word is nowhere in HSK 1–5.
	 */
	const emptyCopy = $derived.by(() => {
		if (query.trim() !== '') {
			// A status chip, not the query, is what emptied a list that has matches in it.
			if (filter !== 'all' && searched.length > 0) {
				const label = STATUS_META[filter].label.toLowerCase();
				return {
					mark: '无',
					pinyin: 'wú',
					title: `No ${label} words match “${query.trim()}”`,
					body: `HSK ${level} has ${searched.length === 1 ? '1 match' : `${searched.length} matches`} for it — none of them ${label}.`,
					action: 'clear-filter'
				} as const;
			}
			return {
				mark: '无',
				pinyin: 'wú',
				title: `Nothing in HSK ${level} matches “${query.trim()}”`,
				body: crossPending
					? 'Search covers one level at a time. Checking the other four…'
					: elsewhere.length === 1
						? 'Search covers one level at a time. Here is where it is:'
						: elsewhere.length > 1
							? `Search covers one level at a time. It turns up on ${elsewhere.length} of the others:`
							: crossPhase === 'failed'
								? `Search covers one level at a time. ${SEARCH_HELP}`
								: `Nothing in HSK 1–5 matches it either. ${SEARCH_HELP}`,
				action: 'clear-query'
			} as const;
		}
		if (filter === 'new') {
			return {
				mark: '全',
				pinyin: 'quán',
				title: `Every HSK ${level} word has been practised`,
				body: 'Nothing here is untouched — which is the good version of an empty screen.',
				action: 'clear-filter'
			} as const;
		}
		return {
			mark: '空',
			pinyin: 'kōng',
			title: `No ${STATUS_META[filter].label.toLowerCase()} words in HSK ${level} yet`,
			body:
				filter === 'shaky'
					? 'Nothing here has been missed. Words land in this list the moment you get one wrong.'
					: `${STATUS_META[filter].description}. Practise the level and words will start arriving here.`,
			action: 'clear-filter'
		} as const;
	});
</script>

<svelte:window onkeydown={onWindowKeydown} />

<main
	class="browse"
	data-rows={showChips ? 'two' : 'one'}
	style:--browse-sticky-h={stickyH > 0 ? `${stickyH}px` : null}
>
	{#if phase === 'failed'}
		<section class="panel">
			<p class="eyebrow">Could not load</p>
			<h2 class="panel-title">The HSK {level} word list did not arrive</h2>
			<p class="panel-body">
				That is usually the network. {#if progress.status === 'saving'}Nothing you have practised is
					lost — progress is kept on this device.{/if}
			</p>
			<button
				type="button"
				class="btn btn-primary btn-block"
				onclick={() => {
					if (level !== null) void load(level);
				}}
			>
				Try again
			</button>
			<a class="btn btn-quiet btn-block mt-2.5" href={resolve('/')}>Back to levels</a>
		</section>
	{:else}
		<!--
			ONE ROW OF CONTROLS, AND A SECOND ONLY WHEN IT HAS SOMETHING TO SAY.

			This was three stacked rows — level switch and word count, search field, chip strip —
			which put the first Chinese character 238px down an 812px phone: 29% of the viewport
			spent before the thing the screen is for. Pleco puts its first headword at ~8% with a
			keyboard up. The level switch and the field now share a single 44px row, the count
			row is gone (it printed the level's size a third time, after the chips and the
			colophon), and the chip strip only exists once there is more than one bucket to
			choose between.

			`.controls-inner` HOLDS EXACTLY THE ROWS AND NOTHING ELSE. The shell reads its
			children as the fold's snap points (chrome.svelte.ts, `foldStops`), descending
			through any single-child wrapper on the way — so a stray element in here becomes a
			legal place to cut the header in half. The live region below is inside `.bar`, where
			it is one of three and absolutely positioned, for exactly that reason.
		-->
		<div class="controls" bind:this={controlsEl}>
			<div class="controls-inner">
				<div class="bar">
					{#if level !== null}<LevelSwitch {level} />{/if}
					<SearchField bind:value={query} placeholder={searchHint} describedBy="browse-count" />
					<!-- The count still exists, it just no longer costs a row: it is the field's
					     description and the live region that tells a screen reader the list has
					     narrowed. On screen the chips carry the same numbers. -->
					<p id="browse-count" class="sr-only" role="status" aria-live="polite">
						{countLabel}
					</p>
				</div>
				{#if showChips}
					{#if phase === 'ready'}
						<StatusChips bind:value={filter} {counts} chips={chipList} />
					{:else}
						<!-- The strip's own footprint while the level's chunk is in flight, so the
						     list does not drop 45px the moment the counts become knowable. -->
						<div class="chips-hold" aria-hidden="true"></div>
					{/if}
				{/if}
			</div>
		</div>

		{#if phase === 'loading'}
			<p class="sr-only" role="status">Loading HSK {level} vocabulary.</p>
			<div class="list" aria-hidden="true">
				{#each SKELETON as slot (slot)}
					<div class="skeleton">
						<span class="bar hz"></span>
						<span class="bar gl"></span>
					</div>
				{/each}
			</div>
		{:else if filtered.length === 0}
			<section class="empty">
				<p class="mark" lang="zh-Hans" aria-hidden="true">{emptyCopy.mark}</p>
				<p class="mark-py pinyin" aria-hidden="true">{emptyCopy.pinyin}</p>
				<h2 class="empty-title">{emptyCopy.title}</h2>
				<p class="empty-body">{emptyCopy.body}</p>

				{#if elsewhere.length > 0}
					<!-- The one thing a stranded learner actually wants: the level the word is on,
					     with the query carried across so it is still typed when they land. It is
					     shaped like a list row rather than a chip — hanzi and pinyin on the first
					     line, the meaning under it — because the meaning is what tells them this
					     is the word they were looking for before they spend a tap on it. -->
					<ul class="elsewhere">
						{#each elsewhere as hit (hit.level)}
							<li>
								<a
									class="hop"
									href={resolve(`/browse/[level]?q=${carried}`, { level: String(hit.level) })}
								>
									<span class="hop-word">
										<Hanzi word={hit.first} size="xs" class="hop-hz" />
										<Pinyin word={hit.first} size="sm" class="hop-py" />
									</span>
									<span class="hop-level">HSK {hit.level}</span>
									<span class="hop-gloss">{hit.first.meanings.join(', ')}</span>
									<span class="hop-count tabular">
										{hit.count === 1 ? '1 match' : `${hit.count.toLocaleString('en')} matches`}
									</span>
									<span class="hop-go" aria-hidden="true">
										<svg viewBox="0 0 24 24" focusable="false">
											<path
												d="M9 5.5 16 12l-7 6.5"
												fill="none"
												stroke="currentColor"
												stroke-width="2"
												stroke-linecap="round"
												stroke-linejoin="round"
											/>
										</svg>
									</span>
								</a>
							</li>
						{/each}
					</ul>
				{:else if crossPending}
					<!-- The card's own footprint while the four chunks land, so the answer does not
					     shove the button it arrives above. -->
					<p class="hop-wait" aria-hidden="true"></p>
				{/if}

				{#if emptyCopy.action === 'clear-query'}
					<button type="button" class="btn btn-quiet" onclick={() => (query = '')}>
						Clear search
					</button>
				{:else}
					<button type="button" class="btn btn-quiet" onclick={() => (filter = 'all')}>
						{query.trim() === '' ? 'Show all words' : 'Search all words'}
					</button>
				{/if}
			</section>
		{:else}
			<!-- The column count is measured, not guessed, and CSS follows it — so the maths in
			     `windowFor` and the grid on screen can never disagree about what a row is. -->
			<div
				class="list"
				class:windowed={measured}
				role="list"
				aria-label={`HSK ${level} words`}
				bind:this={listEl}
				style:--browse-cols={cols}
				style:block-size={measured ? `${win.totalHeight}px` : null}
				style:padding-block-start={measured ? `${win.offsetTop}px` : null}
			>
				<!-- Keyed by word id: the slice slides as you scroll, so identity has to travel
				     with the word or every row would be re-rendered on every frame. -->
				{#each visible as word, i (word.id)}
					<WordRow
						{word}
						status={statusFor(statuses, word.id)}
						index={startIndex + i}
						total={filtered.length}
						onopen={(index) => {
							openIndex = index;
						}}
					/>
				{/each}
			</div>

			{#if level !== null && query.trim() === '' && filter === 'all' && merged > 0}
				<!-- The footnote the header count needs, kept off the header.
				     "1,070 words" up there disagrees with the standard this app cites, and the
				     home screen already says why in plain copy; browse carried the number with
				     none of the explanation. It belongs at the end of the list it qualifies,
				     which is also the only place on this screen that costs nothing. -->
				<p class="colophon">
					{SHIPPED_SIZES[level].toLocaleString('en')} cards from the standard's
					{LEVEL_SIZES[level].toLocaleString('en')} HSK {level} entries — {merged}
					{merged === 1 ? 'pair' : 'pairs'} of same-pinyin homographs
					{merged === 1 ? 'shares' : 'share'} a card.
				</p>
			{/if}
		{/if}
	{/if}

	{#if sheetWord !== null && openIndex !== null && level !== null}
		<!-- Status comes off the record rather than the level-scoped map: a followed word can
		     belong to any level, and `statuses` only holds this one's. -->
		<WordSheet
			word={sheetWord}
			status={statusOf(progress.forWord(sheetWord.id))}
			record={progress.forWord(sheetWord.id)}
			position={openIndex + 1}
			total={filtered.length}
			from={sheetFrom}
			onclose={closeSheet}
			onback={backSheet}
			onprev={() => stepSheet(-1)}
			onnext={() => stepSheet(1)}
			onfollow={followWord}
		/>
	{/if}
</main>

<style>
	.browse {
		/* Defined once, here: `WordRow` sizes itself from it and the windowing maths reads it
		   back off a rendered row rather than being told it a second time in TypeScript. */
		--browse-row-h: 4.75rem;

		/* The screen's own gutters, named once so the sticky block can cancel them and the chip
		   strip can run past them. `--browse-bleed-*` is how far a child may bleed: the gutter
		   on a phone, nothing once the controls become a single desktop row and the strip is
		   one cell of a grid. */
		--browse-gutter-start: max(var(--spacing-gutter), var(--app-safe-left, 0px));
		--browse-gutter-end: max(var(--spacing-gutter), var(--app-safe-right, 0px));
		--browse-bleed-start: var(--browse-gutter-start);
		--browse-bleed-end: var(--browse-gutter-end);

		/*
		 * The header's own geometry, in one place, because two other numbers are derived from it
		 * and a hand-written third is how this screen shipped a fold that cut a control in half.
		 * The budget is hard and it is arithmetic, not taste: the shell's bar is 57px at rest,
		 * this screen may not put its first row past 160px of an 812px phone, and a 44px field
		 * over a 36px chip row leaves 23px for every pad, gap, hairline and focus ring between
		 * them. Measured at 158px, at 320 / 360 / 375 / 390 / 414 / 430.
		 */
		--browse-pad-top: 0.375rem;
		/* Zero, because the chip strip below carries its own 0.375rem — it has to, or its
		   `overflow-x` clips the 6px focus ring off the top and bottom of every chip, which is
		   what it was doing. Paying for that padding twice is 6px this header does not have. */
		--browse-pad-end: 0rem;
		--browse-row-gap: 0.125rem;
		/* `--spacing-tap`. The search field is the one control on this screen that must be a
		   full-size target, and the row is exactly as tall as it. */
		--browse-bar-h: 2.75rem;

		/*
		 * Volunteered to the shell (see chrome.svelte.ts): once the app bar has docked, it may
		 * take this much more off our top edge. It is the control row plus everything above it,
		 * computed from the same three tokens the row is laid out from — so it lands exactly on
		 * the chip strip's own snap point and the fold is binary: the row is whole or it is
		 * gone — measured at 52px against a chip strip whose own top is 52px below the block's,
		 * which is the snap point the shell would pick anyway. A hand-written 3.375rem against a
		 * row that had grown to 50px is what left 14px of beige track and the top arc of the
		 * level pill wedged under the app bar at every scroll depth for two loops.
		 */
		--app-chrome-fold: calc(var(--browse-pad-top) + var(--browse-bar-h) + var(--browse-row-gap));

		inline-size: 100%;
		max-inline-size: var(--container-app);
		margin-inline: auto;
		padding-block-end: 2.5rem;
		padding-inline: var(--browse-gutter-start) var(--browse-gutter-end);
	}

	/* ------------------------------------------------------------------ controls ------ */

	.controls {
		position: sticky;
		/* The shell's own number: chrome total minus whatever of this screen's fold is
		   currently folded away. Spelling it out of `--app-header-h` was the old arrangement,
		   from when the shell drove that token negative to make room. */
		top: var(--app-sticky-top);
		z-index: 20;
		/* Full-bleed background so rows scrolling under it are covered edge to edge, while the
		   controls themselves stay on the text column. */
		margin-inline: calc(-1 * var(--browse-gutter-start)) calc(-1 * var(--browse-gutter-end));
		padding-inline: var(--browse-gutter-start) var(--browse-gutter-end);
		padding-block: var(--browse-pad-top) var(--browse-pad-end);
		border-block-end: 1px solid var(--color-line);
		/*
		 * Opaque, not glass. A translucent bar over a list of 14px Latin glosses does not read
		 * as depth, it reads as a printing fault: at 92% the descenders of "…of consciousness"
		 * came through the chip row on every scroll. Both references we are measured against
		 * (Pleco, Du Chinese) use flat opaque chrome over their lists for exactly this reason.
		 */
		background-color: var(--color-page);
	}

	/* Nothing but rows may live here — the shell cuts the fold on its children. See the note
	   on the markup above. */
	.controls-inner {
		display: flex;
		flex-direction: column;
		gap: var(--browse-row-gap);
	}

	/* Level switch and search field, one row, the field taking whatever the switch leaves. */
	.bar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-block-size: var(--browse-bar-h);
	}

	/* Exactly the strip's height: a 2.25rem chip plus the 0.375rem the scroller pads its own
	   block with at each end, so nothing moves when the real one replaces it. */
	.chips-hold {
		block-size: 3rem;
	}

	/* No chip strip: nothing below to pad against the hairline, and no second row to fold —
	   the shell would otherwise descend into the one row that is left and cut it at the
	   field's own top edge, shaving the header's padding off under the bar for no reason. */
	.browse[data-rows='one'] {
		--browse-pad-end: 0.4375rem;
		--app-chrome-fold: 0px;
	}

	/* ---------------------------------------------------------------------- list ------ */

	.list {
		/* `block-size` and `padding-block-start` are set inline from the windowing maths: the
		   padding is where the rendered slice starts, the height holds the scrollbar open for
		   the rows that do not exist. */
		box-sizing: border-box;
		/* Flush under the controls' hairline, which is what separates them — the 4px that used
		   to sit here is 4px of the 15px this header has left to spend, and both references
		   run their list straight off the bottom of the search bar. */
		margin-block-start: 0;
	}

	.list.windowed {
		/* Rows are absolute-free — they simply flow from the padding edge — so nothing here
		   needs a transform, and text selection across rows still works. */
		display: grid;
		grid-template-columns: repeat(var(--browse-cols, 1), minmax(0, 1fr));
		align-content: start;
		column-gap: 2.5rem;
	}

	@media (min-width: 60rem) {
		.browse {
			--browse-gutter-start: 2rem;
			--browse-gutter-end: 2rem;
			/* The controls are one row here and the chip strip is one cell of it, so nothing
			   bleeds: a strip pulled out to the page edge would leave the grid. */
			--browse-bleed-start: 0px;
			--browse-bleed-end: 0px;
			/*
			 * Nothing to fold from here up: `.controls` is a single row at this width, so there
			 * is no second row to hide and the shell has no snap point to cut on. Stated rather
			 * than left to the shell's own refusal, because a screen should know its own shape.
			 */
			--app-chrome-fold: 0px;

			max-inline-size: var(--container-wide);
		}

		.controls {
			padding-block: 0.75rem 0.625rem;
		}

		/* One row on a desktop: there is width for the level, the field and the chips side by
		   side, and the list gets the height back. `.bar` dissolves into the same grid rather
		   than nesting inside one cell, so the field still flexes against the chip strip and
		   not against the switch alone. */
		.controls-inner {
			display: grid;
			grid-template-columns: auto minmax(14rem, 1fr) auto;
			align-items: center;
			gap: 1rem;
		}

		.bar {
			display: contents;
		}
	}

	/* ------------------------------------------------------------------ skeleton ------ */

	.skeleton {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 0.5rem;
		block-size: var(--browse-row-h);
		border-block-end: 1px solid var(--color-line);
	}

	.skeleton .bar {
		display: block;
		border-radius: var(--radius-xs);
		background-color: var(--color-surface-sunken);
		animation: browse-fade 1.4s var(--ease-in-out-soft) infinite;
	}

	.skeleton .hz {
		inline-size: 7.5rem;
		block-size: 1.5rem;
	}

	.skeleton .gl {
		inline-size: 11rem;
		block-size: 0.75rem;
	}

	@keyframes browse-fade {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.45;
		}
	}

	/* --------------------------------------------------------------------- empty ------ */

	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		max-inline-size: 30rem;
		margin-inline: auto;
		padding-block: 3.5rem 2rem;
		text-align: center;
	}

	.mark {
		margin: 0;
		color: var(--color-line-strong);
		font-family: var(--font-hanzi);
		font-size: var(--text-hanzi-lg);
		line-height: 1;
		opacity: 0.55;
	}

	.mark-py {
		margin: 0.5rem 0 0;
		color: var(--color-ink-subtle);
		font-size: var(--text-pinyin-sm);
	}

	.empty-title {
		margin: 1.25rem 0 0;
		font-size: var(--text-lg);
		text-wrap: balance;
	}

	.empty-body {
		margin: 0.5rem 0 1.5rem;
		color: var(--color-ink-muted);
		font-size: var(--text-sm);
	}

	/* Where the word they typed actually is. Rows rather than a sentence: there can be four of
	   them, and each one is a destination. */
	.elsewhere {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		inline-size: 100%;
		margin: -0.5rem 0 1.5rem;
		padding: 0;
		list-style: none;
		text-align: start;
	}

	.hop {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto auto;
		grid-template-areas:
			'word level go'
			'gloss count go';
		align-items: center;
		gap: 0.125rem 0.625rem;
		min-block-size: var(--spacing-tap);
		padding: 0.5rem 0.5rem 0.5rem 0.75rem;
		border: 1px solid var(--color-line);
		border-radius: var(--radius-md);
		color: inherit;
		text-decoration: none;
	}

	.hop-level {
		grid-area: level;
		color: var(--color-ink-subtle);
		font-size: var(--text-2xs);
		font-weight: 700;
		letter-spacing: 0.08em;
		white-space: nowrap;
	}

	.hop-word {
		display: flex;
		grid-area: word;
		align-items: baseline;
		gap: 0.375rem;
		min-inline-size: 0;
		overflow: hidden;
	}

	/* The line that confirms it is the word they meant. One line, clipped — a rescue offer is
	   a signpost, not an entry. */
	.hop-gloss {
		grid-area: gloss;
		min-inline-size: 0;
		overflow: hidden;
		color: var(--color-ink-muted);
		font-size: var(--text-sm);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* The row is a destination, so it says so the way every other row in this app does. */
	.hop-go {
		display: grid;
		grid-area: go;
		place-items: center;
		inline-size: 1.5rem;
		color: var(--color-ink-subtle);
	}

	.hop-go svg {
		inline-size: 1.125rem;
		block-size: 1.125rem;
	}

	/* The space the offer is about to occupy. Holding it open costs one empty box and saves the
	   button below from jumping under a thumb already on its way to it. The outline fades in a
	   quarter-second late, so the usual sub-300ms lookup never flashes a frame of it and only a
	   wait long enough to notice gets something to look at. */
	.hop-wait {
		inline-size: 100%;
		block-size: 3.9375rem;
		margin: -0.5rem 0 1.5rem;
		border: 1px dashed var(--color-line);
		border-radius: var(--radius-md);
		opacity: 0;
		animation: hop-wait-in 240ms var(--ease-out-soft) 260ms forwards;
	}

	@keyframes hop-wait-in {
		to {
			opacity: 1;
		}
	}

	.hop :global(.hop-hz) {
		flex: none;
		color: var(--color-ink);
	}

	.hop :global(.hop-py) {
		min-inline-size: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.hop-count {
		grid-area: count;
		color: var(--color-ink-subtle);
		font-size: var(--text-xs);
		text-align: end;
		white-space: nowrap;
	}

	@media (hover: hover) {
		.hop:hover {
			border-color: var(--color-line-strong);
			background-color: var(--color-surface-sunken);
		}
	}

	/* The footnote to the header's word count, at the end of the list it qualifies. */
	.colophon {
		max-inline-size: 34rem;
		margin: 1.5rem auto 0;
		padding-block-end: 0.5rem;
		color: var(--color-ink-subtle);
		font-size: var(--text-xs);
		text-align: center;
		text-wrap: pretty;
	}

	/* ----------------------------------------------------------------- dead ends ------ */

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
</style>
