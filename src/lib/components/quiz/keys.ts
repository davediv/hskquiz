/**
 * Desktop keyboard shortcuts for the quiz, as one pure function.
 *
 * The screen is built for a thumb, but on a laptop reaching for the trackpad ten times a
 * session is the slowest part of practising. `1`–`4` answer, the arrows move the highlight,
 * and once an answer is in, anything that means "go on" advances.
 *
 * Kept out of the component so the precedence rules — never steal a key from a focused
 * control, never fire while typing — are readable in one place.
 */

export type QuizAction =
	{ type: 'choose'; index: number } | { type: 'move'; delta: number } | { type: 'advance' };

export interface KeyContext {
	/** Whether the current question already has an answer. */
	answered: boolean;
	/** How many choices are on screen, so `5` does nothing on a four-choice card. */
	choices: number;
}

function isEditable(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	if (target.isContentEditable) return true;
	const tag = target.tagName;
	return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * True when the browser will itself activate whatever has focus. Enter and Space on a
 * focused button are the browser's to handle; claiming them too would advance twice.
 */
function isActivatable(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	return target.closest('button, a[href], summary, [role="button"]') !== null;
}

/** The action a key press means, or `null` if it means nothing here. */
export function readKey(event: KeyboardEvent, context: KeyContext): QuizAction | null {
	// Browser and OS shortcuts keep their keys.
	if (event.metaKey || event.ctrlKey || event.altKey) return null;
	if (event.isComposing || isEditable(event.target)) return null;

	const key = event.key;

	if (!context.answered) {
		if (key.length === 1 && key >= '1' && key <= '9') {
			const index = Number(key) - 1;
			return index < context.choices ? { type: 'choose', index } : null;
		}
		if (key === 'ArrowDown' || key === 'ArrowRight') return { type: 'move', delta: 1 };
		if (key === 'ArrowUp' || key === 'ArrowLeft') return { type: 'move', delta: -1 };
		return null;
	}

	// Answered: the only move left is forward.
	if (key === 'Enter' || key === ' ' || key === 'Spacebar') {
		return isActivatable(event.target) ? null : { type: 'advance' };
	}
	if (key === 'ArrowRight' || key === 'ArrowDown' || key === 'n' || key === 'N') {
		return { type: 'advance' };
	}
	return null;
}
