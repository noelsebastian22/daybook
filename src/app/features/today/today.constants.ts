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
