import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  linkedSignal,
  output,
  viewChild,
} from '@angular/core';
import {
  addDays,
  addMonths,
  comingMonday,
  comingSaturday,
  daysInMonth,
  friendlyDate,
  monthLabel,
  shortWeekday,
  startOfMonth,
  today,
  weekdayAndDate,
  weekdayIndex,
} from '../core/dates';

export interface PickedDate {
  /** Local YYYY-MM-DD. */
  date: string;
  /** Local "HH:MM", or null for no reminder. */
  time: string | null;
}

interface Shortcut {
  label: string;
  date: string;
  /** The resolved day, printed beside the label so the choice can be checked. */
  hint: string;
}

/**
 * The date picker: a shortcut row over a month grid, plus a time field that
 * writes `reminder_at`.
 *
 * Deliberately missing, per BUILD-PLAN §9: **no "No Date"** — `scheduled_date`
 * is `not null` and the someday bucket is out of scope, so the control would
 * have to fail — and **no "Repeat"**, which has no column and no phase.
 *
 * One picker serves capture, edit and reschedule-from-a-row, so it owns no
 * state beyond which month is on screen. The chosen value lives with whoever
 * opened it.
 */
@Component({
  selector: 'app-date-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'closed.emit()',
  },
  template: `
    <!-- click-outside target; sits under the panel -->
    <button
      type="button"
      class="fixed inset-0 z-40 cursor-default"
      tabindex="-1"
      aria-label="Close the date picker"
      (click)="closed.emit()"
    ></button>

    <div
      class="relative z-50 w-72 rounded-panel bg-white p-2 shadow-lg ring-1 ring-ink-200"
      role="dialog"
      aria-label="Choose a date"
    >
      <!-- shortcuts -->
      <div class="flex flex-col">
        @for (s of shortcuts(); track s.date; let first = $first) {
          <button
            #option
            type="button"
            class="flex items-center justify-between rounded-control px-3 py-2 text-left text-sm transition hover:bg-ink-50"
            [class]="s.date === date() ? 'font-semibold text-brand-700' : 'text-ink-900'"
            [attr.aria-label]="s.label + ', ' + full(s.date)"
            (click)="choose(s.date)"
          >
            <span>{{ s.label }}</span>
            <span class="text-xs text-ink-400">{{ s.hint }}</span>
          </button>
        }
      </div>

      <!-- month grid -->
      <div class="mt-1 border-t border-ink-100 pt-2">
        <div class="flex items-center justify-between px-2 pb-1">
          <p class="text-sm font-semibold">{{ label() }}</p>
          <div class="flex items-center gap-1">
            <button
              type="button"
              class="grid h-7 w-7 place-items-center rounded-control text-ink-400 transition hover:bg-ink-100 hover:text-ink-600 disabled:opacity-30 disabled:hover:bg-transparent"
              [disabled]="atFirstMonth()"
              aria-label="Previous month"
              (click)="stepMonth(-1)"
            >
              <span aria-hidden="true">&lsaquo;</span>
            </button>
            <button
              type="button"
              class="grid h-7 w-7 place-items-center rounded-control text-ink-400 transition hover:bg-ink-100 hover:text-ink-600"
              aria-label="Next month"
              (click)="stepMonth(1)"
            >
              <span aria-hidden="true">&rsaquo;</span>
            </button>
          </div>
        </div>

        <div class="grid grid-cols-7 gap-0.5 px-1 pb-1 text-center text-[11px] font-medium text-ink-400">
          @for (d of weekdayHeadings; track $index) {
            <span aria-hidden="true">{{ d }}</span>
          }
        </div>

        <div class="grid grid-cols-7 gap-0.5 px-1">
          @for (cell of cells(); track $index) {
            @if (cell) {
              <button
                type="button"
                class="grid h-8 place-items-center rounded-control text-sm transition disabled:text-ink-200 disabled:hover:bg-transparent"
                [class]="dayClass(cell)"
                [disabled]="cell < todayDate"
                [attr.aria-label]="full(cell)"
                [attr.aria-pressed]="cell === date()"
                (click)="choose(cell)"
              >
                {{ +cell.slice(8) }}
              </button>
            } @else {
              <span></span>
            }
          }
        </div>
      </div>

      <!-- reminder time -->
      <div class="mt-1 flex items-center gap-2 border-t border-ink-100 px-2 pt-2">
        <span class="text-xs text-ink-400" aria-hidden="true">&#9200;</span>
        <input
          type="time"
          class="min-w-0 flex-1 rounded-control bg-ink-50 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-500"
          [value]="time() ?? ''"
          aria-label="Reminder time"
          (change)="onTime($event)"
        />
        @if (time()) {
          <button
            type="button"
            class="grid h-7 w-7 place-items-center rounded-control text-ink-400 transition hover:bg-ink-100 hover:text-ink-600"
            aria-label="Clear the reminder time"
            (click)="picked.emit({ date: date(), time: null })"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        }
      </div>
    </div>
  `,
})
export class DatePicker {
  readonly date = input.required<string>();
  readonly time = input<string | null>(null);

