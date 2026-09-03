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
  daysInMonth,
  friendlyDate,
  monthLabel,
  startOfMonth,
  today,
  weekdayIndex,
} from '../core/dates';
import { shortcutsFor, WEEKDAY_HEADINGS, type Shortcut } from './date-picker.data';

export interface PickedDate {
  /** Local YYYY-MM-DD. */
  date: string;
  /** Local "HH:MM", or null for no reminder. */
  time: string | null;
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
  templateUrl: './date-picker.html',
})
export class DatePicker {
  readonly date = input.required<string>();
  readonly time = input<string | null>(null);

  /** A new value. The caller holds it; the picker stays open. */
  readonly picked = output<PickedDate>();
  /** Dismissed, by Escape, a click outside or a committed day. */
  readonly closed = output<void>();

  protected readonly todayDate = today();
  protected readonly weekdayHeadings = WEEKDAY_HEADINGS;

  private readonly firstOption = viewChild<ElementRef<HTMLButtonElement>>('option');

  /** Resets to the month of the incoming date whenever the picker is reopened. */
  private readonly viewMonth = linkedSignal(() => startOfMonth(this.date()));

  protected readonly label = computed(() => monthLabel(this.viewMonth()));
  protected readonly atFirstMonth = computed(
    () => this.viewMonth() <= startOfMonth(this.todayDate),
  );

  protected readonly shortcuts = computed<Shortcut[]>(() => shortcutsFor(this.todayDate));

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
