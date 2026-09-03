/**
 * Tuning values for the calendar grid and its heat map.
 *
 * The heat map is read off `day_snapshots.completed_count`: index 0 is a day
 * with nothing finished, and the scale saturates at index 4. A past day with
 * no snapshot row at all is *not* a zero — it is a day the app was never
 * opened — and it renders as a hairline instead of a tinted cell. That
 * distinction is the reason `Cell.unrecorded` exists separately from a count
 * of zero, and it must survive any change to these numbers.
 *
 * Green is the reserved completion colour (AGENTS.md), and completions are
 * exactly what this scale measures, which is what entitles it to green.
 */

/** Green steps for the heat map. Four is enough to read; more is noise. */
export const HEAT = [
  'transparent',
  'rgba(16,185,129,0.16)',
  'rgba(16,185,129,0.34)',
  'rgba(16,185,129,0.55)',
  'rgba(16,185,129,0.78)',
];

/**
 * Monday-first, one letter each, because the grid cell is square and a
 * three-letter heading forces it wider than the date it sits above.
 * `weekdayIndex()` in `core/dates` is Monday-first to match.
 */
export const WEEKDAY_HEADINGS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
