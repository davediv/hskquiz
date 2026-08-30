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
 * A write is never a blind overwrite: `flush()` reads the key, three-way merges what is there
 * with what this tab holds, and refuses to write anything that would leave less history than
 * the key already holds without copying the bigger side aside first. Forgetting is a reset *generation*
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
	type RestoreReport,
	type StorageLike,
	type StorageStatus
} from './progress.svelte.ts';

export {
	BACKUP_KEY,
	EPOCH_FLOOR,
	MASTERY_STREAK,
	MAX_GENERATION,
	PROBE_KEY,
	SCHEMA_VERSION,
	STORAGE_KEY,
	type Generations,
	type Heft,
	type Restorable,
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
	encodeWeighed,
	generationFor,
	generationForWord,
	hasHistory,
	heavier,
	isShippableWordId,
	isUsableWordId,
	levelEntryGen,
	levelOfId,
	mergeProgress,
	ownRecord,
	readGeneration,
	readRestorable,
	recordGen,
	recordUnderOwnKey,
	restoreInto,
	restoredTotals,
	shrinks,
	snapshot,
	stampGen,
	stampLevelGen,
	tally,
	unexplainedLosses,
	weigh
} from './progress-core.ts';
