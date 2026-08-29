<!--
	One level, as a card.

	The card's job is to make five levels tell themselves apart. The size and the blurb say
	what is in the box in English; the preview row says it in Chinese, with three real words
	lifted verbatim out of that level's shipped list. Loop 1 put a Chinese numeral in a red
	square here instead — 一 reads as a minus sign, 三 as a hamburger menu — and the result was
	a level menu for a Chinese app containing no Chinese vocabulary at all.

	Preview and meter are the same slot, and only one of them is ever true: before a level has
	been practised the meter is an empty rail with nothing to report, so the words take the
	space; once there is progress, the progress is the more interesting thing to say.
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import { Hanzi, Pinyin } from '$lib/design';
	import type { Level } from '$lib/types';
	import { LEVEL_META } from './levelMeta';
	import { LEVEL_PREVIEW } from './preview';
	import { formatAccuracy, formatWhen, type LevelStats } from './stats';

	interface Props {
		level: Level;
		/** Words in the level — the denominator for the meter. */
		total: number;
		stats: LevelStats;
		/** Epoch ms used for relative time. 0 before hydration, which hides the timestamp. */
		now: number;
		/** The one card in the list carrying the filled button. Exactly one, in every state. */
		featured?: boolean;
		/** Short reason this card is the featured one, e.g. `Start here`. */
		featuredLabel?: string;
	}

	let { level, total, stats, now, featured = false, featuredLabel = '' }: Props = $props();

	const meta = $derived(LEVEL_META[level]);
	const preview = $derived(LEVEL_PREVIEW[level]);
	// resolve() rather than a literal href, so both links survive a non-empty `base`.
	const quizHref = $derived(resolve('/quiz/[level]', { level: String(level) }));
	const browseHref = $derived(resolve('/browse/[level]', { level: String(level) }));
	const pct = $derived(total > 0 ? Math.min(100, (stats.practised / total) * 100) : 0);
	const started = $derived(stats.practised > 0);

	// Two slots of meta under the meter, shown only once there is a meter to caption.
	// Always "n of total": a count with no denominator is the same dead rail the empty meter
	// was. Du Chinese prints "0/12 chapters read" even at zero, and that is why it reads.
	const left = $derived(
		stats.mastered > 0
			? `${stats.practised} of ${total} · ${stats.mastered} mastered`
			: `${stats.practised} of ${total} practised`
	);
	const right = $derived(
		[formatAccuracy(stats.accuracy), formatWhen(stats.lastPlayed, now)].filter(Boolean).join(' · ')
	);
</script>

<article
	class="card hskq-card p-4.5"
	class:hskq-featured={featured}
	aria-labelledby="level-{level}-title"
>
	<div class="flex items-baseline gap-x-2.5 gap-y-1">
		<h3 id="level-{level}-title" class="text-xl leading-tight font-semibold">HSK {level}</h3>
		{#if featured && featuredLabel}
			<span class="chip chip-accent self-center">{featuredLabel}</span>
		{/if}
		<p class="ml-auto shrink-0 tabular text-xs text-ink-subtle">
			{total.toLocaleString('en')} words
		</p>
	</div>

	<!-- Full width rather than beside the title: at 375px a phrase this long wraps in a
	     narrow column, and cards that wrap differently stop looking like one list. -->
	<p class="mt-1.5 text-sm leading-snug text-ink-muted">{meta.blurb}</p>

	{#if started}
		<div class="meter mt-3.5" aria-hidden="true">
			<div class="hskq-fill" style:width="{pct}%"></div>
		</div>
		<div class="mt-2 flex items-baseline justify-between gap-3 tabular text-xs">
			<span class="min-w-0 text-ink-muted">{left}</span>
			<span class="shrink-0 text-ink-subtle">{right}</span>
		</div>
	{:else}
		<!-- The three words are in the blurb's order, so the row reads as its evidence. -->
		<ul class="hskq-preview mt-2.5" aria-label="Words from HSK {level}">
			{#each preview as word (word.id)}
				<li>
					<Hanzi text={word.hanzi} size="md" class="block text-ink" />
					<!-- Crimson, not tone-coloured: this screen spends its whole colour budget on
					     one accent, and fifteen words in five hues would spend it fifteen times.
					     `spaced={false}` keeps the list's own orthography — `xièxie`, not `xiè xie`. -->
					<Pinyin
						pinyin={word.pinyin}
						size="sm"
						tones={false}
						spaced={false}
						class="mt-1 block truncate text-accent"
					/>
					<span class="mt-0.5 block text-xs leading-snug text-ink-subtle">{word.gloss}</span>
				</li>
			{/each}
		</ul>
	{/if}

	<div class="hskq-actions flex items-center gap-4">
		<a class="btn flex-1" class:btn-primary={featured} class:btn-quiet={!featured} href={quizHref}>
			Practise<span class="sr-only"> HSK {level}</span>
		</a>
		<a class="hskq-browse" href={browseHref}>
			Browse<span class="sr-only"> HSK {level} vocabulary</span>
		</a>
	</div>
</article>

<style>
	.hskq-card {
		/* Column + full height so two cards sharing a desktop row line their buttons up even
		   when one is showing a meter and the other a preview row. */
		display: flex;
		flex-direction: column;
		block-size: 100%;
		transition:
			box-shadow 180ms var(--ease-out-soft),
			border-color 180ms var(--ease-out-soft);
	}

	/* The recommended level is the only one that draws a line around itself. */
	.hskq-featured {
		border-color: var(--color-line-strong);
	}

	.hskq-actions {
		margin-block-start: auto;
		padding-block-start: 0.625rem;
	}

	/* A handful of words out of a thousand is still worth seeing. */
	.hskq-fill {
		min-width: 0.625rem;
	}

	/* Three equal columns, so the hanzi baselines line up across the row and across the list.
	   `minmax(0, 1fr)` because a long gloss must wrap rather than widen its column. */
	.hskq-preview {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.625rem;
	}

	/* Secondary by a wide margin: browsing is what you do when you are not practising, and
	   two identical pills per card made a list of ten equal-weight buttons. */
	.hskq-browse {
		display: inline-flex;
		align-items: center;
		min-block-size: var(--spacing-tap);
		padding-inline: 0.125rem;
		color: var(--color-ink-muted);
		font-size: var(--text-sm);
		font-weight: 600;
		text-decoration: underline;
		text-decoration-color: var(--color-line-strong);
		text-decoration-thickness: 1px;
		text-underline-offset: 0.25em;
		transition: color 140ms var(--ease-out-soft);
	}

	@media (hover: hover) {
		.hskq-card:hover {
			box-shadow: var(--shadow-lift);
		}

		.hskq-browse:hover {
			color: var(--color-ink);
			text-decoration-color: currentcolor;
		}
	}
</style>
