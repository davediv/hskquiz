import { LEVELS, type Level } from '$lib/types';

/** A level in a URL must have its one canonical spelling. */
export function parseLevelSegment(segment: string | null | undefined): Level | null {
	return LEVELS.find((level) => segment === String(level)) ?? null;
}
