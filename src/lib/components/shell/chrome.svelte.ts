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
 * So the bar is now a *budget the shell hands back*. Scrolling down retracts it 1:1 with the
 * finger; scrolling up brings it straight back. Because `--app-header-h` reports the live
 * on-screen height rather than the intrinsic one, every sticky layer in the app rides up with
 * it for free — no screen has to subscribe to anything. `--app-bar-h` keeps the intrinsic
 * height for whoever needs to reason about the bar itself, and `--app-chrome-h` is the live
 * total including the safe-area inset.
 *
 * SCREENS CAN VOLUNTEER MORE THAN THE BAR
 * Retracting the bar gets `/browse/1` from 208px of chrome to 151px, but the remaining 151px
 * is the screen's own sticky block and only the screen knows which part of it is expendable.
 * So a screen may declare `--app-chrome-fold: <length>` on the element it renders directly
 * inside `#main`, meaning "once the bar is gone, you may take this many more px off my top
 * edge". The shell then drives `--app-header-h` *negative* by that much, and the screen's own
 * `top: calc(... + var(--app-header-h))` carries its expendable row off the viewport with the
 * bar. It is registered as a real `<length>` below so the computed value arrives in px and no
 * unit maths is needed here. Nobody declares it and the fold is simply 0.
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
 * A toggle has to animate 56px of chrome (and everything stuck to it) on a timer that does not
 * match the scroll, which reads as the page fighting you. Tracking the delta is what iOS Safari
 * does: the chrome is simply attached to the content. The only timer here is the settle — if a
 * scroll ends with the bar halfway out, it glides to whichever end is nearer so the wordmark is
 * never left sliced in half.
 */

/** How long the settle glide runs. Matches the design system's 180ms transitions. */
const SETTLE_MS = 180;
/** Quiet time after the last scroll event before the bar snaps to an end state. */
const IDLE_MS = 140;
/**
 * Going down the chrome tracks the scroll 1:1; coming back up it moves three times as fast.
 * Retracting should feel like the chrome is attached to the page, but *reaching* for it should
 * not cost a 110px scroll-up — a flick of ~37px brings the whole toolbar back, which is the
 * "it returns the instant you scroll up" half of the behaviour.
 */
const REVEAL_GAIN = 3;
/**
 * The bar only retracts on a page with somewhere to go. Three bar-heights of runway keeps it
 * pinned on short pages, where hiding chrome buys nothing and costs the user their bearings.
 */
const MIN_RUNWAY = 3;
/** The typed custom property a screen uses to volunteer part of its own sticky block. */
const FOLD_PROPERTY = '--app-chrome-fold';

export interface ChromeController {
	/** Intrinsic height of the bar body in px, measured. 0 until the bar reports it. */
	readonly barH: number;
	/** How many px of chrome are currently retracted off the top edge — bar first, then fold. */
	readonly hidden: number;
	/**
	 * What `--app-header-h` publishes: how much of the bar is on screen. Goes NEGATIVE once a
	 * screen has volunteered a fold and the bar is already gone, which is how the screen's own
	 * sticky block gets pulled up past the viewport edge.
	 */
	readonly visible: number;
	/** How far the bar itself has translated. Capped at `barH`; the fold is not the bar's. */
	readonly barOffset: number;
	/** True once the bar has measured itself; before that the CSS token stands. */
	readonly measured: boolean;
	/** More than half retracted. Published as `data-chrome` for screens that want to react. */
	readonly condensed: boolean;
	/** True as soon as anything has scrolled under the bar — drives its hairline. */
	readonly scrolled: boolean;
	/** Border-box width of the column the current screen rendered, px. 0 until measured. */
	readonly columnWidth: number;
	/** That column's own inline padding, px, so the bar's glyphs land on its text edge. */
	readonly columnPad: number;
	/** Re-measure the screen's column. Call after a navigation. */
	sync(): void;
	/** The bar reports its own height here. */
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

	function readFold(): number {
		const screen = screenRoot();
		if (!screen) return 0;
		// Registered as `<length>`, so the computed value is always resolved px.
		const px = Number.parseFloat(getComputedStyle(screen).getPropertyValue(FOLD_PROPERTY));
		return Number.isFinite(px) && px > 0 ? px : 0;
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
		const max = barH + fold;
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
			stopGlide();

			fold = readFold();
			const max = barH + fold;
			const runway = document.documentElement.scrollHeight - window.innerHeight;
			if (y <= barH || runway < max * MIN_RUNWAY) {
				// Inside the bar's own height the bar has not stuck yet, so retracting it would
				// tear a gap above the content instead of covering it.
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
			measureColumn();
			glide(0, true);
		};

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
		get hidden() {
			return hidden;
		},
		get visible() {
			return barH - hidden;
		},
		get barOffset() {
			return Math.min(hidden, barH);
		},
		get measured() {
			return barH > 0;
		},
		get condensed() {
			return barH > 0 && hidden > barH / 2;
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
			// yet on the frame `afterNavigate` runs in.
			measureColumn();
			requestAnimationFrame(measureColumn);
		},
		report(height: number) {
			if (height > 0 && Math.abs(height - barH) > 0.5) {
				barH = height;
				hidden = Math.min(hidden, height + fold);
			}
		},
		reveal(instant = false) {
			if (idle) clearTimeout(idle);
			glide(0, instant);
		},
		listen
	};
}
