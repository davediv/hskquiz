<!--
	Level select — the first screen, and the one that decides whether anyone reaches a quiz.

	Three jobs. Say what each level is (band, size, and the words you actually meet there) so a
	newcomer can pick. Show what the learner has already done there so a returning one recognises
	their own history rather than a generic menu. And point at exactly one of the five, because a
	menu where every row shouts equally is a menu nobody starts from.

	The layout is a single 34rem column on a phone and a two-column split from 64rem, where the
	standing information (what this is, where you are overall) parks in a sticky rail and the five
	levels get the reading column. From 80rem that column goes three abreast, which is one row per
	band and therefore all five cards on one 900px screen — measured, last card bottom 806.
-->
<script lang="ts">
	import { LEVELS, LEVEL_SIZES, type Level } from '$lib/types';
	import { SHIPPED_SIZES, SHIPPED_TOTAL } from '$lib/data/sizes';
	import { progress } from '$lib/progress';
	import { availableSessionStorage, clearAllSessions } from '$lib/session/persistence';
	import { Pinyin } from '$lib/design';
	import StorageNotice from '$lib/progress/StorageNotice.svelte';
	import LevelCard from '$lib/components/levels/LevelCard.svelte';
	import { LEVEL_BANDS } from '$lib/components/levels/levelMeta';
	import { PREVIEW_COUNT, weakestIds } from '$lib/components/levels/preview';
	import { formatAccuracy, levelStats, overallSummary } from '$lib/components/levels/stats';

	// Progress lives in localStorage, so the server renders an empty store and the client
	// renders a full one. Holding every progress-driven value back until after hydration keeps
	// the two in agreement; the markup is the same shape either way, so nothing jumps when the
	// real numbers arrive.
	let hydrated = $state(false);
	let now = $state(0);

	$effect(() => {
		now = Date.now();
		hydrated = true;
	});

	// NB: must not be named `state` — Svelte reads `$state` as store-access on a
	// binding called `state`, which breaks the rune itself.
	const snapshot = $derived(hydrated ? progress.state : null);
	const summary = $derived(overallSummary(snapshot));
	const cards = $derived(
		LEVELS.map((level: Level) => ({
			level,
			total: SHIPPED_SIZES[level],
			stats: levelStats(snapshot, level),
			// Whose three words this level's card shows. Empty until there are enough misses
			// here to fill the list, and the card falls back to the static three. Twice as many
			// candidates as entries: the card spends the spares on words that were merged out
			// of the shipped list, and on ones whose hanzi and pinyin will not share a line at
			// its width.
			weakIds: weakestIds(snapshot, level, PREVIEW_COUNT, PREVIEW_COUNT * 2)
		}))
	);
	const byLevel = $derived(new Map(cards.map((card) => [card.level, card])));

	/**
	 * The shipped count and the official one, and the gap between them stated out loud.
	 *
	 * The standard this app cites says 4,316; the box holds 4,308, because eight pairs of
	 * same-pinyin homographs (老, 省, 把 …) are one card each — see `src/lib/data/sizes.ts`.
	 * Printing 4,308 under that citation with no explanation is how a correct word list gets
	 * read as a broken one, so the difference is derived here rather than described, and can
	 * never drift out of step with either constant.
	 */
	const officialTotal = LEVELS.reduce((sum, level) => sum + LEVEL_SIZES[level], 0);
	const mergedPairs = officialTotal - SHIPPED_TOTAL;

	/**
	 * The one-line headline over the level list. Only stats that have a value appear.
	 *
	 * No "1h ago" here. The strip only exists for a learner who has already practised, which is
	 * exactly the state in which the first card is furthest down the phone (344px of 812), and
	 * a fourth stat pushed this to two lines. The card carrying `Continue` prints the same
	 * relative time verbatim two rows below, so nothing is lost by cutting it here.
	 */
	const headline = $derived.by(() => {
		const stats: { value: string; label: string }[] = [
			{
				// Grouped, like every other figure on this screen: `4308 words practised` sat
				// directly under `4,308 cards` in the colophon.
				value: summary.practised.toLocaleString('en'),
				label: summary.practised === 1 ? 'word practised' : 'words practised'
			}
		];
		if (summary.mastered > 0) {
			stats.push({ value: summary.mastered.toLocaleString('en'), label: 'mastered' });
		}
		if (summary.accuracy !== null) {
			stats.push({ value: formatAccuracy(summary.accuracy), label: 'correct' });
		}
		return stats;
	});

	/**
	 * Exactly one card carries the filled button, in every state. A first-time visitor is sent
	 * to HSK 1; a returning one is sent back where they left off, which is the level they last
	 * played, or failing that the deepest one they have touched.
	 */
	const featured = $derived.by(() => {
		if (!summary.started) return 1 as Level;
		const played = cards.filter((card) => card.stats.lastPlayed > 0);
		if (played.length > 0) {
			return played.reduce((a, b) => (b.stats.lastPlayed > a.stats.lastPlayed ? b : a)).level;
		}
		const touched = cards.filter((card) => card.stats.practised > 0);
		return touched.length > 0 ? touched[touched.length - 1].level : (1 as Level);
	});
	const featuredLabel = $derived(summary.started ? 'Continue' : 'Start here');

	let confirmingReset = $state(false);
	let resetTimer: ReturnType<typeof setTimeout> | undefined;

	function onReset() {
		clearTimeout(resetTimer);
		if (!confirmingReset) {
			// Two taps, no modal: the second one inside four seconds is the one that erases.
			confirmingReset = true;
			resetTimer = setTimeout(() => (confirmingReset = false), 4000);
			return;
		}
		confirmingReset = false;
		if (progress.resetAll()) clearAllSessions(availableSessionStorage());
	}
