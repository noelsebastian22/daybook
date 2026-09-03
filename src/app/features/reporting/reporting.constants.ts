/** Tuning values for the reporting charts and lists. */

/** How many days the trend chart covers. A fortnight is two weeks to compare. */
export const TREND_DAYS = 14;

/** One week, used to split {@link TREND_DAYS} into this week and last week. */
export const WEEK_DAYS = 7;

/** How many rows the "carried over most" and "pushed most" lists show. */
export const LIST_SIZE = 5;

/**
 * Floor on a bar's height, in px. A day with one completion against a tallest
 * of forty rounds to nothing, and a bar that is not there reads as a day that
 * was not recorded — which the hairline already means. Three pixels is enough
 * to say "some" without pretending to be a measurable quantity.
 */
export const MIN_BAR_PX = 3;

/**
 * At this many carry-overs the count stops being neutral and turns red. Red
 * is reserved for badly avoided (AGENTS.md), and a task the app has moved
 * three times is exactly that.
 */
export const CARRIED_ALARM_COUNT = 3;
