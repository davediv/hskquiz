/**
 * The shell's chrome controller: how much chrome is on screen right now, and what column the
 * bar should line up with.
 *
 * WHY THE SHELL OWNS THIS AND NOT EACH SCREEN
 * Every screen that pins something to the top — browse's search + filters, the quiz's progress
 * rail, the level screen's desktop rail — offsets itself against `--app-header-h`. If the bar
 * is a fixed 56px forever, each of those stacks *under* a band that is doing nothing during a
 * scroll, and nobody is looking at the total. On `/browse/1` that total was 208px: a quarter of
 * an iPhone frame standing between the user and a 38,402px-tall word list. Pleco spends 72px on
 * the same job and Du Chinese 95px.
 *
 * THE BAR HAS A FLOOR. IT SHRINKS; IT DOES NOT LEAVE.
 * The first version of this controller let the bar retract to nothing, and `visible` was a bare
 * `barH - hidden` with nothing under it — so a screen that volunteered a fold drove
 * `--app-header-h` to -54px, `--app-chrome-h` to `calc(0px + -54px)`, and the skip link (which
 * rides the chrome) to top -46: the first tab stop on every page sat wholly outside the
 * viewport. Scrolled past the fold, `/browse/1` also had no back control and nothing naming the
 * level anywhere on a 38,402px document.
 *
 * So the retraction is now a *shrink between two ends*, not a disappearance:
 *
 *   expanded   --app-bar-h + the hairline   the full row: back, title, lateral action
 *   docked     --app-bar-min-h + hairline   the same row, compact — still a tap target on the
 *                                           back control and still the level's name
 *
 * `visible` can therefore never go below the docked height, and `--app-chrome-h` can never go
 * below the safe inset plus that. Both references we are measured against keep permanent
 * chrome: Du Chinese a bottom tab bar, Pleco a ~72px band. Ours is the top bar it already
 * argues is the navigation.
 *
 * THE BAR SLIDES; ITS BOX DOES NOT SHRINK
 * The obvious way to compact a bar is to animate its height. Do not: the header is a sticky
 * element IN FLOW, so shrinking it by 16px shortens the document by 16px, the browser's scroll
 * anchoring compensates with a 16px scroll, that scroll is a delta this controller reads, and
 * the bar changes size again. Tabbing into the bar on `/browse/1` — `reveal()` against
 * anchoring — put it in a 900↔916 / 41px↔57px oscillation that ran for as long as it was
 * watched. So `barOffset` translates the bar up instead and the bar pads its own row back down
 * by the same number: the border box stays exactly `--app-bar-h` + hairline at every point in
 * the travel, the document never reflows, and the row still recomposes at 40px rather than
 * being sliced off at the top edge.
 *
 * SCREENS CAN STILL FOLD THEIR OWN BLOCK — BUT WITH THEIR OWN NUMBER
 * Retracting 16px of bar is not on its own enough for a screen that stacks 151px of its own
 * search and filters underneath. So a screen may still declare `--app-chrome-fold: <length>`
 * on the element it renders directly inside `#main`, meaning "once the bar is docked, this
 * much of my sticky block is expendable". The shell keeps consuming scroll past the bar's own
 * travel and reports how much of that budget is currently spent as `--app-fold-h`, from which
 * it publishes `--app-sticky-top` — `--app-chrome-h` minus the fold. A screen that folds
 * offsets its sticky block against `--app-sticky-top` instead of `--app-chrome-h`; the
 * shell's own published height stays honest either way. `--app-chrome-fold` is registered as a
 * real `<length>` in shell.css so the computed value arrives in px and no unit maths is needed
 * here. Nobody declares it and the fold is simply 0.
 *
 * BUT THE CEILING IS THE SHELL'S, AND IT IS NOT A REQUEST
 * Volunteering is not a budget. `/browse/1` declared 3.375rem, kept the other 123px, and the
 * shell called that compliance: 234px of a 812px portrait frame (28.8%) and 224px of a 375px
 * landscape one (60%) before the first of 500 words — the same defect the paragraph above
 * says this controller exists to prevent, moved one screen sideways and left there for three
 * loops. The reason it survived is that every rule which shrinks chrome is keyed on WIDTH
 * while the thing being spent is HEIGHT.
 *
 * So there is now a ceiling the screen has no vote in: total sticky chrome may hold
 * `CHROME_CEILING` of `innerHeight`, and whatever a screen's block overruns it by, the shell
 * folds — snapped up to one of the block's own row boundaries, capped so the last row always
 * survives, declaration or no declaration. See `measureChrome`. The room and the overrun are
 * published too (`--app-chrome-room`, `--app-chrome-over`, `data-chrome-fit`), because a
 * screen that restructures to fit is strictly better than a screen that gets folded — folding
 * only recovers the space once the finger moves, and the ceiling is about what is on screen
 * when it has not.
 *
 * IT ALSO MEASURES THE SCREEN'S COLUMN
 * On a phone every route runs edge to edge and a full-bleed bar is right. On a desktop every
 * route pulls into a centred column of its own width — 34rem for a quiz, 64rem for browse,
 * whatever level select is using this week — and a full-bleed bar leaves its chevron 430px
 * from the content it belongs to, which is what "a phone app stretched" looks like. Rather
 * than hard-code three numbers owned by three other files, the shell measures the box the
 * current screen actually rendered and publishes it as `--app-bar-measure` /
 * `--app-bar-pad`. Nobody has to tell it anything, and it cannot fall out of date.
 *
 * WHY 1:1 AND NOT A THRESHOLD TOGGLE
 * A toggle has to animate the chrome (and everything stuck to it) on a timer that does not
 * match the scroll, which reads as the page fighting you. Tracking the delta is what iOS
 * Safari does: the chrome is simply attached to the content. The only timer here is the settle
 * — if a scroll ends with the bar between its two ends, it glides to whichever is nearer so
 * the row is never left at some arbitrary in-between height.
 */