</script>

<div class="hskq-page">
	<header class="hskq-rail">
		<!--
			Title, reading and scope on one baseline, and only two lines when they have to be.

			The pinyin is the app's most prominent — it teaches on sight, so it is painted by the
			same component and the same tone tokens as every other syllable in the app. It used
			to be a flat `text-accent`, which is the exact red of ✕ NOT QUITE.

			Two components, one per word, and not one with `spaced={false}`: 汉语拼音正词法基本规则
			joins the syllables *inside* a word and separates the words, so cíhuì liànxí is right,
			cí huì liàn xí (spaced) and cíhuìliànxí (unspaced, one span) are both wrong. The gap
			between the two elements is the word gap.

			`HSK 3.0` is on this line rather than in an eyebrow above it. As its own row it cost
			21px of the phone's first screen — the finding the header has now been given three
			loops running — to say something the page says four more times below: the two band
			headings carry HSK 1–3 and HSK 4–5, all five cards carry their own number, and the
			colophon names the standard next to the count it qualifies. What was worth keeping
			above the fold is the *version*: HSK 2.0 was six levels of a different list, and a
			learner has to know which one this is before the first card, not after the last.

			36px, not 48px. The largest Chinese on this page used to be 词汇练习, and 汇 is an
			HSK 4 character — so an HSK 1 beginner's biggest glyphs were ones they could not
			read, with the words they *can* read set smaller on the cards below. At the hanzi
			scale's `md` step the masthead is exactly the size of the preview words, which is
			the right answer for a vocabulary app: nothing on the screen outsizes the vocabulary.
			It is also 10px of the same first screen.

			Wrapping rather than a breakpoint: at 375px 词汇练习 (147px), cíhuì liànxí (92px) and
			HSK 3.0 all sit on one line. In the 14rem desktop rail the same flex box wraps them
			onto two, unchanged.
		-->
		<div class="hskq-title">
			<h1 class="hanzi-display text-hanzi-md text-ink" lang="zh-Hans">词汇练习</h1>
			<p class="hskq-reading">
				<Pinyin pinyin="cíhuì" size="md" spaced={false} />
				<Pinyin pinyin="liànxí" size="md" spaced={false} />
			</p>
			<p class="eyebrow">HSK 3.0</p>
		</div>
		<p class="mt-2 max-w-[38ch] text-sm text-ink-muted">
			Five levels, ten questions a session, weighted toward what you keep missing.
		</p>

		<!-- Hairlines rather than a card, and only once there is something to put in them: on a
		     first visit every line here is a line between the reader and the first level. What
		     used to sit in this slot — a homograph footnote and a storage promise — is now the
		     colophon at the foot of the page, which is where lexicography belongs.
		     Separators are drawn in CSS so that dropping a stat cannot strand a dot. -->
		{#if summary.started}
			<section class="hskq-strip" aria-label="Your progress">
				<p class="tabular text-xs text-ink-muted">
					{#each headline as stat (stat.label)}
						<span class="hskq-stat">
							<strong class="font-semibold text-ink">{stat.value}</strong>
							{stat.label}
						</span>
					{/each}
				</p>
				<button
					type="button"
					class="hskq-reset shrink-0 rounded-sm px-2 text-xs font-semibold"
					class:hskq-reset-armed={confirmingReset}
					onclick={onReset}
				>
					{confirmingReset ? 'Tap again to erase' : 'Reset'}
				</button>
			</section>
		{/if}

		<!-- Silent while writes land; one line when they do not. -->
		<StorageNotice class="mt-2.5" />
	</header>

	<main class="hskq-levels" aria-label="Choose a level">
		<!-- Grouped by band rather than repeating ELEMENTARY on three cards in a row: the heading
		     says it once, and gets to carry 初等 / 中等 at a size hanzi is legible at. -->
		{#each LEVEL_BANDS as band (band.key)}
			<section class="hskq-band-section" aria-labelledby="band-{band.key}">
				<h2 class="hskq-band" id="band-{band.key}">
					<span class="hanzi text-hanzi-xs text-ink" lang="zh-Hans">{band.hanzi}</span>
					<span class="eyebrow"
						>{band.name} · HSK {band.levels[0]}–{band.levels[band.levels.length - 1]}</span
					>
					<span class="hskq-rule" aria-hidden="true"></span>
				</h2>
				<ul class="hskq-grid">
					{#each band.levels as level (level)}
						{@const card = byLevel.get(level)}
						{#if card}
							<li>
								<LevelCard
									level={card.level}
									total={card.total}
									stats={card.stats}
									weakIds={card.weakIds}
									{now}
									featured={card.level === featured}
									{featuredLabel}
								/>
							</li>
						{/if}
					{/each}
				</ul>
			</section>
		{/each}
	</main>

	<!--
		The count caveat, at the foot of the page rather than over the first level.

		It is correct and it has to be said — the standard this app cites says 4,316 and the box
		holds 4,308 — but it is a lexicography footnote, and it was renting the most valuable
		46px on the phone. Down here it sits next to the citation it qualifies.
	-->
	<aside class="hskq-colophon" aria-label="About this word list">
		<p>
			{SHIPPED_TOTAL.toLocaleString('en')} cards from the HSK 3.0 standard's {officialTotal.toLocaleString(
				'en'
			)} entries — {mergedPairs} pairs of same-pinyin homographs share a card.
		</p>
		<!-- Claimed only while writes are actually landing: `StorageNotice` says the opposite
		     when they are not, and the two must never be on screen together. -->
		{#if !hydrated || progress.status === 'saving'}
			<p class="mt-1">Progress is kept on this device — no account needed.</p>
		{/if}
	</aside>
</div>

<style>
	.hskq-page {
		inline-size: 100%;
		max-inline-size: var(--container-app);
		margin-inline: auto;
		padding-block: 0.5rem 2.5rem;
		padding-inline-start: max(var(--spacing-gutter), var(--app-safe-left, 0px));
		padding-inline-end: max(var(--spacing-gutter), var(--app-safe-right, 0px));
	}

	.hskq-levels {
		margin-block-start: 0.5rem;
	}

	/* Baseline-aligned, and allowed to wrap: one line at 375px, two in the desktop rail. */
	.hskq-title {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		column-gap: 0.75rem;
		row-gap: 0.375rem;
	}

	.hskq-reading {
		/* Never the only thing on its line while the title is still on the one above. */
		white-space: nowrap;
	}

	.hskq-band-section + .hskq-band-section {
		margin-block-start: 1rem;
	}

	/* Baseline-aligned hanzi + eyebrow, with a hairline running out to the edge so the group
	   reads as a divider and not as a sixth card. */
	.hskq-band {
		display: flex;
		align-items: baseline;
		gap: 0.625rem;
		margin-block-end: 0.375rem;
		font-size: inherit;
		font-weight: inherit;
		letter-spacing: normal;
	}

	.hskq-rule {
		flex: 1;
		block-size: 1px;
		background-color: var(--color-line);
	}

	/* `minmax(0, 1fr)` even at one column. A grid's implicit track is `auto`, so it is sized by
	   its content's min-content, and a card carries hanzi and pinyin that are both `nowrap` —
	   left implicit, a card that could not fit widened *itself* and the page picked up a
	   horizontal scroll instead. Zero floor: the card is the width the column gives it, always.
	   Since loop 6 the preview is a column of full-width entries rather than three words
	   abreast, so the min-content the floor is holding back is one word, not three. */
	.hskq-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 0.625rem;
	}

	/* Quiet, and last. Small type on the subtle ink, capped at a readable measure. */
	.hskq-colophon {
		margin-block-start: 1.25rem;
		max-inline-size: 46ch;
		font-size: var(--text-xs);
		color: var(--color-ink-subtle);
	}

	.hskq-strip {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		margin-block-start: 0.75rem;
		padding-block: 0.5rem;
		border-block: 1px solid var(--color-line);
	}

	/* From 64rem the standing information stops scrolling with the list it describes, and the
	   list itself goes two abreast — 1,440px was spending 480px on nothing while the fifth
	   level sat below the fold.

	   The rail is 14rem, not the 18rem of loop 3, and the two columns are 2.5rem apart rather
	   than 3rem. Both of those went to the cards, because at three abreast the card is the
	   narrowest column on any device this app runs on — 287px against a 375px phone's 301 — and
	   what a card sets on one line is a whole word plus its pinyin plus its English. It also
	   gives the rail less blank to leave under itself. 14rem holds 词汇练习 at 48px (196px)
	   with room to spare, which is the constraint. */
	@media (min-width: 64rem) {
		.hskq-page {
			display: grid;
			grid-template-columns: 14rem minmax(0, 46rem);
			justify-content: center;
			gap: 2.5rem;
			max-inline-size: 70rem;
			padding-block: 1.5rem 2rem;
			padding-inline: 2rem;
		}

		.hskq-rail {
			position: sticky;
			top: calc(var(--app-header-h, 3.5rem) + 2rem);
			align-self: start;
		}

		.hskq-levels {
			margin-block-start: 0;
		}

		.hskq-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		/* Under the list it belongs to, not under the sticky rail — auto-placement would
		   otherwise drop it into the left column, a screen below the thing it annotates. */
		.hskq-colophon {
			grid-column: 2;
			margin-block-start: 1.5rem;
		}
	}

	/* Wide enough for a whole band on one line: 初等 is three levels, so at two abreast HSK 3
	   sat alone on its own row and pushed HSK 4–5 under the 900px fold. Three abreast puts the
	   list back to one row per band — every level on one screen, last card bottom 806 at
	   1440x900 — and 80rem is the width at which a 287px card still sets 大学生 dàxuéshēng on
	   one line. */
	@media (min-width: 80rem) {
		.hskq-page {
			/* Capped above what is ever available, so the reading column takes everything the
			   rail and the gutter do not: 984px at 1440, 952px at 1280. A 58.5rem cap left
			   32px of the page unspent and each card 11px narrower than it had to be. */
			grid-template-columns: 14rem minmax(0, 62rem);
			grid-template-rows: auto 1fr;
			max-inline-size: 82rem;
		}

		.hskq-grid {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}

		/* At this width the list is one screen tall, so the rail has nothing left to do below
		   the tagline and the note has nowhere sensible to sit under a two-row grid. Putting it
		   in the rail's column fills that void with the one thing on the page that is genuinely
		   an aside. */
		.hskq-rail {
			grid-row: 1;
			grid-column: 1;
		}

		.hskq-levels {
			grid-row: 1 / span 2;
			grid-column: 2;
		}

		/* `end`, not `start`. Hung under the tagline the colophon left 414px of the rail blank
		   below itself at 1440x900 — a fragment with a void under it rather than a column. On
		   the row's far end it is the foot of the page: masthead at the top of the rail, the
		   lexicography note level with the bottom of the last card, and the empty middle reads
		   as air between two anchors instead of a hole. */
		.hskq-colophon {
			grid-row: 2;
			grid-column: 1;
			align-self: end;
			margin-block-start: 2rem;
		}
	}

	/* Separator lives on the element, so a missing stat cannot leave a stranded dot. */
	.hskq-stat + .hskq-stat::before {
		content: ' · ';
		color: var(--color-ink-subtle);
	}

	.hskq-reset {
		/* Keeps the 44px hit area without letting it inflate the strip it sits in. */
		min-block-size: var(--spacing-tap);
		margin-block: -0.625rem;
		color: var(--color-ink-subtle);
		transition:
			color 140ms var(--ease-out-soft),
			background-color 140ms var(--ease-out-soft);
	}

	.hskq-reset-armed {
		color: var(--color-accent);
		background-color: var(--color-accent-soft);
	}

	@media (hover: hover) {
		.hskq-reset:hover {
			color: var(--color-ink);
		}

		.hskq-reset-armed:hover {
			color: var(--color-accent);
		}
	}
</style>
