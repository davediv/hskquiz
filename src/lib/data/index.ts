/// <reference types="vite/client" />
/**
 * The shipped vocabulary, one lazily-loaded chunk per HSK level.
 *
 * `hsk{1..5}.json` are generated — never hand-edit them. `node scripts/build-vocab.mjs`
 * rebuilds them from `reference/hsk/`, and `--verify` audits the checked-in files against
 * the official list word for word.
 */
import type { Level, Word } from '$lib/types';
import { LEVELS } from '$lib/types';

/**
 * `import.meta.glob` gives Vite one dynamic import per file, so each level becomes its
 * own chunk and opening the app pulls down none of them. It also keeps 4,308 entries of
 * JSON out of the TypeScript program, which a direct `import './hsk1.json'` would not.
 */
const chunks = import.meta.glob<{ default: Word[] }>('./hsk*.json');

const cache = new Map<Level, Word[]>();
const inFlight = new Map<Level, Promise<Word[]>>();

/** Every level this app ships, ascending. */
export function allLevels(): Level[] {
	return [...LEVELS];
}

/**
 * The full word list for one level. Resolves from cache after the first call, and
 * concurrent calls for the same level share a single network request.
 */
export function loadLevel(level: Level): Promise<Word[]> {
	const cached = cache.get(level);
	if (cached) return Promise.resolve(cached);

	const pending = inFlight.get(level);
	if (pending) return pending;

	const chunk = chunks[`./hsk${level}.json`];
	if (!chunk) {
		return Promise.reject(new Error(`no word list shipped for HSK level ${level}`));
	}

	const request = chunk()
		.then((module) => {
			const words = module.default;
			cache.set(level, words);
			inFlight.delete(level);
			return words;
		})
		.catch((error: unknown) => {
			inFlight.delete(level);
			throw error;
		});

	inFlight.set(level, request);
	return request;
}

/**
 * Warm a level's chunk without waiting for it — e.g. on hover or focus of a level card,
 * so the quiz opens instantly. Failures are the caller's problem on the real load.
 */
export function preloadLevel(level: Level): void {
	void loadLevel(level).catch(() => {});
}

export { VOCAB_ATTRIBUTION } from './attribution';
