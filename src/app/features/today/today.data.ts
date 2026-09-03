import type { Energy } from '../../core/models';
import type { EnergyFilter } from '../../core/task.store';

/**
 * Static tables for the Today surfaces: the two energies, the filter chips
 * across the top of the list, and the colour each energy is painted in.
 */

/** The energies, in the order the capture popover lists them. */
export const ENERGY_OPTIONS: Energy[] = ['quick', 'deep'];

/** The energy filter chips. `all` is first because it is the resting state. */
export const ENERGY_FILTERS: Array<{ value: EnergyFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'quick', label: 'Quick' },
  { value: 'deep', label: 'Deep' },
];

/**
 * Quick and deep have their own scales and must not share one. The capture
 * mirror used to paint both amber, which put an amber `!deep` token beside a
 * purple deep chip in the same row.
 */
export const ENERGY_TONE: Record<Energy, string> = {
  quick: 'bg-quick-100 text-quick-700',
  deep: 'bg-deep-100 text-deep-700',
};
