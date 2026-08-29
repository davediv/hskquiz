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
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import AppBar from '$lib/components/shell/AppBar.svelte';
	import SiteFooter from '$lib/components/shell/SiteFooter.svelte';
	import { readRoute } from '$lib/components/shell/route';

	let { children } = $props();

	const route = $derived(readRoute(page.url.pathname, base));
</script>

<svelte:head>
	<title>{route.title}</title>
</svelte:head>

<a class="skip" href="#main">Skip to content</a>

<div class="shell" class:focus={route.focus}>
	<AppBar {route} />

	<div id="main" class="content" tabindex="-1">
		{@render children()}
	</div>

	{#if !route.focus}
		<SiteFooter />
	{/if}
</div>

<style>
	.shell {
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
		inset-block-start: calc(var(--app-safe-top) + var(--app-header-h) + 0.5rem);
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
