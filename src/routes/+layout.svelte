<!--
	The app shell: document chrome, and nothing that belongs to a screen.

	WHY THERE IS NO BOTTOM TAB BAR
	Du Chinese has one, and it is the obvious thing to copy. It does not fit here. A tab bar
	needs destinations that exist independently of what you are doing; this app's only two
	real screens — practising and browsing — are both scoped to a level (`/quiz/3`,
	`/browse/3`). Tabs would have to hard-code a level or silently restore a remembered one,
	so tapping "Practice" could drop you into a level you never chose. It also costs the
	bottom 56px of every screen, which during a quiz is where the answer buttons go — note
	that Du Chinese itself hides its tab bar inside a reading session for exactly that reason.

	So: a contextual top bar, and the lateral move between practising and browsing offered
	where it is unambiguous (from a browse screen, for the level already on screen).

	THE SHELL OWNS THE CHROME BUDGET — AND IT HAS A FLOOR
	It is not enough for the bar to be small; nothing was watching the *total*. Browse stacks
	its own 151px of search and filters under the bar, so a phone opened on HSK 1 spent 208px
	— a quarter of the frame — before the first word, against Pleco's 72px and Du Chinese's
	95px. So the shell runs a scroll-direction controller (`chrome.svelte.ts`) and publishes
	what every layer beneath it can read:

	  --app-header-h    live on-screen height of the bar, 57px → 41px as you scroll down.
	                    Never negative, and never 0 on a screen with a control in the bar: it
	                    compacts to a docked row that still carries the back control and the
	                    level's name, and stays there. The landing screen's bar holds no
	                    control at all, so there it is allowed to reach 0 — see the
	                    `[data-mode='home']` block below.
	  --app-chrome-h    that plus the safe-area inset: the shell's live total, floored the same
	  --app-fold-h      px of the current screen's own volunteered fold that are spent
	  --app-sticky-top  --app-chrome-h minus that, for a screen whose sticky block folds
	  --app-bar-measure the width of the column the current screen actually rendered, so the
	                    bar can sit over it on a desktop instead of stretching past it
	  --app-bar-pad     that column's own inline padding
	  data-chrome       "expanded" | "condensed", for screens that want to restructure

	Because the whole app already offset against `--app-header-h`, publishing it live is what
	makes browse's search field, the quiz progress rail and the level screen's desktop rail
	all ride up with the bar without a single edit outside this folder.

	The floor is why the fold moved out of `--app-header-h`. Driving the published height
	negative did fold browse's pill row away, but it also published `calc(0px + -54px)` as the
	chrome total and parked the skip link — the one affordance that exists solely for keyboard
	users — at top -46 on every page. A screen that wants the old behaviour subtracts its own
	number now: `top: var(--app-sticky-top)`.

	THE SHELL ALSO OWNS "WHERE WAS I"
	The app's most-repeated motion is level select → a session → back to level select, and
	level select is a 2,054px document on a phone: an HSK 4 or 5 learner leaves it at ~900px
	every time. One `scrollTo` on the frame the router commits is not enough to bring them
	back, because it is clamped against a document that has not finished growing — measured on
	`/browse/1`, leaving at 6000 and reloading landed at 362. `scroll.ts` holds the recorded
	offset until the document can actually hold it, and lets go the instant the learner
	touches anything. See that file for the whole argument.

	WHAT THIS SHELL DOES NOT DO
	It sets no measure and no horizontal gutter on the content. Every screen owns its own
	column — the level screen alone runs 34rem on a phone and widens to a 60rem two-column
	layout on a desktop — and a shell-level `max-width` would cap it. Use `.app-shell` from
	the design system, or your own container.

	It also does not render `<main>`: screens render their own, and two would be a
	conformance error. The skip link targets this wrapper instead.
