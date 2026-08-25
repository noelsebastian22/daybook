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

interface DayGroup {
  date: string;
  tasks: Task[];
}

/** How far forward paging goes, in weeks. */
const MAX_WEEK = 3;

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
  template: `
    <div class="mx-auto min-h-dvh max-w-2xl px-4 pb-28">
      <header class="safe-top flex items-center justify-between gap-4 py-6">
        <div>
          <p class="text-xs font-medium uppercase tracking-wider text-ink-400">Upcoming</p>
          <h1 class="mt-0.5 text-2xl font-semibold tracking-tight">{{ range() }}</h1>
        </div>

        <div class="flex items-center gap-1">
          <button
            type="button"
            class="grid h-9 w-9 place-items-center rounded-card text-ink-500 transition hover:bg-ink-100 hover:text-ink-700 disabled:opacity-30 disabled:hover:bg-transparent"
            [disabled]="week() === 0"
            aria-label="Previous week"
            (click)="week.set(week() - 1)"
          >
            <span aria-hidden="true">&lsaquo;</span>
          </button>
          <button
            type="button"
            class="grid h-9 w-9 place-items-center rounded-card text-ink-500 transition hover:bg-ink-100 hover:text-ink-700 disabled:opacity-30 disabled:hover:bg-transparent"
            [disabled]="week() >= maxWeek"
            aria-label="Next week"
            (click)="week.set(week() + 1)"
          >
            <span aria-hidden="true">&rsaquo;</span>
          </button>
        </div>
      </header>

      <div class="space-y-6">
        @for (day of days(); track day.date) {
          <section>
            <div class="mb-2 flex items-baseline gap-2 px-1">
              <h2 class="text-sm font-semibold tracking-tight">{{ label(day.date) }}</h2>
              @if (day.tasks.length > 0) {
                <span class="text-xs text-ink-400">{{ day.tasks.length }}</span>
              }
            </div>

            <div class="space-y-2">
              @for (task of day.tasks; track task.id) {
                <app-task-row
                  [task]="task"
                  [categories]="tasks.categoryById()"
                  (toggled)="complete(task)"
                  (pushed)="pushOneDay(task)"
                />
              }

              <button
                type="button"
                class="flex w-full items-center gap-2 rounded-card border border-dashed border-ink-200 px-4 py-2.5 text-left text-sm font-medium text-ink-400 transition hover:border-brand-500 hover:bg-white hover:text-brand-700"
                [attr.aria-label]="'Add a task on ' + full(day.date)"
                (click)="addingOn.set(day.date)"
              >
                <span aria-hidden="true">+</span> Add task
              </button>
            </div>
          </section>
        }
      </div>
    </div>

    @if (addingOn(); as day) {
      <app-composer [day]="day" (submitted)="add($event)" (cancelled)="addingOn.set(null)" />
    }
  `,
})
export class Upcoming implements OnInit {
  protected readonly tasks = inject(TaskStore);
  private readonly appRef = inject(ApplicationRef);

  protected readonly maxWeek = MAX_WEEK;
  protected readonly week = signal(0);

  /** The day the composer is scheduling for. Null means it is closed. */
  protected readonly addingOn = signal<string | null>(null);

  /** Week 0 starts tomorrow. Today has its own page and is not repeated here. */
  private readonly start = computed(() => addDays(today(), 1 + this.week() * 7));

  protected readonly days = computed<DayGroup[]>(() => {
    const start = this.start();
    const all = this.tasks.tasks();

    return Array.from({ length: 7 }, (_, i) => {
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
    const end = addDays(start, 6);
    return this.week() === 0
      ? 'Next 7 days'
      : `${weekdayAndDate(start)} – ${weekdayAndDate(end)}`;
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
