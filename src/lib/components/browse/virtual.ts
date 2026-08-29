/**
 * Windowing maths for the vocabulary list.
 *
 * HSK 5 is 1,070 words. Rendering all of them is roughly 11,000 DOM nodes, which a phone
 * pays for on every scroll frame, so only the rows near the viewport exist at any moment and
 * the rest is a single element of the right height holding the scrollbar open.
 *
 * The list scrolls with the page rather than inside its own scroller — a nested scroller on
 * iOS costs you the collapsing address bar, breaks the sticky header above it, and turns
 * momentum scrolling into two competing surfaces. So the input here is the window's scroll
 * position plus where the list starts in the document, and everything is derived from that.
 *
 * Kept pure and separate from the component so the arithmetic can be reasoned about on its
 * own: every value below is a function of the six numbers in `VirtualInput`.
 */

export interface VirtualInput {
	/** Items in the (already filtered) list. */
	count: number;
	/** Items per row. 1 on a phone, 2 once the column is wide enough. */
	cols: number;
	/** Measured height of one row, in px. */
	rowHeight: number;
	/** Document-space offset of the list's top edge. */
	listTop: number;
	/** `window.scrollY`. */
	scrollTop: number;
	/** `window.innerHeight`. */
	viewportHeight: number;
	/** Extra rows rendered above and below, so a fast flick does not show blank space. */
	overscanRows?: number;
}

export interface VirtualWindow {
	/** First item to render. */
	startIndex: number;
	/** One past the last item to render. */
	endIndex: number;
	/** Where the rendered block sits inside the full-height spacer. */
	offsetTop: number;
	/** Height of the spacer: the list as if every row existed. */
	totalHeight: number;
	/** Total rows, rendered or not. */
	rowCount: number;
}

const DEFAULT_OVERSCAN = 3;

function clamp(value: number, min: number, max: number): number {
	return value < min ? min : value > max ? max : value;
}

/** The slice of the list worth having in the DOM right now. */
export function windowFor(input: VirtualInput): VirtualWindow {
	const cols = Math.max(1, Math.floor(input.cols) || 1);
	const rowHeight = input.rowHeight > 0 ? input.rowHeight : 1;
	const count = Math.max(0, Math.floor(input.count) || 0);
	const overscan = Math.max(0, input.overscanRows ?? DEFAULT_OVERSCAN);

	const rowCount = Math.ceil(count / cols);
	const totalHeight = rowCount * rowHeight;

	if (rowCount === 0) {
		return { startIndex: 0, endIndex: 0, offsetTop: 0, totalHeight: 0, rowCount: 0 };
	}

	// How far the viewport's top edge has travelled into the list. Negative until it reaches it.
	const scrolledInto = input.scrollTop - input.listTop;
	const firstRow = Math.floor(scrolledInto / rowHeight);
	const visibleRows = Math.ceil(Math.max(0, input.viewportHeight) / rowHeight) + 1;

	const startRow = clamp(firstRow - overscan, 0, Math.max(0, rowCount - 1));
	const endRow = clamp(startRow + visibleRows + overscan * 2, startRow + 1, rowCount);

	return {
		startIndex: startRow * cols,
		endIndex: Math.min(count, endRow * cols),
		offsetTop: startRow * rowHeight,
		totalHeight,
		rowCount
	};
}

/**
 * How far the page must scroll for row `index` to sit clear of the sticky header.
 *
 * Returns the current scroll position unchanged when the row is already fully visible, so a
 * caller can compare and skip the scroll entirely.
 */
export function scrollToShow(
	index: number,
	input: Pick<VirtualInput, 'cols' | 'rowHeight' | 'listTop' | 'scrollTop' | 'viewportHeight'>,
	topInset: number
): number {
	const cols = Math.max(1, Math.floor(input.cols) || 1);
	const rowTop = input.listTop + Math.floor(index / cols) * input.rowHeight;
	const rowBottom = rowTop + input.rowHeight;

	const visibleTop = input.scrollTop + topInset;
	const visibleBottom = input.scrollTop + input.viewportHeight;

	if (rowTop < visibleTop) return Math.max(0, rowTop - topInset);
	if (rowBottom > visibleBottom) return Math.max(0, rowBottom - input.viewportHeight);
	return input.scrollTop;
}