-->
<script lang="ts">
	import './layout.css';
	import '$lib/components/shell/shell.css';
	import { afterNavigate, beforeNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import AppBar from '$lib/components/shell/AppBar.svelte';
	import SiteFooter from '$lib/components/shell/SiteFooter.svelte';
	import { readRoute } from '$lib/components/shell/route';
	import { createChrome } from '$lib/components/shell/chrome.svelte';
	import { createBackTarget } from '$lib/components/shell/back.svelte';
	import { createScrollMemory } from '$lib/components/shell/scroll';

	let { children } = $props();

	const route = $derived(readRoute(page.url.pathname, base));
	const chrome = createChrome();
	const backTarget = createBackTarget(base);
	const scroll = createScrollMemory();

	$effect(() => chrome.listen());
	$effect(() => scroll.listen());

	// Where this entry was left. Captured here rather than read back later because on a pop
	// `history.state` has already moved on by the time the navigation resolves.
	beforeNavigate(() => scroll.capture());

	// A new screen always starts with its chrome intact, however the last one left it — and
	// its column may be a different width from the one we just left.
	afterNavigate((nav) => {
		chrome.reveal(true);
		chrome.sync();
		// After `reveal`, so the bar is at a known end state before the restore scrolls under
		// it: landing 900px down should look exactly like the moment the learner left.
		scroll.settle(nav.type);
	});

	/**
	 * Does the screen already render an `<h1>` of its own? If it does, the bar must not be one
	 * too — see the note in AppBar.svelte. The answer changes without the URL changing (a quiz
	 * swaps to its summary in place), so it is watched rather than derived: a
	 * `MutationObserver` on `#main` wakes a check that is itself O(1), because
	 * `getElementsByTagName` returns a LIVE collection and browse renders a window of rows
	 * rather than all 500.
	 */
	let contentEl = $state<HTMLElement | null>(null);
	let pageOwnsHeading = $state(false);

	$effect(() => {
		const main = contentEl;
		if (!main) return;
		const own = main.getElementsByTagName('h1');
		let frame = 0;
		const check = () => {
			frame = 0;
			pageOwnsHeading = own.length > 0;
		};
		const schedule = () => {
			if (!frame) frame = requestAnimationFrame(check);
		};
		check();
		const watcher = new MutationObserver(schedule);
		watcher.observe(main, { childList: true, subtree: true });
		return () => {
			watcher.disconnect();
			if (frame) cancelAnimationFrame(frame);
		};
	});

	/**
	 * Canonical without the query string: `?state=summary` is a view of `/quiz/1`, not a
	 * separate document, and a shared link should resolve to one address either way.
	 */
	const canonical = $derived(`${page.url.origin}${page.url.pathname}`);

	/**
	 * One address, two states — and the TITLE is allowed to tell them apart even though the
	 * canonical URL is not. A finished run swaps the summary in under `/quiz/3`, so the tab,
	 * the back-history entry and a bookmark were all reading "HSK 3 practice · hskquiz"
	 * whether there were ten questions left or none. Two signals, because the state arrives
	 * two different ways: `?state=summary` is a seeded deep link and is right during SSR,
	 * before anything has rendered; `pageOwnsHeading` is the live swap, and it is the same
	 * observation the bar already makes to hand its <h1> over — inside focus mode, a screen
	 * with a heading of its own is the summary.
	 */
	const finished = $derived(
		page.url.searchParams.get('state') === 'summary' || (route.focus && pageOwnsHeading)
	);
	const title = $derived(finished && route.resultsTitle ? route.resultsTitle : route.title);

	/**
	 * Absolute, because a crawler reads `og:image` out of the document with no page context to
	 * resolve a relative path against. Built through `new URL` rather than by concatenating
	 * the origin: SvelteKit's `base` is a RELATIVE path during SSR (`.` on `/`, `..` on
	 * `/browse/1`), so `origin + base` produces `http://host../og.png`. Resolving it against
	 * the live URL is what turns the relative base back into the right absolute address.
	 */
	const shareImage = $derived(new URL(`${base}/og.png`, page.url).href);
</script>

<svelte:head>
	<title>{title}</title>
	<link rel="canonical" href={canonical} />
	<meta property="og:url" content={canonical} />
	<meta property="og:image" content={shareImage} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta
		property="og:image:alt"
		content="hskquiz — 词汇练习, HSK 1–5 vocabulary practice with tone-coloured pinyin"
	/>
	<meta name="twitter:image" content={shareImage} />
</svelte:head>

<div
	class="shell"
	class:focus={route.focus}
	class:owns-heading={pageOwnsHeading}
	data-mode={route.mode}
	data-chrome={chrome.condensed ? 'condensed' : 'expanded'}
	style:--app-header-h={chrome.measured ? `${chrome.visible}px` : null}
	style:--app-fold-h={chrome.measured ? `${chrome.foldY}px` : null}
	style:--app-bar-measure={chrome.columnWidth > 0 ? `${chrome.columnWidth}px` : null}
	style:--app-bar-pad={chrome.columnPad > 0 ? `${chrome.columnPad}px` : null}
>
	<a class="skip" href="#main">Skip to content</a>

	<AppBar {route} {chrome} {backTarget} {pageOwnsHeading} />

	<div id="main" class="content" tabindex="-1" bind:this={contentEl}>
		{@render children()}
	</div>

	{#if !route.focus}
		<SiteFooter />
	{/if}
</div>

<style>
	.shell {
		/*
		 * Redeclared here, not just in shell.css: a custom property is substituted at the
		 * element that declares it, so the `:root` copy would have baked in the *intrinsic*
		 * 3.5rem. These resolve against the live `--app-header-h` / `--app-fold-h` written
		 * inline above.
		 */
		--app-chrome-h: calc(var(--app-safe-top) + var(--app-header-h));
		--app-sticky-top: calc(var(--app-chrome-h) - var(--app-fold-h));

		display: flex;
		flex-direction: column;
		min-block-size: 100dvh;
	}

	/*
	 * THE ONE SCREEN WHOSE BAR IS ALLOWED TO LEAVE.
	 *
	 * The docked row is a floor because it is the last control standing: on `/browse/1` it is
	 * the only back control and the only thing naming the level anywhere on a 38,402px
	 * document. The landing screen has none of that to protect — its bar renders `汉 hskquiz`
	 * and, counted in the running app, zero interactive elements in either state. There is no
	 * back (this IS the top) and no lateral move (every destination here is a level, and the
	 * page is a grid of them), so the 41px it pinned was 5% of every frame of a 1,914px
	 * document spent telling someone already inside the app what the app is called. Pleco and
	 * Du Chinese both spend that row on navigation; ours can spend it on the levels. Measured
	 * at scrollY 800 on 375x812: bar bottom 41 before, 0 after.
	 *
	 * Zeroing the floor is all it takes: the controller reads it off THIS element (see
	 * `readFloor`), so the bar keeps its 1:1 travel, still comes back on a ~19px flick, and is
	 * always whole at the top of the document. `--app-header-h` therefore reaches 0 here — the
	 * one place in the app where it may — and the level screen's sticky rail, which offsets
	 * against it, rides up with it for free.
	 */
	.shell[data-mode='home'] {
		--app-bar-min-h: 0px;
	}

	.content {
		flex: 1 1 auto;
		inline-size: 100%;
		min-inline-size: 0;
		outline: none;
		/*
		 * The only inline padding the shell imposes: the landscape notch inset, which is 0px
		 * in portrait and on every desktop, so it costs a screen nothing. It is here because
		 * a screen that sets its gutter with a plain `px-5` has no way to know about the
		 * notch, and a screen that does handle it (`.app-shell`) only ends up over-padded in
		 * landscape rather than clipped under the camera housing.
		 */
		padding-inline-start: var(--app-safe-left);
		padding-inline-end: var(--app-safe-right);
	}

	/*
	 * During a quiz the footer is gone, so the shell is what keeps flow content off the
	 * home indicator. A sticky answer bar has to clear it itself — `--app-safe-bottom`.
	 *
	 * The column here is what lets the run TAKE the viewport's height as a definite number.
	 * `.content` grows to fill the 100dvh shell, but its height stays *indefinite* — it comes
	 * from flexing, not from a length — so a child asking for `block-size: 100%` gets `auto`
	 * and the answer buttons end up stranded mid-screen. As a flex column it hands its used
	 * height to the screen instead, and `.quiz` claims it with `flex: 1`.
	 */
	.shell.focus .content {
		display: flex;
		flex-direction: column;
		padding-block-end: var(--app-safe-bottom);
	}

	/*
	 * A RUN IN LANDSCAPE: THE SHELL BECOMES A FRAME AND OWNS THE CEILING.
	 *
	 * `min-block-size: 100dvh` is a floor, not a ceiling. On a landscape phone the run's
	 * intrinsic column is 380px against 328px of space under a 47px bar, so the shell simply
	 * grew to 427 and the only control on the screen — "Got it" / "Next word", 45px of pill —
	 * sat at y373→419: 2px of it visible, 44px below the fold, on every cold load measured at
	 * 812x375 and 667x375 and on 4 of 6 at 844x390. The
	 * shell used to name that number in a comment and assign the fix to the run. It is the
	 * shell's: "the last control is on screen" is the one guarantee focus mode exists to give.
	 *
	 * Three rules, and each one is load-bearing:
	 *
	 *   block-size 100dvh + overflow hidden   A CEILING. The document is exactly one viewport
	 *                                         — `scrollHeight === innerHeight` — so nothing can
	 *                                         push a control past the bottom edge any more.
	 *   the bar leaves the flow               47px of the 52px shortfall is the bar itself.
	 *                                         AppBar lifts it to `position: fixed` in the same
	 *                                         media query and keeps only the exit control, so
	 *                                         the run gets the whole frame. `--app-chrome-h`
	 *                                         drops to the safe inset to match: it answers "how
	 *                                         much of the viewport is not the screen's", and a
	 *                                         bar out of flow takes none. Without that the
	 *                                         quiz's rail (sticky at `--app-chrome-h`) would be
	 *                                         shoved 47px down over the question.
	 *   the screen sizes to its content       `flex: none` on whatever the screen renders into
	 *                                         `#main`, centred with `safe center`. Growing into
	 *                                         a definite frame is what strands a bottom control
	 *                                         mid-air when the frame is TALLER than the run
	 *                                         (932x430 wasted 47px under the button); shrinking
	 *                                         into it would clip a summary. Content height,
	 *                                         centred, and `overflow-y: auto` on the frame is
	 *                                         the safety net for a card taller than any we can
	 *                                         measure — it stays reachable rather than clipped.
	 *
	 * Scoped to a RUN, not to focus mode generally: `.owns-heading` means the screen rendered
	 * an <h1> of its own, which is the summary and the dead-end panels. Those are pages — they
	 * scroll, they have their own title on screen, and they want the bar in flow above them.
	 */
	@media (orientation: landscape) and (max-height: 30rem) {
		.shell.focus:not(.owns-heading) {
			--app-chrome-h: var(--app-safe-top);

			block-size: 100dvh;
			overflow: hidden;
		}

		.shell.focus:not(.owns-heading) .content {
			min-block-size: 0;
			justify-content: safe center;
			overflow-y: auto;
			overscroll-behavior: contain;
		}

		.shell.focus:not(.owns-heading) .content > :global(*) {
			flex: none;
			min-block-size: 0;
		}

		/* The chrome total is 0 here, and the skip link is the one thing that must not ride it
		   down: it would land under the floating exit control. It clears the bar's real box. */
		.shell.focus:not(.owns-heading) .skip {
			inset-block-start: calc(var(--app-safe-top) + var(--app-header-h) + 0.5rem);
		}
	}

	.skip {
		position: fixed;
		/* Rides the live chrome, so it stays visible even with the bar retracted. */
		inset-block-start: calc(var(--app-chrome-h) + 0.5rem);
		inset-inline-start: max(var(--spacing-gutter), var(--app-safe-left));
		/* Under the bar's z-40, so it slides out from behind it instead of across the wordmark. */
		z-index: 30;
		translate: 0 -300%;
		padding: 0.625rem 1rem;
		border-radius: var(--radius-sm);
		background-color: var(--color-primary);
		color: var(--color-primary-ink);
		font-size: var(--text-sm);
		font-weight: 600;
		text-decoration: none;
		transition: translate 160ms var(--ease-out-soft);
	}

	.skip:focus {
		translate: 0 0;
	}
</style>