/** How long the settle glide runs. Matches the design system's 180ms transitions. */
const SETTLE_MS = 180;
/** Quiet time after the last scroll event before the bar snaps to an end state. */
const IDLE_MS = 140;
/**
 * Going down the chrome tracks the scroll 1:1; coming back up it moves three times as fast.
 * Retracting should feel like the chrome is attached to the page, but *reaching* for it should
 * not cost a 70px scroll-up — a flick of ~23px brings the whole toolbar back, which is the
 * "it returns the instant you scroll up" half of the behaviour.
 */
const REVEAL_GAIN = 3;
/**
 * The bar only retracts on a page with somewhere to go. Three budgets of runway keeps it fully
 * expanded on short pages, where compacting chrome buys nothing and costs the user their
 * bearings.
 */
const MIN_RUNWAY = 3;
/**
 * THE CEILING. Total sticky chrome at rest — the safe inset, the bar, and whatever the screen
 * pins under it — may hold at most this fraction of the viewport's HEIGHT. 22% is 179px of a
 * 812px portrait phone and 82px of a 375px landscape one.
 *
 * A fraction of the height, and not a px constant, because height is the axis the old budget
 * was blind on. Every rule in the system that shrinks chrome keyed off WIDTH: the bar comes
 * down at `(max-height: 30rem)`, but browse's three stacked control rows only collapse to one
 * at `(min-width: 60rem)` = 960px, which no landscape phone reaches. So the identical 224px
 * block that costs 28% of a portrait frame costs 60% of a landscape one, and nothing noticed,
 * because 224 is less than 234.
 */
const CHROME_CEILING = 0.22;
/**
 * A chrome band spans the screen's column; a sticky rail beside the content does not. 0.8
 * because the real bands measure 89% (the run's progress rail, inside the run's own padding)
 * to 100% (browse's full-bleed controls), and the landing screen's sidebar — the thing this
 * exists to exclude — is 17%.
 */
const BAND_SPAN = 0.8;
/** How far into a screen the scan for that band looks, per level. Chrome is the first thing a
    screen renders; anything further in is the screen's content. */
