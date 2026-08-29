/**
 * What the bar's back chevron should actually do.
 *
 * THE BUG THIS EXISTS TO FIX
 * The chevron used to be a plain `<a href="/">`. Tapping it *pushed* level select onto the
 * history stack, so `/` → `/browse/1` → `/quiz/1` → chevron left four entries deep, and one
 * iOS edge-swipe from there dropped the learner back into the run they had just walked away
 * from. On a phone the swipe is the back gesture; an arrow that disagrees with it is an arrow
 * that lies.
 *
 * So the chevron pops. It goes exactly where the system gesture goes, the stack never grows,
 * and the label is read off the entry it will actually land on rather than asserting "levels"
 * and being wrong two screens out of three.
 *
 * The `<a href>` stays: it is what a middle click, a right click and a no-JS load need, and it
 * is the honest fallback when there is nothing behind us (a shared link, a cold deep link) —
 * except that case replaces rather than pushes, so a deep-linked quiz does not leave itself
 * sitting behind level select either.
 */

import { afterNavigate } from '$app/navigation';
import { readRoute } from './route';

export interface BackTarget {
	/** True when an in-app entry sits behind this one, so the chevron can pop to it. */
	readonly canPop: boolean;
	/** Where popping would land, phrased for `aria-label` — "levels", "HSK 3 vocabulary". */
	readonly label: string;
}

/**
 * Track the in-app entries behind the current one.
 *
 * Must be called during component initialisation: `afterNavigate` is a lifecycle hook.
 */
export function createBackTarget(base = ''): BackTarget {
	/**
	 * Pathnames of the entries behind the current one, oldest first. Pathname rather than the
	 * whole href because that is all `label` reads, and because holding a live `URL` here would
	 * be a mutable built-in inside reactive state.
	 */
	const trail = $state<string[]>([]);

	afterNavigate((nav) => {
		// Compare whole hrefs — `/quiz/1` → `/quiz/1?state=summary` is a real entry — but keep
		// only the pathname, which is all `label` reads.
		const from = nav.from?.url.pathname;
		const sameEntry = nav.from?.url.href === nav.to?.url.href;

		if (nav.type === 'popstate') {
			// `delta` is negative going back, positive going forward through the stack. It is
			// typed as present only on this branch, so read it defensively rather than leaning
			// on narrowing through SvelteKit's intersected union.
			const steps = typeof nav.delta === 'number' ? nav.delta : -1;
			if (steps < 0) trail.splice(Math.max(0, trail.length + steps), -steps);
			else if (from !== undefined) trail.push(from);
			return;
		}

		// 'enter' is the cold load — nothing of ours is behind it. Everything else that
		// changes the URL pushed an entry.
		if (nav.type === 'enter' || from === undefined || sameEntry) return;
		trail.push(from);
	});

	return {
		get canPop() {
			return trail.length > 0;
		},
		get label() {
			const previous = trail.at(-1);
			if (previous === undefined) return 'levels';
			const heading = readRoute(previous, base).heading;
			return heading === '' ? 'levels' : heading;
		}
	};
}
