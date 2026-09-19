import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TaskStore } from '../../core/task.store';
import { addDays, friendlyDate, shortWeekday, today } from '../../core/dates';
import type { Task } from '../../core/models';
import {
  CARRIED_ALARM_COUNT,
  LIST_SIZE,
  MIN_BAR_PX,
  MIN_CEILING,
  TREND_DAYS,
  WEEK_DAYS,
} from './reporting.constants';

interface Day {
  date: string;
  weekday: string;
  count: number;
  /** No snapshot row: the app was not opened. Not the same as a zero. */
  unrecorded: boolean;
}

interface Bar extends Day {
  /** Percent of {@link Reporting.ceiling}, which is a round number. */
  height: number;
}

/**
 * Reporting: the weekly review.
 *
 * Three questions, in the order they are worth asking — how much am I
 * finishing, what do I keep carrying, and what do I keep pushing. The last two
 * are the reason `carried_over_count` and `reschedule_count` are separate
 * columns (BUILD-PLAN §5 feature 10); one is the app moving a task and the
 * other is Noel moving it, and they mean very different things.
 *
 * The chart is one series, so it carries no legend — the heading names it.
 * Green is the reserved completion colour and this is completions, which is
 * the one chart in the app allowed to use it.
 */
@Component({
  selector: 'app-reporting',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './reporting.html',
})
export class Reporting {
  protected readonly tasks = inject(TaskStore);

  protected readonly hovered = signal<Bar | null>(null);

  protected readonly minBarPx = MIN_BAR_PX;
  protected readonly carriedAlarmCount = CARRIED_ALARM_COUNT;

  private readonly start = addDays(today(), -(TREND_DAYS - 1));

  constructor() {
    void this.tasks.ensureLoaded();
    void this.tasks.loadSnapshots(this.start, today());
  }

  private readonly days = computed<Day[]>(() => {
    const snapshots = this.tasks.snapshotByDate();
    const completedToday = this.tasks.completedCount();
    const t = today();

    return Array.from({ length: TREND_DAYS }, (_, i) => {
      const date = addDays(this.start, i);
      const snapshot = snapshots.get(date);
      // Today has no snapshot yet — the row is only written when the next
      // rollover runs — so the live count stands in for it.
      const count = date === t ? completedToday : (snapshot?.completed_count ?? 0);
      return { date, weekday: shortWeekday(date), count, unrecorded: date !== t && !snapshot };
    });
  });

  /**
   * The top of the scale, and the number the gridline beside it is labelled
   * with.
   *
   * Heights used to be a fraction of the tallest day, which meant the busiest
   * bar was always flush with the top of the plot — a best-day-of-three drew
   * exactly like a best-day-of-thirty, and the chart silently restretched every
   * time the fortnight's peak moved. Rounding up to a round number instead
   * gives the plot a fixed, labelled scale.
   *
   * Kept even so the midpoint gridline lands on a whole number too. Task counts
   * are integers and a gridline reading 3.5 would be nonsense.
   */
  protected readonly ceiling = computed(() => {
    const tallest = Math.max(0, ...this.days().map((d) => d.count));
    return Math.max(MIN_CEILING, Math.ceil(tallest / 2) * 2);
  });

  protected readonly bars = computed<Bar[]>(() =>
    this.days().map((d) => ({ ...d, height: (d.count / this.ceiling()) * 100 })),
  );

  protected readonly thisWeek = computed(() =>
    this.bars()
      .slice(TREND_DAYS - WEEK_DAYS)
      .reduce((sum, b) => sum + b.count, 0),
  );

  protected readonly lastWeek = computed(() =>
    this.bars()
      .slice(0, TREND_DAYS - WEEK_DAYS)
      .reduce((sum, b) => sum + b.count, 0),
  );

  protected readonly deltaLabel = computed(() => {
    const delta = this.thisWeek() - this.lastWeek();
    if (delta === 0) return 'level';
    return `${delta > 0 ? '+' : ''}${delta}`;
  });

  /** Open tasks only: a finished task's history is no longer a warning. */
  private readonly openTasks = computed(() => this.tasks.tasks().filter((t) => !t.completed_at));

  protected readonly mostCarried = computed(() => this.top('carried_over_count'));
  protected readonly mostPushed = computed(() => this.top('reschedule_count'));

  private top(field: 'carried_over_count' | 'reschedule_count'): Task[] {
    return this.openTasks()
      .filter((t) => t[field] > 0)
      .sort((a, b) => b[field] - a[field])
      .slice(0, LIST_SIZE);
  }

  protected label = friendlyDate;
}
