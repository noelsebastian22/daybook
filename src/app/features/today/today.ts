import {
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  OnInit,
} from '@angular/core';
import { TaskStore, type EnergyFilter } from '../../core/task.store';
import { Composer } from './composer';
import { type CaptureSubmit } from './capture';
import { TaskRow } from './task-row';
import { EmptyState } from '../../shared/empty-state';
import { withViewTransition } from '../../core/view-transition';
import { addDays, friendlyDate, today } from '../../core/dates';
import type { Task } from '../../core/models';

@Component({
  selector: 'app-today',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Composer, TaskRow, EmptyState],
  template: `
    <div class="mx-auto min-h-dvh max-w-2xl px-4 pb-28">
      <header class="safe-top flex items-start justify-between gap-4 py-6">
        <div>
          <p class="text-caption font-medium uppercase tracking-wider text-ink-400">
            {{ heading }}
          </p>
          <h1 class="mt-1 text-display font-semibold tracking-tight">
            @if (tasks.openCount() === 0 && tasks.completedCount() > 0) {
              All clear
            } @else if (tasks.openCount() === 0) {
              Nothing yet
            } @else {
              {{ tasks.openCount() }} to go
            }
          </h1>
          @if (tasks.completedCount() > 0) {
            <p class="mt-1 text-body text-done-700">{{ tasks.completedCount() }} done today</p>
          }
        </div>

        <button
          type="button"
          class="rounded-card bg-brand-600 px-4 py-2 text-body font-medium text-white shadow-sm transition hover:bg-brand-700"
          (click)="composerOpen.set(true)"
        >
          <span aria-hidden="true">+</span> Add task
        </button>
      </header>

      <!-- energy -->
      <div class="flex flex-wrap gap-2">
        @for (f of filters; track f.value) {
          <button
            type="button"
            class="rounded-full px-3 py-2 text-body font-medium transition"
            [class]="
              tasks.filter() === f.value
                ? 'bg-ink-900 text-white'
                : 'bg-white text-ink-600 ring-1 ring-ink-200 hover:bg-ink-50'
            "
            [attr.aria-pressed]="tasks.filter() === f.value"
            (click)="tasks.setFilter(f.value)"
          >
            {{ f.label }}
          </button>
        }
      </div>

      <!--
        Category chips are a second row, not more pills in the first. They
        answer a different question from energy and the two combine, so
        sitting them side by side would imply picking one.
      -->
      @if (tasks.todaysCategories().length > 0) {
        <div class="mt-2 flex flex-wrap gap-2">
          @for (c of tasks.todaysCategories(); track c.id) {
            <button
              type="button"
              class="inline-flex items-center gap-2 rounded-full px-3 py-2 text-body font-medium transition"
              [class]="
                tasks.categoryFilter() === c.id
                  ? 'bg-ink-900 text-white'
                  : 'bg-white text-ink-600 ring-1 ring-ink-200 hover:bg-ink-50'
              "
              [attr.aria-pressed]="tasks.categoryFilter() === c.id"
              (click)="toggleCategory(c.id)"
            >
              <span class="h-1.5 w-1.5 rounded-full" [style.background]="c.colour"></span>
              {{ c.name }}
            </button>
          }
        </div>
      }

      <!-- what is left -->
      <div class="mt-4 space-y-2">
        @for (task of tasks.openTasks(); track task.id) {
          <app-task-row
            [task]="task"
            [categories]="tasks.categoryById()"
            (toggled)="complete(task)"
            (pushed)="pushOneDay(task)"
          />
        } @empty {
          <!--
            Three different emptinesses, and they do not mean the same thing:
            a filter is hiding work, a finished day is an achievement, and a
            fresh day is an invitation. Each gets its own drawing and its own
            sentence.

            "filtered" only wins when the filter hid *everything*. With work
            left but all of it done, something did match, so the finished day
            is the truer message.
          -->
          @if (tasks.filtered() && tasks.doneTasks().length === 0) {
            <app-empty-state scene="filtered" title="Nothing matches that filter today.">
              <button
                type="button"
                class="rounded-control text-body font-medium text-brand-700 transition hover:text-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                (click)="tasks.clearFilters()"
              >
                Clear filters
              </button>
            </app-empty-state>
          } @else if (tasks.doneTasks().length > 0) {
            <app-empty-state scene="clear" title="All clear for today." />
          } @else {
            <app-empty-state scene="blank" title="Write the first thing down." />
          }
        }
      </div>

      <!--
        Done today. Expanded by default, and deliberately so: completing a row
        unmounts it from the list above and mounts it here, and the fourth beat
        of the choreography is the browser FLIPping it between the two. A
        collapsed section would make the row vanish instead of travel.
      -->
      @if (tasks.doneTasks().length > 0) {
        <div class="mt-8">
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-card px-3 py-2 text-body font-medium text-ink-600 transition hover:bg-ink-100"
            [attr.aria-expanded]="doneOpen()"
            (click)="doneOpen.set(!doneOpen())"
          >
            <span class="transition-transform" [class.rotate-90]="doneOpen()" aria-hidden="true"
              >&rsaquo;</span
            >
            Done today
            <span class="rounded-full bg-done-100 px-2 py-1 text-caption text-done-700">
              {{ tasks.doneTasks().length }}
            </span>
          </button>

          @if (doneOpen()) {
            <div class="mt-2 space-y-2">
              @for (task of tasks.doneTasks(); track task.id) {
                <app-task-row
                  [task]="task"
                  [categories]="tasks.categoryById()"
                  (toggled)="complete(task)"
                  (pushed)="pushOneDay(task)"
                />
              }
            </div>
          }
        </div>
      }

      <!-- upcoming strip, collapsed by default -->
      @if (tasks.upcomingCount() > 0) {
        <div class="mt-8">
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-card px-3 py-2 text-body font-medium text-ink-600 transition hover:bg-ink-100"
            [attr.aria-expanded]="tasks.upcomingOpen()"
            (click)="tasks.toggleUpcoming()"
          >
            <span
              class="transition-transform"
              [class.rotate-90]="tasks.upcomingOpen()"
              aria-hidden="true"
              >&rsaquo;</span
            >
            Next 7 days
            <span class="rounded-full bg-ink-200 px-2 py-1 text-caption">
              {{ tasks.upcomingCount() }}
            </span>
          </button>

          @if (tasks.upcomingOpen()) {
            <div class="mt-2 space-y-4">
              @for (day of tasks.upcoming(); track day.date) {
                <div>
                  <p class="mb-2 px-1 text-caption font-semibold uppercase tracking-wider text-ink-400">
                    {{ label(day.date) }}
                  </p>
                  <div class="space-y-2">
                    @for (task of day.tasks; track task.id) {
                      <app-task-row
                        [task]="task"
                        [categories]="tasks.categoryById()"
                        (toggled)="complete(task)"
                        (pushed)="pushOneDay(task)"
                      />
                    }
                  </div>
                </div>
              }
            </div>
          }
        </div>
      }
    </div>

    @if (composerOpen()) {
      <app-composer (submitted)="add($event)" (cancelled)="composerOpen.set(false)" />
    }
  `,
})
export class Today implements OnInit {
  protected readonly tasks = inject(TaskStore);
  private readonly appRef = inject(ApplicationRef);

