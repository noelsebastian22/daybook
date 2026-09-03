import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TaskStore } from '../../core/task.store';
import {
  addDays,
  addMonths,
  daysInMonth,
  friendlyDate,
  monthLabel,
  startOfMonth,
  today,
  weekdayIndex,
} from '../../core/dates';
import { HEAT, WEEKDAY_HEADINGS } from './calendar.constants';

interface Cell {
  date: string;
  day: number;
  past: boolean;
  isToday: boolean;
  /** Past: tasks finished that day. Future: tasks still scheduled for it. */
  count: number;
  /** Past only. Something rolled off this day without being done. */
  carried: number;
  /** Past only. No row in day_snapshots — the app was never opened that day. */
  unrecorded: boolean;
}

/**
 * The bidirectional calendar. One grid, with today as the boundary: behind it
 * a completion heat map read from `day_snapshots`, ahead of it a count of what
 * is scheduled.
 *
 * The two halves answer different questions — "how did that go" and "how full
 * is that" — and putting them in one grid is the whole idea. Two separate
 * views would make the comparison impossible.
 *
 * A past day with no snapshot row is not a day with nothing done. It is a day
 * the app was never opened, and it renders as a hairline rather than an empty
 * cell so the difference is visible.
 */
@Component({
  selector: 'app-calendar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './calendar.html',
})
export class Calendar {
  private readonly tasks = inject(TaskStore);

  protected readonly startOfThisMonth = startOfMonth(today());
  protected readonly weekdayHeadings = WEEKDAY_HEADINGS;
  protected readonly heatSteps = HEAT.slice(1);

  protected readonly month = signal(this.startOfThisMonth);
  protected readonly label = computed(() => monthLabel(this.month()));

  private readonly todayDate = today();

  constructor() {
    // Paging out of the window TaskStore opens with has to fetch, and the
    // month on screen is the only thing that decides what is needed.
    effect(() => {
      const first = this.month();
      const last = addDays(first, daysInMonth(first) - 1);
      void this.tasks.loadSnapshots(first, last);
      void this.tasks.loadRange(first, last);
    });
    void this.tasks.ensureLoaded();
  }

  protected readonly cells = computed<Array<Cell | null>>(() => {
    const first = this.month();
    const snapshots = this.tasks.snapshotByDate();
    const scheduled = this.tasks.openCountByDate();
    const blanks: Array<Cell | null> = Array(weekdayIndex(first)).fill(null);

    const days = Array.from({ length: daysInMonth(first) }, (_, i): Cell => {
      const date = addDays(first, i);
      const past = date < this.todayDate;
      const snapshot = snapshots.get(date);

      return {
        date,
        day: i + 1,
        past,
        isToday: date === this.todayDate,
        count: past ? (snapshot?.completed_count ?? 0) : (scheduled.get(date) ?? 0),
        carried: past ? (snapshot?.carried_count ?? 0) : 0,
        unrecorded: past && !snapshot,
      };
    });

    return [...blanks, ...days];
  });

  protected step(n: number): void {
    this.month.set(addMonths(this.month(), n));
  }

  protected heat(cell: Cell): string {
    return HEAT[Math.min(cell.count, HEAT.length - 1)];
  }

  protected cellClass(cell: Cell): string {
    if (cell.isToday) return 'text-brand-700 ring-2 ring-brand-500';
    if (cell.past) return 'text-ink-600';
    return 'text-ink-900';
  }

  protected describe(cell: Cell): string {
    const day = friendlyDate(cell.date);
    if (cell.unrecorded) return `${day}, app not opened`;
    if (cell.past) {
      const done = `${cell.count} done`;
      return cell.carried > 0 ? `${day}, ${done}, ${cell.carried} carried off` : `${day}, ${done}`;
    }
    return cell.count > 0 ? `${day}, ${cell.count} scheduled` : `${day}, nothing scheduled`;
  }
}
