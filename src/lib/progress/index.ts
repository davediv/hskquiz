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
 * A write is never a blind overwrite: `flush()` reads the key, rescues bytes it cannot decode
 * — or that a merge would drop without a reset to account for them — three-way merges what is
 * there with what this tab holds, and writes the union. Forgetting is a reset *generation*
 * recorded in the payload, never a comparison against the device clock.
 *
 * `status` says where progress is actually going and `rescue` says whether history is sitting
 * in the backup key waiting to be restored; `$lib/progress/StorageNotice.svelte` renders both —
 * that component is imported by path, not from here, so this barrel stays compiler-free for the
 * node test project.
 */

export {
	ProgressStore,
	progress,
	progress as default,
	type ProgressStoreOptions,
	type ProgressSummary,
	type RescueInfo,
	type RescueReason,
	type StorageLike,
	type StorageStatus
} from './progress.svelte.ts';

export {
	BACKUP_KEY,
	EPOCH_FLOOR,
	MASTERY_STREAK,
	PROBE_KEY,
	SCHEMA_VERSION,
	STORAGE_KEY,
	type Generations,
	type StoredLevel,
	type StoredProgress,
	type StoredWord,
	adoptGenerations,
	applyAnswer,
	applyGenerations,
	blankWord,
	bumpGeneration,
	decode,
	decodeStored,
	emptyState,
	emptyStored,
	encode,
	generationFor,
	generationForWord,
	isShippableWordId,
	isUsableWordId,
	levelEntryGen,
	levelOfId,
	mergeProgress,
	ownRecord,
	recordGen,
	recordUnderOwnKey,
	restoreInto,
	snapshot,
	stampGen,
	stampLevelGen,
	tally,
	unexplainedLosses
} from './progress-core.ts';
