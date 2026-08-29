<!--
	The search field.

	`type="search"` for the right keyboard and the platform's own clear affordance, with the
	iOS text-entry helpers turned off — autocapitalise would fight every pinyin query, and a
	spellchecker underlining `hao` in red is noise. The explicit clear button exists because
	the native one is Safari-only and a browse screen you cannot get out of a filter is broken.

	`/` focuses it from anywhere on the page, and Escape inside it clears then releases it —
	both the conventions a keyboard user already has from every other list-and-filter UI.
-->
<script lang="ts">
	interface Props {
		value: string;
		placeholder?: string;
		/** Announced live so the result count reaches a screen reader as the list narrows. */
		describedBy?: string;
	}

	let { value = $bindable(''), placeholder = 'Search', describedBy }: Props = $props();

	let input = $state<HTMLInputElement | null>(null);

	function onKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape') return;
		if (value === '') {
			input?.blur();
			return;
		}
		event.preventDefault();
		value = '';
	}

	// A bare `/` is the list-filter shortcut everywhere else; only claim it when the learner is
	// not already typing into something.
	$effect(() => {
		function onDocumentKeydown(event: KeyboardEvent) {
			if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
			const target = event.target;
			if (target instanceof HTMLElement && target.closest('input, textarea, [contenteditable]')) {
				return;
			}
			event.preventDefault();
			input?.focus();
			input?.select();
		}

		document.addEventListener('keydown', onDocumentKeydown);
		return () => document.removeEventListener('keydown', onDocumentKeydown);
	});
</script>

<div class="field">
	<svg class="glass" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
		<circle cx="8.75" cy="8.75" r="5.25" fill="none" stroke="currentColor" stroke-width="1.9" />
		<path
			d="m12.9 12.9 3.6 3.6"
			fill="none"
			stroke="currentColor"
			stroke-width="1.9"
			stroke-linecap="round"
		/>
	</svg>

	<input
		bind:this={input}
		bind:value
		type="search"
		class="input"
		{placeholder}
		aria-label="Search this level by hanzi, pinyin or meaning"
		aria-describedby={describedBy}
		autocomplete="off"
		autocapitalize="off"
		autocorrect="off"
		spellcheck="false"
		enterkeyhint="search"
		onkeydown={onKeydown}
	/>

	{#if value !== ''}
		<button type="button" class="clear" onclick={() => (value = '')}>
			<span class="sr-only">Clear search</span>
			<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
				<circle cx="10" cy="10" r="8" fill="currentColor" />
				<path
					d="m7.2 7.2 5.6 5.6M12.8 7.2l-5.6 5.6"
					fill="none"
					stroke="var(--color-surface-sunken)"
					stroke-width="2"
					stroke-linecap="round"
				/>
			</svg>
		</button>
	{/if}
</div>

<style>
	.field {
		position: relative;
		display: flex;
		align-items: center;
	}

	.glass {
		position: absolute;
		inset-inline-start: 0.75rem;
		inline-size: 1.125rem;
		block-size: 1.125rem;
		color: var(--color-ink-subtle);
		pointer-events: none;
	}

	.input {
		inline-size: 100%;
		min-block-size: var(--spacing-tap);
		padding-block: 0.5rem;
		padding-inline: 2.375rem 2.5rem;
		border: 1px solid var(--color-line-strong);
		border-radius: var(--radius-pill);
		background-color: var(--color-surface);
		color: var(--color-ink);
		font-family: var(--font-pinyin);
		font-size: var(--text-base);
		line-height: 1.4;
		box-shadow: none;
		appearance: none;
	}

	.input::placeholder {
		color: var(--color-ink-subtle);
	}

	/* Safari's own clear button would sit under ours. */
	.input::-webkit-search-cancel-button {
		display: none;
	}

	.clear {
		position: absolute;
		inset-inline-end: 0.25rem;
		display: grid;
		place-items: center;
		inline-size: var(--spacing-tap);
		block-size: var(--spacing-tap);
		border: 0;
		border-radius: var(--radius-pill);
		background: none;
		color: var(--color-ink-subtle);
	}

	.clear svg {
		inline-size: 1.25rem;
		block-size: 1.25rem;
	}

	@media (hover: hover) {
		.clear:hover {
			color: var(--color-ink-muted);
		}
	}
</style>
