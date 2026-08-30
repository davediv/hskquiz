/**
 * Scroll memory: the shell's promise that leaving a screen and coming back puts the learner
 * back where they were.
 *
 * WHY THE SHELL HAS TO OWN THIS
 * The app's most-repeated motion is level select → a session → back to level select. Level
 * select is a 2,054px document on a 375x812 phone, so an HSK 4 or 5 learner leaves it at
 * ~900px every single time. Pleco and Du Chinese both return you to the offset you left; a
 * back that lands you at the top makes the learner re-scroll two thirds of the list after
 * every run.
 *
 * The browser and SvelteKit both already try. SvelteKit sets `history.scrollRestoration =
 * 'manual'`, records `scrollY` per history entry, and calls `scrollTo` once the new screen has
 * been committed. That single call is the whole problem: **`scrollTo` is clamped against the
 * document as it is on that frame.** A screen whose height only arrives after hydration —
 * browse's windowed list is 812px of SSR markup and 38,414px once the window mounts, and
 * level select holds every progress-driven row back behind a `hydrated` flag — is still short
 * when the offset is applied, so 6,000 silently becomes 362 and nothing ever re-applies it.
 * Measured on `/browse/1` before this file existed: leave at 6000, reload, land at **362**.
 *
 * So one `scrollTo` is not a restore. A restore is a *target held until the document can hold
 * it*:
 *
 *   1. record `scrollY` against the history entry, continuously and on the way out,
 *   2. on a pop or a cold re-entry, re-apply that target every frame,
 *   3. keep re-applying while `scrollHeight - innerHeight` is still short of it — parking at
 *      the deepest offset that *is* reachable meanwhile, so the page never visibly rewinds,
 *   4. let go the moment the document can hold the target, and let go instantly if the
 *      learner touches anything, because after that the offset is theirs, not ours.
 *
 * WHY NOT `scroll-behavior: smooth` OR `scrollIntoView`
 * Both animate. An animation is exactly the wrong shape here: coming back to a screen you
 * were already on should look like nothing happened, not like a 900px flight. Every write
 * below is `behavior: 'instant'`.
 *
 * KEYED BY HISTORY ENTRY, NOT BY URL
 * A URL key gets the common case right and the stack wrong: `/` at 900 → `/browse/1` →
 * `/` again (footer link) at 400 → back → back should land at 900, and a URL-keyed map says
 * 400. SvelteKit already stamps each entry with a monotonic index (`sveltekit:history` in
 * `history.state`), and that index survives a reload, which is what makes point 2 above work
 * for the reload case at all. We only ever *read* it, and fall back to the URL if it is ever
 * missing.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 * It never restores on a forward push. Tapping into a new screen must start at the top, which
 * is what SvelteKit already does; re-applying anything there would be a bug, not a feature.
 */

/** Where SvelteKit stamps its per-entry index. Read-only: we never write history state. */
const INDEX_KEY = 'sveltekit:history';

/** Our own store, so a reload can re-apply an offset the SSR document was too short to hold. */
const STORE_KEY = 'hskquiz:shell:scroll:v1';

/** How long a hold may run before it gives up. Reached in 1–2 frames in every measured case. */
const HOLD_MS = 2000;

/** Frames the document must stay tall enough for before the hold lets go. */
const SETTLE_FRAMES = 2;

/**
 * Entries kept. A session is a handful of screens; the cap exists so a long session cannot
 * grow the stored object without bound, not because 40 is a meaningful number of screens.
 */
const MAX_ENTRIES = 40;

/** Anything the learner can do that means "I am driving now" and the hold must let go. */
const INTERRUPTS = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;

export interface ScrollMemory {
	/** Record where the entry we are on is scrolled to. Call from `beforeNavigate`. */
	capture(): void;
	/**
	 * Land on the entry we just navigated to: adopt its key, and — for a pop or a cold
	 * re-entry — hold its recorded offset until the document is tall enough for it.
	 */
	settle(type: string): void;
	/** Abandon a hold in flight. */
	cancel(): void;
	/** Attach the listeners that keep the record fresh. Returns a teardown for an `$effect`. */
	listen(): () => void;
	/** The offset currently being held, or 0. Exposed for tests and for measurement. */
	readonly holding: number;
}

function readIndex(): string | null {
	const raw: unknown = history.state?.[INDEX_KEY];
	if (typeof raw === 'number' && Number.isFinite(raw)) return `i${raw}`;
	if (typeof raw === 'string' && raw !== '') return `i${raw}`;
	return null;
}

/** The history entry we are on. Falls back to the URL when SvelteKit's stamp is missing. */
function entryKey(): string {
	return readIndex() ?? `u${location.pathname}${location.search}`;
}

function load(): Map<string, number> {
	// `createScrollMemory()` is called during component init, which also happens on the server.
	if (typeof sessionStorage === 'undefined') return new Map();
	try {
		const raw = sessionStorage.getItem(STORE_KEY);
		if (raw === null) return new Map();
		const parsed: unknown = JSON.parse(raw);
		if (parsed === null || typeof parsed !== 'object') return new Map();
		const out = new Map<string, number>();
		for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
			if (typeof value === 'number' && Number.isFinite(value) && value > 0) out.set(key, value);
		}
		return out;
	} catch {
		// Private mode, a locked profile, or bytes some other build wrote. A scroll offset is
		// a convenience; there is nothing here worth failing a page load over.
		return new Map();
	}
}

