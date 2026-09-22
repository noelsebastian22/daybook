import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

import type { Category } from '../../core/models';
import type { EnergyFilter } from '../../core/task.store';
import { Popover } from '../../shared/popover';
import { CATEGORY_SEARCH_THRESHOLD } from './today.constants';
import { ENERGY_FILTERS } from './today.data';

/**
 * The whole filter UI for Today, in one control that costs no vertical space
 * until it is used.
 *
 * It replaced two rows of chips — three energies above however many
 * categories the day happened to contain. That bar was permanent rent for an
 * occasional tool: a day with one task and five categories spent three rows
 * on the filter and one on the work. Worse, its answer to more categories was
 * to wrap and grow downward, so the problem arrived on exactly the days the
 * list was already long.
 *
 * The lens holds no filter state. `energy` and `categoryId` come in, choices
 * go out, and `TaskStore` stays the only place a filter lives — which is why
 * this file has no store import and the specs need no fake one.
 *
 * Two things here are deliberate and look like oversights:
 *
 * - **The trigger says "Filter" in words.** An icon alone would trade the
 *   clunkiness of six chips for a guessing game, and the resting state is the
 *   one a first-time eye lands on.
 * - **Choosing does not close the panel.** Energy and category are
 *   independent axes that AND together, so closing on the first pick would
 *   make combining them a two-visit job. The backdrop, Escape and the trigger
 *   all dismiss it, and the list is visible under the panel while it is open,
 *   so a pick is seen landing.
 */
@Component({
  selector: 'app-filter-lens',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Popover],
  templateUrl: './filter-lens.html',
})
export class FilterLens {
  readonly energy = input.required<EnergyFilter>();
  readonly categoryId = input.required<string | null>();
  readonly categories = input.required<Category[]>();

  readonly energyChange = output<EnergyFilter>();
  readonly categoryChange = output<string | null>();
  readonly cleared = output<void>();

  protected readonly open = signal(false);
  protected readonly query = signal('');

  protected readonly energies = ENERGY_FILTERS;

  /** Past the threshold a flat list stops working. See `today.constants.ts`. */
  protected readonly searchable = computed(
    () => this.categories().length > CATEGORY_SEARCH_THRESHOLD,
  );

  protected readonly shown = computed(() => {
    const wanted = this.query().trim().toLowerCase();
    if (!wanted) return this.categories();
    return this.categories().filter((c) => c.name.toLowerCase().includes(wanted));
  });

  protected readonly activeCategory = computed(() => {
    const id = this.categoryId();
    return id === null ? null : (this.categories().find((c) => c.id === id) ?? null);
  });

  /** Null when the energy filter is resting, so the trigger can say nothing. */
  protected readonly energyLabel = computed(() => {
    const current = this.energy();
    if (current === 'all') return null;
    return ENERGY_FILTERS.find((f) => f.value === current)?.label ?? null;
  });

  protected readonly filtering = computed(
    () => this.energy() !== 'all' || this.categoryId() !== null,
  );

  /**
   * Null at rest, where the button's visible word already names it. While
   * filtering the visible text is the state — "Deep · Work" — which read out
   * on its own is a button whose purpose has to be guessed, so the label
   * names the job and keeps the visible words inside it (WCAG 2.5.3).
   */
  protected readonly triggerLabel = computed(() => {
    const parts = [this.energyLabel(), this.activeCategory()?.name].filter((p): p is string => !!p);
    return parts.length ? `Filtering by ${parts.join(', ')}` : null;
  });

  /**
   * Each visit starts with the search cleared. A query left over from last
   * time would hide categories the panel claims to be listing, and the
   * evidence for why they are missing is one keystroke wide.
   */
  protected toggle(): void {
    const next = !this.open();
    this.open.set(next);
    if (next) this.query.set('');
  }

  protected chooseEnergy(value: EnergyFilter): void {
    this.energyChange.emit(value);
  }

  /** Pressing the category already filtering clears it, so it needs no "All". */
  protected chooseCategory(id: string): void {
    this.categoryChange.emit(this.categoryId() === id ? null : id);
  }

  protected search(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected clear(): void {
    this.cleared.emit();
  }
}
