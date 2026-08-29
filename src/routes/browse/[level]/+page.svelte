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
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { Hanzi, Pinyin } from '$lib/design';
	import { loadLevel } from '$lib/data';
	import { SHIPPED_SIZES } from '$lib/data/sizes';
	import { progress } from '$lib/progress';
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
		statusCounts,
		statusFor,
		statusMap,
		statusOf,
		type StatusFilter,
		type WordStatus
	} from '$lib/components/browse/status';

	type Phase = 'loading' | 'ready' | 'failed' | 'no-level';

	/** Rows rendered before the first measurement, and the whole list without JavaScript. */
	const PROBE_ROWS = 24;
	/** List width at which a second column stops being cramped. */
	const TWO_COLUMN_PX = 640;
	/** Breathing room between a keyboard-focused row and the edge it was scrolled to. */
	const FOCUS_GAP = 8;
	/** Placeholder rows while the level's chunk is in flight. */
	const SKELETON = Array.from({ length: 10 }, (_, i) => i);

	function toLevel(segment: string | undefined): Level | null {
		if (typeof segment !== 'string' || segment.trim() === '') return null;
		const n = Number(segment);
		return LEVELS.find((level) => level === n) ?? null;
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
			loadId++;
			words = [];
			phase = 'no-level';
			return;
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

	// Chip counts describe the current *search*, so tapping a chip can never produce fewer
	// results than its own number. With no query that is the whole level, and `statusMap` has
	// already done the walk; with a query the result set is small enough to bucket directly.
	const counts = $derived.by(() => {
		if (query.trim() === '') return statusCounts(statuses, words.length);
		const scoped: [string, WordStatus][] = [];
		for (const word of searched) {
			const status = statuses.get(word.id);
			if (status) scoped.push([word.id, status]);
		}
		return statusCounts(new Map(scoped), searched.length);
	});

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

	/**
	 * The same query run against the other four levels, and only when this one found nothing.
	 *
	 * Search is level-scoped — one index per level, built lazily — and until this loop the empty
	 * screen dealt with that by suggesting “aihao”, a query that returns nothing anywhere except
	 * HSK 1. Being level-scoped is a defensible design; stranding the learner inside it twice is
	 * not. The word lists are already in memory (the character index pulled them down), so the
	 * screen can say exactly where the word they typed actually lives.
	 */
	const elsewhere = $derived.by(() => {
		if (level === null || phase !== 'ready') return [];
		if (query.trim() === '' || filtered.length > 0) return [];
		const lists = levelLists();
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

	/** The query, escaped once, for the `?q=` the offers above carry to the level they name. */
	const carried = $derived(encodeURIComponent(query.trim()));

	/** Why the list is empty, and what to do about it. Never a bare "no results". */
	const emptyCopy = $derived.by(() => {
		if (query.trim() !== '') {
			return {
				mark: '无',
				pinyin: 'wú',
				title: `Nothing in HSK ${level} matches “${query.trim()}”`,
				body:
					filter === 'all'
						? 'Search covers one level at a time. Pinyin needs no tone marks and is matched whole syllables at a time; you can also search a character, or an English word from the meaning.'
						: `Nothing here is filed under ${STATUS_META[filter].label.toLowerCase()}. Search across every word in the level instead.`,
				action: filter === 'all' ? 'clear-query' : 'clear-filter'
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

<main class="browse" style:--browse-sticky-h={stickyH > 0 ? `${stickyH}px` : null}>
	{#if phase === 'no-level'}
		<section class="panel">
			<p class="eyebrow">Not a level</p>
			<h1 class="panel-title">hskquiz covers HSK 1 to 5</h1>
			<p class="panel-body">
				There is no level “{page.params.level}”. The five official HSK 3.0 word lists are below.
			</p>
			<ul class="jump">
				{#each LEVELS as choice (choice)}
					<li>
						<a class="jump-link" href={resolve('/browse/[level]', { level: String(choice) })}>
							HSK {choice}
						</a>
					</li>
				{/each}
			</ul>
			<a class="btn btn-quiet btn-block" href={resolve('/')}>Back to levels</a>
		</section>
	{:else if phase === 'failed'}
		<section class="panel">
			<p class="eyebrow">Could not load</p>
			<h2 class="panel-title">The HSK {level} word list did not arrive</h2>
			<p class="panel-body">
				That is usually the network. Nothing you have practised is lost — progress is kept on this
				device.
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
		<div class="controls" bind:this={controlsEl}>
			<div class="controls-inner">
				<div class="top">
					{#if level !== null}<LevelSwitch {level} />{/if}
					<p id="browse-count" class="count tabular" role="status" aria-live="polite">
						{countLabel}
					</p>
				</div>
				<SearchField
					bind:value={query}
					placeholder="hanzi, pinyin or meaning"
					describedBy="browse-count"
				/>
				<StatusChips bind:value={filter} {counts} />
			</div>
		</div>

		{#if phase === 'loading'}
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
					     with the query carried across so it is still typed when they land. -->
					<ul class="elsewhere">
						{#each elsewhere as hit (hit.level)}
							<li>
								<a
									class="hop"
									href={resolve(`/browse/[level]?q=${carried}`, { level: String(hit.level) })}
								>
									<span class="hop-level">HSK {hit.level}</span>
									<span class="hop-word">
										<Hanzi word={hit.first} size="xs" class="hop-hz" />
										<Pinyin word={hit.first} size="sm" class="hop-py" />
									</span>
									<span class="hop-count tabular">
										{hit.count === 1 ? '1 match' : `${hit.count.toLocaleString('en')} matches`}
									</span>
								</a>
							</li>
						{/each}
					</ul>
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
		 * Volunteered to the shell (see chrome.svelte.ts): once the app bar has retracted, it
		 * may take this much more off our top edge. 3.375rem is exactly the level-pills-and-
		 * count row — 0.625rem of `.controls` padding-block-start + the 2.25rem `.top` row +
		 * the 0.5rem gap beneath it — so the search field and the status chips are what stay,
		 * and the pills come back the instant the user scrolls up. `.controls` sticks to
		 * `--app-sticky-top`, which is the shell's chrome total already minus this fold.
		 */
		--app-chrome-fold: 3.375rem;

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
		padding-block: 0.625rem 0.5rem;
		border-block-end: 1px solid var(--color-line);
		/*
		 * Opaque, not glass. A translucent bar over a list of 14px Latin glosses does not read
		 * as depth, it reads as a printing fault: at 92% the descenders of "…of consciousness"
		 * came through the chip row on every scroll. Both references we are measured against
		 * (Pleco, Du Chinese) use flat opaque chrome over their lists for exactly this reason.
		 */
		background-color: var(--color-page);
	}

	.controls-inner {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		min-block-size: 2.25rem;
	}

	.count {
		margin: 0;
		color: var(--color-ink-subtle);
		font-size: var(--text-xs);
		white-space: nowrap;
	}

	/* ---------------------------------------------------------------------- list ------ */

	.list {
		/* `block-size` and `padding-block-start` are set inline from the windowing maths: the
		   padding is where the rendered slice starts, the height holds the scrollbar open for
		   the rows that do not exist. */
		box-sizing: border-box;
		margin-block-start: 0.25rem;
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
			 * Nothing to fold from here up. `.controls` collapses to a single 67px row at this
			 * width, so the 3.375rem the phone stack volunteers would eat all but 13px of it.
			 * The shell refuses a fold a screen cannot afford whole, so the rendering is right
			 * either way — but the screen should state its own number rather than lean on that.
			 */
			--app-chrome-fold: 0px;

			max-inline-size: var(--container-wide);
		}

		.controls {
			padding-block: 0.75rem 0.625rem;
		}

		/* One row on a desktop: there is width for the level, the field and the chips side by
		   side, and the list gets the height back. */
		.controls-inner {
			display: grid;
			grid-template-columns: auto minmax(14rem, 1fr) auto;
			align-items: center;
			gap: 1rem;
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
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.625rem;
		min-block-size: var(--spacing-tap);
		padding: 0.375rem 0.75rem;
		border: 1px solid var(--color-line);
		border-radius: var(--radius-md);
		color: inherit;
		text-decoration: none;
	}

	.hop-level {
		color: var(--color-ink-subtle);
		font-size: var(--text-2xs);
		font-weight: 700;
		letter-spacing: 0.08em;
		white-space: nowrap;
	}

	.hop-word {
		display: flex;
		align-items: baseline;
		gap: 0.375rem;
		min-inline-size: 0;
		overflow: hidden;
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
		color: var(--color-ink-subtle);
		font-size: var(--text-xs);
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

	.jump {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 0 0 1.5rem;
		padding: 0;
		list-style: none;
	}

	.jump-link {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
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
		.jump-link:hover {
			background-color: var(--color-surface-sunken);
		}
	}
</style>
