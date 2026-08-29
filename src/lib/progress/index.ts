/**
 * `$lib/progress` — the persisted learning record.
 *
 * Import the singleton and mutate it; it takes care of writing itself to `localStorage`.
 *
 * ```ts
 * import { progress } from '$lib/progress';
 *
 * progress.recordAnswer(word.id, correct);
 * progress.forWord(word.id).streak;
 * progress.state.levels[3]?.sessions ?? 0;
 * ```
 */

export {
	ProgressStore,
	progress,
	progress as default,
	type ProgressStoreOptions,
	type ProgressSummary,
	type StorageLike
} from './progress.svelte.ts';

export {
	MASTERY_STREAK,
	SCHEMA_VERSION,
	STORAGE_KEY,
	applyAnswer,
	blankWord,
	decode,
	emptyState,
	encode,
	levelOfId
} from './progress-core.ts';
