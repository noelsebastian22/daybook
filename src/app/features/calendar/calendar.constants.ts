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

/**
 * Green steps for the heat map. Four is enough to read; more is noise.
 *
 * The steps themselves are per-theme and live in `src/styles.css` as
 * `--heat-1`..`--heat-4`, because a ramp tuned against white does not
 * survive the move to a near-black page — its low steps vanish into the
 * background entirely, and its top step leaves the day number sitting on it
 * at 3.3:1. Only the reference is here; the values are a theme decision and
 * belong beside the other theme decisions.
 *
 * Step 0 stays `transparent` in both themes and stays here, because it is
 * not a colour: a day whose snapshot says zero is a real record of nothing
 * done and it should read as the page it sits on.
 */
export const HEAT = [
  'transparent',
  'var(--heat-1)',
  'var(--heat-2)',
  'var(--heat-3)',
  'var(--heat-4)',
];

/**
 * Monday-first, one letter each, because the grid cell is square and a
 * three-letter heading forces it wider than the date it sits above.
 * `weekdayIndex()` in `core/dates` is Monday-first to match.
 */
export const WEEKDAY_HEADINGS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