const SCAN_CHILDREN = 3;
/**
 * Two row tops this close together are ONE row. A row of a grid does not hand its children an
 * identical top — browse's desktop control row measures 12 / 15 / 13px from the block's edge
 * as the level pills, the field and the chip strip settle on their own baselines — and three
 * stops 1px apart would be three legal cuts through the middle of one row. Nothing real is
 * merged by this: a stacked row is a tap target plus a gap, never under 44px from the next.
 */
const ROW_EPSILON = 16;
/** The typed custom property a screen uses to volunteer part of its own sticky block. */
const FOLD_PROPERTY = '--app-chrome-fold';
/** Body height of the docked row, and the hairline under it. Both typed `<length>`. */
const MIN_BAR_PROPERTY = '--app-bar-min-h';
const LINE_PROPERTY = '--app-bar-line';
/** Floor used before the tokens can be read (SSR, or a CSSOM that hands back nothing). */
const MIN_BAR_FALLBACK = 41;

export interface ChromeController {
	/** Border-box height of the expanded bar below the safe inset, px. 0 until measured. */
	readonly barH: number;
	/** Border-box height of the docked row below the safe inset, px. The floor `visible` has. */
	readonly minBarH: number;
	/** How much scroll the chrome has absorbed — the bar's own travel first, then the fold. */
	readonly hidden: number;
	/**
	 * What `--app-header-h` publishes: how much of the bar is on screen, border box included.
	 * Clamped to `[minBarH, barH]`. It is never zero and never negative — the docked row is
	 * always there.
	 */
	readonly visible: number;
	/** How many px of the screen's volunteered fold are currently spent. Published as
	    `--app-fold-h`; the screen subtracts it from its own sticky offset. */
	readonly foldY: number;
	/**
	 * How far the bar has slid up the top edge, 0 → `barH - minBarH`. The bar translates by
	 * this and pads its own row back down by the same amount, so its BORDER BOX never changes
	 * size — see the note on the layout feedback loop in the file header.
	 */
	readonly barOffset: number;
	/** True once the bar has measured itself; before that the CSS token stands. */
	readonly measured: boolean;
	/** Past half of the bar's own travel. Published as `data-chrome`, and the bar reads it to
	    switch to its compact type. */
	readonly condensed: boolean;
	/** True as soon as anything has scrolled under the bar — drives its hairline. */
	readonly scrolled: boolean;
	/**
	 * How much sticky block the ceiling leaves the current screen at this viewport height:
	 * `CHROME_CEILING * innerHeight` minus the shell's own chrome. Published as
	 * `--app-chrome-room` so a screen can size its toolbar to the frame it is actually in.
	 */
	readonly room: number;
	/**
	 * How far the screen's sticky block overruns that, px — 0 when it fits. Published as
	 * `--app-chrome-over`, and as `data-chrome-fit="over"`. Whatever the screen does about it,
	 * the shell folds this much itself.
	 */
	readonly over: number;
	/** Border-box width of the column the current screen rendered, px. 0 until measured. */
	readonly columnWidth: number;
	/** That column's own inline padding, px, so the bar's glyphs land on its text edge. */
	readonly columnPad: number;
	/** Re-measure the screen's column. Call after a navigation. */
	sync(): void;
	/** The bar reports its own border-box height here, safe inset excluded — and the inset it
	    measured, which the ceiling has to charge for even though the bar does not. */
	report(height: number, inset?: number): void;
	/** Put the bar back: focus moved into it, or the route changed. */
	reveal(instant?: boolean): void;
	/** Attach the scroll listener. Returns a teardown — call it from an `$effect`. */
	listen(): () => void;
}

function prefersReducedMotion(): boolean {
	return (
		typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
	);
}

