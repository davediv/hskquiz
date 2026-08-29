/**
 * The end-of-session screen, loaded as its own chunk.
 *
 * `SessionSummary` is only ever needed once, after the tenth answer, and it is the one part of
 * the quiz route that is not on the critical path to the first question — so it is imported
 * dynamically and warmed the moment a run starts, which puts it in cache several minutes before
 * anyone can reach it. The quiz never blocks on it.
 *
 * A run must also never dead-end. If the chunk cannot be fetched at all — offline mid-session,
 * a deploy that rotated the asset hashes under a long-lived tab — the caller falls back to a
 * plain results panel rather than leaving the learner on a finished session with nothing on it.
 */

import type { Component } from 'svelte';
import type { Session } from '$lib/types';

/** The contract `$lib/components/summary/SessionSummary.svelte` is written to. */
export interface SummaryProps {
	session: Session;
	onRestart: () => void;
	onHome: () => void;
}

export type SummaryComponent = Component<SummaryProps>;

let cached: SummaryComponent | null = null;

/** Resolves the summary component, or `null` if its chunk could not be fetched. */
export async function loadSummary(): Promise<SummaryComponent | null> {
	if (cached) return cached;
	try {
		const module = await import('$lib/components/summary/SessionSummary.svelte');
		cached = module.default as unknown as SummaryComponent;
		return cached;
	} catch {
		return null;
	}
}

/**
 * A believable finished run for `?state=summary`.
 *
 * Seeded, so the preview is the same screen every time it is opened and a screenshot of it is
 * comparable across builds. Seven right and three wrong — enough of each that the summary has
 * to render both, and not so lopsided that it only ever gets designed for one outcome.
 */
export const DEMO_SEED = 20_260_829;
export const DEMO_MISSES: readonly number[] = [2, 5, 8];

export function seedDemoAnswers(session: Session): Session {
	const missed = new Set(DEMO_MISSES);
	session.answers = session.questions.map((question, i) =>
		missed.has(i)
			? (question.choices.find((choice) => choice.id !== question.word.id) ?? null)
			: question.word
	);
	session.index = session.questions.length;
	return session;
}

/** Narrow a URL query to the demo flag, so the route and the loader agree on the spelling. */
export function isSummaryPreview(url: URL): boolean {
	return url.searchParams.get('state') === 'summary';
}