  protected readonly composerOpen = signal(false);

  /** Open by default so a completing row is seen travelling into it. */
  protected readonly doneOpen = signal(true);

  protected readonly heading =
    friendlyDate(today()) +
    ', ' +
    new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long' });

  protected readonly filters: Array<{ value: EnergyFilter; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'quick', label: 'Quick' },
    { value: 'deep', label: 'Deep' },
  ];

  ngOnInit(): void {
    // Rollover runs here, on app open, using the client's local date.
    void this.tasks.ensureLoaded();
  }

  protected label = friendlyDate;

  protected add(submit: CaptureSubmit): void {
    this.composerOpen.set(false);
    void this.tasks.addFromCapture(submit.text, submit.scheduling);
  }

  /** Pressing an active chip clears it, so the filter needs no separate "All". */
  protected toggleCategory(id: string): void {
    this.tasks.setCategoryFilter(this.tasks.categoryFilter() === id ? null : id);
  }

  /**
   * Completing re-sorts the task to the bottom of the list. Running that
   * inside a View Transition is the whole of the row-leave choreography: the
   * browser matches every row by its `view-transition-name` and animates the
   * ones that moved, including the gap closing behind this one.
   */
  protected complete(task: Task): void {
    withViewTransition(this.appRef, () => void this.tasks.toggleComplete(task));
  }

  protected pushOneDay(task: Task): void {
    withViewTransition(this.appRef, () => {
      void this.tasks.reschedule(task, addDays(task.scheduled_date, 1));
    });
  }
}
