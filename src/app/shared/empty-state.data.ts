/**
 * Geometry for the empty-state illustrations.
 *
 * The drawings themselves stay in `empty-state.html`, where SVG is markup and
 * can be read as a picture. Only the numbers a `@for` walks live here — a
 * scene expressed as an array of rect specs would be neither a drawing nor
 * data, and the hand-drawn intent (BUILD-PLAN §9) would not survive it.
 */

/** Baselines for the three ticked rows in the `clear` scene. */
export const CLEAR_ROWS = [52, 72, 92];
