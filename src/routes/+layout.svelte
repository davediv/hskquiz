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
	                    NEVER 0, never negative: the bar compacts to a docked row that still
	                    carries the back control and the level's name, and stays there.
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
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import AppBar from '$lib/components/shell/AppBar.svelte';
	import SiteFooter from '$lib/components/shell/SiteFooter.svelte';
	import { readRoute } from '$lib/components/shell/route';
	import { createChrome } from '$lib/components/shell/chrome.svelte';
	import { createBackTarget } from '$lib/components/shell/back.svelte';

	let { children } = $props();

	const route = $derived(readRoute(page.url.pathname, base));
	const chrome = createChrome();
	const backTarget = createBackTarget(base);

	$effect(() => chrome.listen());

	// A new screen always starts with its chrome intact, however the last one left it — and
	// its column may be a different width from the one we just left.
	afterNavigate(() => {
		chrome.reveal(true);
		chrome.sync();
	});

	/**
	 * Canonical without the query string: `?state=summary` is a view of `/quiz/1`, not a
	 * separate document, and a shared link should resolve to one address either way.
	 */
	const canonical = $derived(`${page.url.origin}${page.url.pathname}`);

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
	<title>{route.title}</title>
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
	data-chrome={chrome.condensed ? 'condensed' : 'expanded'}
	style:--app-header-h={chrome.measured ? `${chrome.visible}px` : null}
	style:--app-fold-h={chrome.measured ? `${chrome.foldY}px` : null}
	style:--app-bar-measure={chrome.columnWidth > 0 ? `${chrome.columnWidth}px` : null}
	style:--app-bar-pad={chrome.columnPad > 0 ? `${chrome.columnPad}px` : null}
>
	<a class="skip" href="#main">Skip to content</a>

	<AppBar {route} {chrome} {backTarget} />

	<div id="main" class="content" tabindex="-1">
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
	 * The column here is what lets the run be exactly one viewport tall. `.content` grows to
	 * fill the 100dvh shell, but its height stays *indefinite* — it comes from flexing, not
	 * from a length — so a child asking for `block-size: 100%` gets `auto` and the answer
	 * buttons end up stranded mid-screen. As a flex column it hands its used height to the
	 * screen instead, and `.quiz` claims it with `flex: 1`.
	 */
	.shell.focus .content {
		display: flex;
		flex-direction: column;
		padding-block-end: var(--app-safe-bottom);
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
