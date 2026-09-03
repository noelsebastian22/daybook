/**
 * The drawer's four destinations.
 *
 * Calendar is a top-level destination rather than a tab inside Reporting: it
 * is a way of *finding* a day, not a statistic about one. Settings and Sign
 * out are not here — they live in the drawer's footer, below the rule, and
 * are markup rather than data because there are two of them and they do
 * different kinds of thing.
 */

/**
 * The paths this list is allowed to point at. Narrowed to a union rather than
 * left as `string` so a typo or a route that no longer exists is a compile
 * error here. These must match the child routes of the shell in
 * `app/app.routes.ts`; that file cannot be imported for them, because it is
 * what lazy-loads the shell and the cycle would be real.
 */
export type NavPath = '/today' | '/upcoming' | '/calendar' | '/reporting';

export interface NavItem {
  path: NavPath;
  label: string;
  /** Single SVG path, 24-box. Kept inline: four icons is not a dependency. */
  icon: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { path: '/today', label: 'Today', icon: 'M5 5h14v14H5zM5 9h14M9 13h6' },
  { path: '/upcoming', label: 'Upcoming', icon: 'M4 7h16M4 12h10M4 17h6M16 15l2.5 2.5L22 14' },
  {
    path: '/calendar',
    label: 'Calendar',
    icon: 'M5 6h14v13H5zM5 10h14M8 4v3M16 4v3M9 14h1M13 14h1M9 17h1M13 17h1',
  },
  { path: '/reporting', label: 'Reporting', icon: 'M5 19V9M10 19V5M15 19v-6M20 19v-9' },
];