export function createChrome(): ChromeController {
	let barH = $state(0);
	let minBarH = $state(MIN_BAR_FALLBACK);
	let hidden = $state(0);
	let scrolled = $state(false);
	/** Px of the current screen's sticky block the chrome will absorb — the larger of what the
	    screen volunteered and what the ceiling takes. Re-derived on every scroll; the reads it
	    needs are on elements already in the style cache, so a screen that changes its mind
	    between routes or breakpoints is picked up for free. */
	let fold = 0;
	/** Sticky block the ceiling leaves this screen at this viewport height, px. Published. */
	let room = $state(0);
	/** How far the screen's block currently overruns that, px. 0 when it fits. Published. */
	let over = $state(0);
	/** The safe-area inset the bar sits under, as the bar itself measured it. */
	let safeTop = 0;
	/** Row-boundary cache for `foldStops`, keyed on the block and its height. */
	let stopsOf: HTMLElement | null = null;
	let stopsAt = -1;
	let stops: number[] = [];
	let columnWidth = $state(0);
	let columnPad = $state(0);

	let frame = 0;
	let idle: ReturnType<typeof setTimeout> | undefined;

	/** The element a route renders directly inside `#main` — its `<main>`, in practice. */
	function screenRoot(): HTMLElement | null {
		const el = document.getElementById('main')?.firstElementChild;
		return el instanceof HTMLElement ? el : null;
	}

	/**
	 * The shell wrapper. The floor is read off THIS and not off `:root`, because it is not a
	 * document-wide constant: it is the height of the row that has to survive on the screen
	 * currently rendered, and one screen sets it to zero (see `readFloor`).
	 */
	function shellEl(): HTMLElement {
		const el = document.getElementById('main')?.parentElement;
		return el instanceof HTMLElement ? el : document.documentElement;
	}

	/**
	 * The band the screen pins under the bar: what the ceiling is measured against, and what a
	 * fold takes rows off the top of. `null` when the screen pins nothing.
	 *
	 * THREE TESTS, AND EACH ONE IS THERE BECAUSE SOMETHING REAL FAILED IT:
	 *
	 *   at the top of the screen   Only the first few children of the screen, and one level
	 *                              inside them, are looked at. Chrome is the first thing a
	 *                              screen renders; a sticky row 6,000px down a word list is a
	 *                              list affordance, and folding it would be nonsense. The one
	 *                              level of descent is what it takes to see the run's progress
	 *                              rail, which is `.run > .wrap` and not a direct child — the
	 *                              old direct-children-only rule could not see it at all.
	 *   a band, not a rail         It has to span (nearly) the screen's own column. The landing
	 *                              screen's desktop sidebar is `position: sticky` and 144px
	 *                              tall, so a height-only test read it as 32px of chrome
	 *                              overrun and would have folded a column that sits BESIDE the
	 *                              content rather than over it. It is 224px of a 1,312px
	 *                              column; the real bands measure 89–100%.
	 *   anchored to the top        `top: auto` is a sticky element pinned to the bottom or to
	 *                              nothing, which is not chrome the shell is paying for.
	 */
	function stickyBlock(screen: HTMLElement): HTMLElement | null {
		const span = screen.getBoundingClientRect().width;
		if (span <= 0) return null;
		const band = (el: HTMLElement): boolean => {
			const box = el.getBoundingClientRect();
			if (box.height <= 0 || box.width < span * BAND_SPAN) return false;
			const style = getComputedStyle(el);
			return style.position === 'sticky' && style.top !== 'auto';
		};
		const head = (el: Element): HTMLElement[] => {
			const kids: HTMLElement[] = [];
			for (const kid of el.children) {
				if (kid instanceof HTMLElement) kids.push(kid);
				if (kids.length === SCAN_CHILDREN) break;
			}
			return kids;
		};
		for (const child of head(screen)) {
			if (band(child)) return child;
			for (const grand of head(child)) {
				if (band(grand)) return grand;
			}
		}
		return null;
	}

	/**
	 * Is the bar taking height off the viewport right now? During a run in landscape the shell
	 * lifts it out of flow so the card can have the whole frame (see +layout.svelte), and
	 * `--app-chrome-h` drops to the safe inset to match. The ceiling has to agree: charging a
	 * fixed bar against the budget read the run's 51px progress rail as 3px over at 932x430
	 * and would have folded a rail that was costing the screen nothing.
	 */
	function barInFlow(): boolean {
		const bar = shellEl().querySelector(':scope > header');
		return bar instanceof HTMLElement ? getComputedStyle(bar).position !== 'fixed' : true;
	}

	/** What the screen itself volunteered, px. Registered `<length>`, so already resolved. */
	function declaredFold(screen: HTMLElement): number {
		const px = Number.parseFloat(getComputedStyle(screen).getPropertyValue(FOLD_PROPERTY));
		return Number.isFinite(px) && px > 0 ? px : 0;
	}

	/**
	 * Where the screen's sticky block MAY be cut, as offsets from its own top edge.
	 *
	 * A fold has to land on a row boundary. The shell does not know what browse's toolbar
	 * contains, but it can see the boxes: walk past wrappers that hold a single child
	 * (`.controls > .controls-inner` is one block, not two rows) and the first element with
	 * siblings is the row list. Cutting at `row.top - block.top` therefore always takes a
	 * whole number of rows and never 40px of a 44px search field — which is the failure the
	 * old all-or-nothing rule existed to avoid, generalised so the shell can choose its own
	 * number instead of only vetoing the screen's. Two stops are excluded: 0, which is not a
	 * fold, and anything at or past the bottom edge, which would take the last row — something
	 * of the screen's own toolbar always stays on screen.
	 *
	 * Cached per block height: under a fold the block MOVES but does not resize, and these are
	 * offsets inside it, so one measurement stands for the whole travel. `sync()` and a resize
	 * drop the cache; a block that changes height invalidates it by itself.
	 */
	function foldStops(block: HTMLElement, blockH: number): number[] {
		if (stopsOf === block && Math.abs(stopsAt - blockH) < 0.5) return stops;
		let rows: HTMLElement = block;
		while (rows.childElementCount === 1 && rows.firstElementChild instanceof HTMLElement) {
			rows = rows.firstElementChild;
		}
		const top = block.getBoundingClientRect().top;
		const found: number[] = [];
		for (const child of rows.children) {
			if (!(child instanceof HTMLElement)) continue;
			const box = child.getBoundingClientRect();
			if (box.height <= 0) continue;
			const stop = box.top - top;
			if (stop <= 0.5 || stop >= blockH - 1) continue;
			if (found.some((seen) => Math.abs(seen - stop) < ROW_EPSILON)) continue;
			found.push(stop);
		}
		found.sort((a, b) => a - b);
		stopsOf = block;
		stopsAt = blockH;
		stops = found;
		return stops;
	}

	/**
	 * THE CEILING, APPLIED — the shell taking its own number rather than waiting to be offered
	 * one.
	 *
	 * `--app-chrome-fold` is a screen volunteering; this is the part it has no say in. The
	 * shell measures the sticky block the screen actually rendered, works out how far the
	 * total overruns `CHROME_CEILING`, and folds the overrun whether or not the screen ever
	 * declared anything. The larger of the two wins, snapped UP to the next row boundary so
	 * the cut is legible, and capped at the last row so a control always survives.
	 *
	 * It publishes both halves as well, because a screen can do better than being folded if it
	 * knows the number: `--app-chrome-room` is how much sticky block the ceiling leaves it at
	 * this viewport height, `--app-chrome-over` is how far past that it currently is, and
	 * `data-chrome-fit="over"` is the same fact as a selector. A screen that restructures on
	 * those never gets folded, because there is nothing left to fold.
	 */
	function measureChrome(): void {
		const screen = screenRoot();
		if (!screen) {
			fold = 0;
			return;
		}
		const block = stickyBlock(screen);
		const blockH = block ? block.getBoundingClientRect().height : 0;
		const shellH = safeTop + (barInFlow() ? barH : 0);
		const allowance = Math.max(0, window.innerHeight * CHROME_CEILING - shellH);
		const overrun = Math.max(0, blockH - allowance);
		if (Math.abs(allowance - room) > 0.5) room = allowance;
		if (Math.abs(overrun - over) > 0.5) over = overrun;

		const want = Math.max(declaredFold(screen), overrun);
		if (want <= 0.5) {
			fold = 0;
			return;
		}
		// No sticky block: no rows to snap to and nothing to measure instead, so a screen that
		// volunteered a number is taken at its word.
		if (!block) {
			fold = want;
			return;
		}
		const cuts = foldStops(block, blockH);
		if (cuts.length === 0) {
			fold = 0;
			return;
		}
		fold = cuts.find((cut) => cut >= want - 0.5) ?? cuts[cuts.length - 1];
	}

	/**
	 * The docked height, read off the same tokens the bar is styled from — so a media query
	 * that shrinks the bar in landscape moves the floor with it and the two cannot disagree.
	 * Both properties are registered `<length>`, so these arrive as px.
	 *
	 * ZERO IS A LEGAL ANSWER ON EXACTLY ONE SCREEN, AND IT IS NOT A LOOPHOLE IN THE FLOOR.
	 * The floor exists to keep a *control* on screen: on `/browse/1` the docked row is the
	 * only back control and the only thing naming the level on a 38,402px document, so it
	 * stays. The landing screen's bar holds `汉 hskquiz` and — measured — zero interactive
	 * elements, ever: no back (there is nowhere above it), no lateral move (a destination
	 * here is a level, and the page is a grid of them). Pinning 41px of wordmark over a
	 * 2,074px document is 5% of every frame spent restating the product's name to someone who
	 * is already inside it; both references spend that row on navigation instead. So the
	 * landing screen sets `--app-bar-min-h: 0` on the shell and its bar is allowed to leave —
	 * still 1:1 with the finger, still back in a ~19px flick, and always whole at the top of
	 * the document. Read off the shell rather than `:root` for that reason, and re-read on
	 * every navigation via `sync()`, because it now changes between routes.
	 */
	function readFloor(): number {
		const scope = getComputedStyle(shellEl());
		const body = Number.parseFloat(scope.getPropertyValue(MIN_BAR_PROPERTY));
		if (!Number.isFinite(body)) return MIN_BAR_FALLBACK;
		if (body <= 0) return 0;
		const line = Number.parseFloat(scope.getPropertyValue(LINE_PROPERTY));
		return body + (Number.isFinite(line) && line > 0 ? line : 0);
	}

	/** How far the bar itself can shrink before the fold starts taking scroll. */
	function barTravel(): number {
		return Math.max(0, barH - minBarH);
	}

	/** Everything the chrome will absorb: the bar's own travel plus the screen's fold. */
	function budget(): number {
		return barTravel() + fold;
	}

	function measureColumn() {
		const screen = screenRoot();
		if (!screen) return;
		const width = screen.getBoundingClientRect().width;
		const pad = Number.parseFloat(getComputedStyle(screen).paddingInlineStart) || 0;
		if (width > 0 && Math.abs(width - columnWidth) > 0.5) columnWidth = width;
		if (Math.abs(pad - columnPad) > 0.5) columnPad = pad;
	}

	function stopGlide() {
		if (frame) cancelAnimationFrame(frame);
		frame = 0;
	}

	/**
	 * Animate `hidden` in JS rather than transitioning the custom property in CSS. The value
	 * is read by `position: sticky` offsets on other people's screens; a JS tween keeps the
	 * bar and everything stuck beneath it on the same frame, and needs no `@property`
	 * registration or per-frame style recalc of the whole document.
	 */
	function glide(to: number, instant = false) {
		stopGlide();
		const from = hidden;
		if (instant || from === to || prefersReducedMotion()) {
			hidden = to;
			return;
		}
		const started = performance.now();
		const step = (now: number) => {
			const p = Math.min(1, (now - started) / SETTLE_MS);
			// Cubic ease-out, the same shape as --ease-out-soft.
			hidden = from + (to - from) * (1 - Math.pow(1 - p, 3));
			frame = p < 1 ? requestAnimationFrame(step) : 0;
		};
		frame = requestAnimationFrame(step);
	}

	function settle() {
		const max = budget();
		if (hidden <= 0 || hidden >= max) return;
		glide(hidden > max / 2 ? max : 0);
	}

	function listen() {
		let last = Math.max(0, window.scrollY);

		const onScroll = () => {
			const y = Math.max(0, window.scrollY);
			const delta = y - last;
			last = y;
			scrolled = y > 2;

			if (barH <= 0) return;
			/*
			 * A scroll event where the page did not actually move — a virtualised list
			 * re-rendering, a scroll-anchoring adjustment — must not abort a glide that is
			 * already running. It used to: `reveal()` would start bringing the bar back after
			 * a tab into it, one zero-delta event from browse's windowing would freeze the
			 * glide halfway, and the settle would then round the bar back down to docked
			 * while the focus ring sat on the control the user had just reached. Roughly one
			 * reveal in four ended with the bar re-docked.
			 */
			if (Math.abs(delta) < 1 && frame) return;
			stopGlide();

			measureChrome();
			const max = budget();
			const runway = document.documentElement.scrollHeight - window.innerHeight;
			if (max <= 0 || y <= barH || runway < max * MIN_RUNWAY) {
				// Inside the bar's own height nothing has passed under it yet, so compacting it
				// would move the row while the page is still at the top.
				hidden = 0;
			} else {
				const travel = delta < 0 ? delta * REVEAL_GAIN : delta;
				hidden = Math.max(0, Math.min(max, hidden + travel));
			}

			if (idle) clearTimeout(idle);
			idle = setTimeout(settle, IDLE_MS);
		};

		const onResize = () => {
			last = Math.max(0, window.scrollY);
			// A landscape breakpoint moves both ends of the bar, so re-read the floor before
			// the bar re-reports its expanded height. The ceiling is a fraction of the height
			// that just changed, and the block's rows may have reflowed under it.
			minBarH = readFloor();
			stopsOf = null;
			measureColumn();
			measureChrome();
			glide(0, true);
		};

		minBarH = readFloor();
		measureColumn();
		onScroll();
		window.addEventListener('scroll', onScroll, { passive: true });
		window.addEventListener('resize', onResize, { passive: true });

		return () => {
			stopGlide();
			if (idle) clearTimeout(idle);
			window.removeEventListener('scroll', onScroll);
			window.removeEventListener('resize', onResize);
		};
	}

	return {
		get barH() {
			return barH;
		},
		get minBarH() {
			return minBarH;
		},
		get hidden() {
			return hidden;
		},
		get visible() {
			// The floor, restated in the one place every published number comes from: whatever
			// the fold is doing, the docked row is still on screen.
			return Math.max(minBarH, barH - Math.min(hidden, barTravel()));
		},
		get foldY() {
			return Math.max(0, Math.min(fold, hidden - barTravel()));
		},
		get barOffset() {
			return Math.min(hidden, barTravel());
		},
		get measured() {
			return barH > 0;
		},
		get condensed() {
			const travel = barTravel();
			return travel > 0 && hidden > travel / 2;
		},
		get scrolled() {
			return scrolled;
		},
		get room() {
			return room;
		},
		get over() {
			return over;
		},
		get columnWidth() {
			return columnWidth;
		},
		get columnPad() {
			return columnPad;
		},
		sync() {
			// A route swap replaces the screen element, and the new one may not have laid out
			// yet on the frame `afterNavigate` runs in. The floor comes with it: it is a
			// property of the screen now, not of the document. So are the fold's row stops.
			minBarH = readFloor();
			stopsOf = null;
			measureColumn();
			measureChrome();
			requestAnimationFrame(() => {
				minBarH = readFloor();
				stopsOf = null;
				measureColumn();
				measureChrome();
			});
		},
		report(height: number, inset = 0) {
			// Safe to take at any point in the travel: the bar's border box is the same size
			// docked as expanded, so this is its intrinsic height and never an echo of what
			// the controller just published.
			const moved = height > 0 && Math.abs(height - barH) > 0.5;
			if (Number.isFinite(inset) && Math.abs(inset - safeTop) > 0.5) safeTop = inset;
			if (moved) barH = height;
			// The ceiling is measured against the bar, so it cannot be right until the bar has
			// said how tall it is.
			if (moved) measureChrome();
		},
		reveal(instant = false) {
			if (idle) clearTimeout(idle);
			glide(0, instant);
		},
		listen
	};
}
