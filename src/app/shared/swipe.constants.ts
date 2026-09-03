/**
 * How far a row has to travel before the action commits, in px.
 *
 * **These four numbers are unvalidated.** BUILD-PLAN blocks swipe on Todoist
 * iOS captures that were never taken, and they are what would settle the
 * feel — how far Todoist makes you drag, whether it fires on release or on
 * crossing, how much it resists. Until those exist these are reasoned
 * defaults, not measured ones, and they are gathered here rather than
 * scattered through the code so replacing them is a one-place edit.
 *
 * Noel judged them acceptable by use on 25 Aug. That is not a measurement,
 * and it does not close the question above.
 */
export const COMMIT_PX = 96;
/** Horizontal intent: past this, the gesture is a swipe and not a scroll. */
export const ENGAGE_PX = 12;
/** Past the commit point the row keeps moving, but at a fifth of the speed. */
export const RESISTANCE = 0.2;
export const SNAP_BACK_MS = 180;
