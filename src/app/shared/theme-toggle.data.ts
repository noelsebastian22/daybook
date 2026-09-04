import type { ThemeChoice } from '../core/theme';

/**
 * The three themes, in the order the popover lists them.
 *
 * Light first, dark second, system last: the two explicit answers read as a
 * pair, and "system" is the deferral that sits under them. It is also the
 * default, and putting the default at the bottom keeps the list from
 * reordering itself in the reader's head.
 */
export interface ThemeOption {
  value: ThemeChoice;
  label: string;
  /** Single SVG path, 24-box, stroked. Three icons is not a dependency. */
  icon: string;
}

export const THEME_OPTIONS: readonly ThemeOption[] = [
  {
    value: 'light',
    label: 'Light',
    icon: 'M12 4V2.5M12 21.5V20M20 12h1.5M2.5 12H4M17.7 17.7l1 1M5.3 5.3l1 1M17.7 6.3l1-1M5.3 18.7l1-1M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z',
  },
  {
    value: 'dark',
    label: 'Dark',
    icon: 'M20 14.5A8.2 8.2 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z',
  },
  {
    value: 'system',
    label: 'System',
    icon: 'M4 5.5h16v10H4zM9 20h6M12 15.5V20',
  },
];
