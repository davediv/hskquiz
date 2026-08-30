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
	/** Border-box width of the column the current screen rendered, px. 0 until measured. */
	readonly columnWidth: number;
	/** That column's own inline padding, px, so the bar's glyphs land on its text edge. */
	readonly columnPad: number;
	/** Re-measure the screen's column. Call after a navigation. */
	sync(): void;
	/** The bar reports its own border-box height here, safe inset excluded. */
	report(height: number): void;
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
	/** Extra px the current screen has volunteered. Re-read on every scroll — it is one
	    `getComputedStyle` on an element that is already in the style cache, and it means a
	    screen that changes its mind between routes or breakpoints is picked up for free. */
	let fold = 0;
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
	 * The screen's own sticky block — the thing a fold takes rows off the top of. Only the
	 * screen root's direct children are considered: a fold is a statement about the block the
	 * screen pins under the bar, not about some sticky affordance nested inside a list row.
	 * 0 when the screen has no sticky block at all.
	 */
	function stickyBlockHeight(screen: HTMLElement): number {
		for (const child of screen.children) {
			if (!(child instanceof HTMLElement)) continue;
			if (getComputedStyle(child).position !== 'sticky') continue;
			return child.getBoundingClientRect().height;
		}
		return 0;
	}

	function readFold(): number {
		const screen = screenRoot();
		if (!screen) return 0;
		// Registered as `<length>`, so the computed value is always resolved px.
		const px = Number.parseFloat(getComputedStyle(screen).getPropertyValue(FOLD_PROPERTY));
		const declared = Number.isFinite(px) && px > 0 ? px : 0;
		if (declared <= 0) return 0;

		/*
		 * A fold is refused outright unless the screen can afford the whole of it — the block
		 * has to still be at least a docked bar tall once the fold is taken. Browse volunteers
		 * 3.375rem for its level-pills row, which is right for the phone stack (151px of
		 * controls) and wrong from 60rem up, where the same controls collapse to a single 67px
		 * row: taking 54px off that leaves a 13px sliver of a search field under the bar, which
		 * reads as a rendering fault rather than as a toolbar that got smaller. All or nothing
		 * is the only rule the shell can apply honestly, because only the screen knows where
		 * its rows are. A screen with no sticky block of its own is taken at its word.
		 */
		const block = stickyBlockHeight(screen);
		if (block <= 0) return declared;
		return declared <= block - minBarH ? declared : 0;
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

			fold = readFold();
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
			// the bar re-reports its expanded height.
			minBarH = readFloor();
			measureColumn();
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
		get columnWidth() {
			return columnWidth;
		},
		get columnPad() {
			return columnPad;
		},
		sync() {
			// A route swap replaces the screen element, and the new one may not have laid out
			// yet on the frame `afterNavigate` runs in. The floor comes with it: it is a
			// property of the screen now, not of the document.
			minBarH = readFloor();
			measureColumn();
			requestAnimationFrame(() => {
				minBarH = readFloor();
				measureColumn();
			});
		},
		report(height: number) {
			// Safe to take at any point in the travel: the bar's border box is the same size
			// docked as expanded, so this is its intrinsic height and never an echo of what
			// the controller just published.
			if (height > 0 && Math.abs(height - barH) > 0.5) barH = height;
		},
		reveal(instant = false) {
			if (idle) clearTimeout(idle);
			glide(0, instant);
		},
		listen
	};
}
