/**
 * Tuning values for the Today surfaces. Reasoned rather than measured — each
 * one carries the reasoning that produced it, so the next person changing it
 * knows what it costs to be wrong.
 */

/**
 * The tallest layer is the date picker: shortcut rows, a month grid and the
 * time field. Sized generously — being wrong costs an upward panel where a
 * downward one would have fitted, which is merely unusual, while the other
 * way round puts the control off-screen.
 */
export const CAPTURE_LAYER_HEIGHT = 380;

/**
 * Everything that can hold focus. `[tabindex]` is filtered by value at the
 * call site rather than by selector, because the scrim and the popover
 * backdrop are both real buttons parked at -1.
 */
export const FOCUSABLE = 'a[href],button,input,textarea,select,[tabindex]';

/**
 * Above this many categories the filter panel stops laying them out flat and
 * grows a search field instead.
 *
 * Six is arithmetic rather than taste. A category chip is `px-3` at
 * `text-body` with a 6px dot and `gap-2` between chips, so a short name like
 * "Work" is about 71px wide plus its gap. The panel is `w-72` — 288px, less
 * its padding — which fits three per row on the narrowest phone. Six is two
 * tidy rows; seven starts a third and the panel begins to dominate the page
 * it is filtering. That is the point where a list stops being the right
 * control and a search field starts being one.
 */
export const CATEGORY_SEARCH_THRESHOLD = 6;
