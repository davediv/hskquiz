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
 *
 * A write is never a blind overwrite: `flush()` reads the key, rescues bytes it cannot decode,
 * three-way merges what is there with what this tab holds, and writes the union. `status` says
 * where progress is actually going, and `$lib/progress/StorageNotice.svelte` renders it — that
 * component is imported by path, not from here, so this barrel stays compiler-free for the node
 * test project.
 */

export {
	ProgressStore,
	progress,
	progress as default,
	type ProgressStoreOptions,
	type ProgressSummary,
	type StorageLike,
	type StorageStatus
} from './progress.svelte.ts';

export {
	BACKUP_KEY,
	MASTERY_STREAK,
	SCHEMA_VERSION,
	STORAGE_KEY,
	type StoredProgress,
	type Tombstones,
	applyAnswer,
	applyTombstones,
	blankWord,
	decode,
	decodeStored,
	emptyState,
	emptyStored,
	encode,
	isShippableWordId,
	isUsableWordId,
	levelOfId,
	mergeProgress,
	ownRecord,
	snapshot
} from './progress-core.ts';