  /** A new value. The caller holds it; the picker stays open. */
  readonly picked = output<PickedDate>();
  /** Dismissed, by Escape, a click outside or a committed day. */
  readonly closed = output<void>();

  protected readonly todayDate = today();
  protected readonly weekdayHeadings = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  private readonly firstOption = viewChild<ElementRef<HTMLButtonElement>>('option');

  /** Resets to the month of the incoming date whenever the picker is reopened. */
  private readonly viewMonth = linkedSignal(() => startOfMonth(this.date()));

  protected readonly label = computed(() => monthLabel(this.viewMonth()));
  protected readonly atFirstMonth = computed(
    () => this.viewMonth() <= startOfMonth(this.todayDate),
  );

  protected readonly shortcuts = computed<Shortcut[]>(() => {
    const t = this.todayDate;
    const all: Shortcut[] = [
      { label: 'Today', date: t, hint: shortWeekday(t) },
      { label: 'Tomorrow', date: addDays(t, 1), hint: shortWeekday(addDays(t, 1)) },
      { label: 'This weekend', date: comingSaturday(t), hint: shortWeekday(comingSaturday(t)) },
      { label: 'Next week', date: comingMonday(t), hint: weekdayAndDate(comingMonday(t)) },
    ];
    // On a Friday "This weekend" is Tomorrow, and on a weekend it is Today.
    // Two rows landing on the same day is noise, so the earlier one wins.
    const seen = new Set<string>();
    return all.filter((s) => (seen.has(s.date) ? false : (seen.add(s.date), true)));
  });

  /** Leading blanks then every day of the month, laid out Monday first. */
  protected readonly cells = computed<Array<string | null>>(() => {
    const first = this.viewMonth();
    const blanks: Array<string | null> = Array(weekdayIndex(first)).fill(null);
    const days = Array.from({ length: daysInMonth(first) }, (_, i) => addDays(first, i));
    return [...blanks, ...days];
  });

  constructor() {
    // Opened by a click, so it takes focus like any other dialog.
    afterNextRender(() => this.firstOption()?.nativeElement.focus());
  }

  protected full = friendlyDate;

  protected dayClass(cell: string): string {
    if (cell === this.date()) return 'bg-brand-600 font-semibold text-white';
    if (cell === this.todayDate) return 'font-semibold text-brand-700 hover:bg-brand-50';
    return 'text-ink-900 hover:bg-ink-100';
  }

  protected stepMonth(n: number): void {
    this.viewMonth.set(addMonths(this.viewMonth(), n));
  }

  protected choose(date: string): void {
    this.picked.emit({ date, time: this.time() });
    this.closed.emit();
  }

  protected onTime(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.picked.emit({ date: this.date(), time: value || null });
  }
}