export function createScrollMemory(): ScrollMemory {
	const offsets = load();

	/** The entry we are currently on. Updated only where `history.state` is settled. */
	let currentKey = '';
	/** The offset a hold is driving towards, or 0 when nothing is being held. */
	let holding = 0;
	let frame = 0;
	let observer: ResizeObserver | null = null;
	let settled = 0;
	let expires = 0;
	let writing = false;

	function persist() {
		if (typeof sessionStorage === 'undefined') return;
		try {
			// Newest last: `Map` preserves insertion order, so the tail is the recent stack.
			const keys = [...offsets.keys()];
			for (const key of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) offsets.delete(key);
			sessionStorage.setItem(STORE_KEY, JSON.stringify(Object.fromEntries(offsets)));
		} catch {
			// See `load()`: storage is optional here.
		}
	}

	function record(key: string, y: number) {
		if (key === '') return;
		// Re-insert so the entry moves to the tail and survives the cap above.
		offsets.delete(key);
		offsets.set(key, Math.max(0, Math.round(y)));
	}

	function maxScroll(): number {
		return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
	}

	function moveTo(y: number) {
		if (Math.abs(window.scrollY - y) < 0.5) return;
		writing = true;
		// `instant`, never `smooth`: coming back to a screen you were already on should look
		// like nothing happened, and `scrollTo(x, y)` would inherit a `scroll-behavior` set
		// anywhere up the tree.
		window.scrollTo({ top: y, left: 0, behavior: 'instant' });
		writing = false;
	}

	function release() {
		if (frame) cancelAnimationFrame(frame);
		frame = 0;
		observer?.disconnect();
		observer = null;
		if (holding > 0) {
			// Whatever we ended at is now this entry's remembered offset.
			record(currentKey, window.scrollY);
			persist();
		}
		holding = 0;
		settled = 0;
		for (const name of INTERRUPTS) window.removeEventListener(name, release, true);
	}

	/**
	 * One attempt. Parks at the deepest offset the document can currently hold, so a screen
	 * that grows in stages walks *down* to the target rather than sitting at the top and
	 * jumping at the end.
	 */
	function apply() {
		if (holding <= 0) return;
		const max = maxScroll();
		moveTo(Math.min(holding, max));

		if (max + 0.5 >= holding) {
			settled += 1;
			if (settled >= SETTLE_FRAMES) release();
			return;
		}
		settled = 0;
		if (performance.now() > expires) release();
	}

	function hold(target: number) {
		release();
		if (!(target > 0)) return;
		holding = target;
		settled = 0;
		expires = performance.now() + HOLD_MS;

		// The learner's own input outranks a restore in flight, always and immediately.
		for (const name of INTERRUPTS) {
			window.addEventListener(name, release, { capture: true, passive: true });
		}

		apply();
		if (holding <= 0) return;

		const step = () => {
			frame = 0;
			apply();
			if (holding > 0) frame = requestAnimationFrame(step);
		};
		frame = requestAnimationFrame(step);

		// A belt to the frame loop's braces: a list that publishes its real height from a
		// `ResizeObserver` of its own, or a tab that was backgrounded (where rAF stops), still
		// wakes us the moment the document changes size.
		if (typeof ResizeObserver !== 'undefined') {
			observer = new ResizeObserver(() => apply());
			observer.observe(document.documentElement);
			const main = document.getElementById('main');
			if (main) observer.observe(main);
		}
	}

	return {
		get holding() {
			return holding;
		},

		capture() {
			if (typeof window === 'undefined') return;
			// Not `entryKey()`: on a pop, `history.state` has ALREADY moved to the entry we are
			// heading for by the time `beforeNavigate` runs, so reading it here would file the
			// departing offset under the destination. `currentKey` is only ever set where the
			// state is settled.
			record(currentKey, window.scrollY);
			persist();
		},

		settle(type: string) {
			if (typeof window === 'undefined') return;
			release();
			currentKey = entryKey();
			// A forward push starts at the top — that is SvelteKit's job and it does it right.
			// Only a pop and a cold re-entry (a reload, a restored tab) are coming *back*.
			if (type !== 'popstate' && type !== 'enter') {
				record(currentKey, window.scrollY);
				return;
			}
			hold(offsets.get(currentKey) ?? 0);
		},

		cancel: release,

		listen() {
			currentKey = entryKey();

			let pending = 0;
			const onScroll = () => {
				// While a hold is running the live offset is ours, not the learner's: writing it
				// back would overwrite the very target we are still driving towards.
				if (holding > 0 || writing || pending) return;
				pending = requestAnimationFrame(() => {
					pending = 0;
					if (holding > 0) return;
					record(currentKey, window.scrollY);
				});
			};

			// The last write before the tab goes away is what a reload reads back.
			const onHide = () => {
				if (holding <= 0) record(currentKey, window.scrollY);
				persist();
			};

			window.addEventListener('scroll', onScroll, { passive: true });
			window.addEventListener('pagehide', onHide);
			document.addEventListener('visibilitychange', onHide);

			return () => {
				if (pending) cancelAnimationFrame(pending);
				release();
				window.removeEventListener('scroll', onScroll);
				window.removeEventListener('pagehide', onHide);
				document.removeEventListener('visibilitychange', onHide);
			};
		}
	};
}
