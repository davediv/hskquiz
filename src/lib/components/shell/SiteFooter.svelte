<!--
	Attribution, and nothing else.

	The word list is the official HSK 3.0 standard, and the English glosses in
	`src/lib/data/*.json` are derived from CC-CEDICT, whose CC BY-SA 4.0 licence requires
	credit wherever those glosses ship. It sits at the foot of every browsing screen —
	reachable and honest, quiet enough to ignore. It is dropped during a quiz run, where the
	bottom of the screen belongs to the answer buttons.
-->
<footer class="foot">
	<p>
		Word list: <span class="strong">HSK 3.0</span> —
		<span lang="zh-Hans">《国际中文教育中文水平等级标准》</span> (GF 0025-2021).
	</p>
	<p>
		English glosses adapted from
		<a href="https://www.mdbg.net/chinese/dictionary?page=cedict" target="_blank" rel="noreferrer"
			>CC-CEDICT</a
		>, licensed
		<a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer"
			>CC BY-SA 4.0</a
		>.
	</p>
</footer>

<style>
	.foot {
		inline-size: 100%;
		max-inline-size: var(--container-app);
		margin-inline: auto;
		margin-block-start: 2rem;
		padding-block: 1.25rem calc(1.25rem + var(--app-safe-bottom));
		padding-inline-start: max(var(--spacing-gutter), var(--app-safe-left));
		padding-inline-end: max(var(--spacing-gutter), var(--app-safe-right));
		border-block-start: 1px solid var(--color-line);
		color: var(--color-ink-subtle);
		font-size: var(--text-xs);
		line-height: 1.6;
		text-align: center;
		text-wrap: pretty;
	}

	.foot p {
		margin: 0;
	}

	.strong {
		font-weight: 600;
		color: var(--color-ink-muted);
	}

	/* The design system paints links accent-red; attribution is not a call to action. */
	.foot a {
		color: inherit;
		text-decoration: underline;
		text-decoration-color: var(--color-line-strong);
	}

	@media (hover: hover) {
		.foot a:hover {
			color: var(--color-ink);
			text-decoration-color: currentcolor;
		}
	}
</style>
