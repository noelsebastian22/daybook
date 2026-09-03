import {
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  OnInit,
} from '@angular/core';
import { TaskStore } from '../../core/task.store';
import { TaskRow } from '../today/task-row';
import { Composer } from '../today/composer';
import { type CaptureSubmit } from '../today/capture';
import { withViewTransition } from '../../core/view-transition';
import { addDays, friendlyDate, today, weekdayAndDate } from '../../core/dates';
import type { Task } from '../../core/models';
import { DAYS_PER_PAGE, MAX_WEEK } from './upcoming.constants';

interface DayGroup {
  date: string;
  tasks: Task[];
}

/**
 * Upcoming: the week ahead as a list grouped by day, with a per-day
 * `+ Add task` row.
 *
 * That row is the point of the page. Scheduling by *position* — pressing add
 * under Thursday — is a different act from typing "thursday" into capture, and
 * it is the one that suits a week you are looking at rather than a thought you
 * just had.
 *
 * Paging stops at {@link MAX_WEEK} because `TaskStore` only loads a month
 * ahead. Going further would show empty days that are not actually empty.
 */
@Component({
  selector: 'app-upcoming',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TaskRow, Composer],
  templateUrl: './upcoming.html',
})
export class Upcoming implements OnInit {
  protected readonly tasks = inject(TaskStore);
  private readonly appRef = inject(ApplicationRef);

  protected readonly maxWeek = MAX_WEEK;
  protected readonly week = signal(0);

  /** The day the composer is scheduling for. Null means it is closed. */
  protected readonly addingOn = signal<string | null>(null);

  /** Week 0 starts tomorrow. Today has its own page and is not repeated here. */
  private readonly start = computed(() => addDays(today(), 1 + this.week() * DAYS_PER_PAGE));

  protected readonly days = computed<DayGroup[]>(() => {
    const start = this.start();
    const all = this.tasks.tasks();

    return Array.from({ length: DAYS_PER_PAGE }, (_, i) => {
      const date = addDays(start, i);
      return {
        date,
        // Completed tasks are dropped: this page is what is still coming, and
        // something finished early would otherwise sit here looking pending.
        tasks: all
          .filter((t) => t.scheduled_date === date && !t.completed_at)
          .sort((a, b) => a.created_at.localeCompare(b.created_at)),
      };
    });
  });

  protected readonly range = computed(() => {
    const start = this.start();
    const end = addDays(start, DAYS_PER_PAGE - 1);
    return this.week() === 0 ? 'Next 7 days' : `${weekdayAndDate(start)} – ${weekdayAndDate(end)}`;
  });

  ngOnInit(): void {
    void this.tasks.ensureLoaded();
  }

  protected label = friendlyDate;
  protected full = weekdayAndDate;

  protected add(submit: CaptureSubmit): void {
    this.addingOn.set(null);
    void this.tasks.addFromCapture(submit.text, submit.scheduling);
  }

  protected complete(task: Task): void {
    withViewTransition(this.appRef, () => void this.tasks.toggleComplete(task));
  }

  protected pushOneDay(task: Task): void {
    withViewTransition(this.appRef, () => {
      void this.tasks.reschedule(task, addDays(task.scheduled_date, 1));
    });
  }
}
