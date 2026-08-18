import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { TaskStore, type EnergyFilter } from '../../core/task.store';
import { SessionStore } from '../../core/session.store';
import { Capture, type CaptureSubmit } from './capture';
import { TaskRow } from './task-row';
import { addDays, friendlyDate, today } from '../../core/dates';
import type { Task } from '../../core/models';

@Component({
  selector: 'app-today',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Capture, TaskRow],
  template: `
    <div class="mx-auto min-h-dvh max-w-2xl px-4 pb-24">
      <header class="safe-top flex items-start justify-between gap-4 py-6">
        <div>
          <p class="text-xs font-medium uppercase tracking-wider text-ink-400">
            {{ heading }}
          </p>
          <h1 class="mt-0.5 text-2xl font-semibold tracking-tight">
            @if (tasks.openCount() === 0 && tasks.completedCount() > 0) {
              All clear
            } @else if (tasks.openCount() === 0) {
              Nothing yet
            } @else {
              {{ tasks.openCount() }} to go
            }
          </h1>
          @if (tasks.completedCount() > 0) {
            <p class="mt-1 text-sm text-done-700">
              {{ tasks.completedCount() }} done today
            </p>
          }
        </div>

        <button
          type="button"
          class="rounded-lg px-3 py-1.5 text-sm font-medium text-ink-400 transition hover:bg-ink-100 hover:text-ink-600"
          (click)="session.signOut()"
        >
          Sign out
        </button>
      </header>

      <app-capture (submitted)="add($event)" />

      <!-- energy filter -->
      <div class="mt-4 flex gap-2">
        @for (f of filters; track f.value) {
          <button
            type="button"
            class="rounded-full px-3 py-1.5 text-sm font-medium transition"
            [class]="
              tasks.filter() === f.value
                ? 'bg-ink-900 text-white'
                : 'bg-white text-ink-600 ring-1 ring-ink-200 hover:bg-ink-50'
            "
            (click)="tasks.setFilter(f.value)"
          >
            {{ f.label }}
          </button>
        }
      </div>

      <!-- list -->
      <div class="mt-4 space-y-2">
        @for (task of tasks.visibleTasks(); track task.id) {
          <app-task-row
            [task]="task"
            [categories]="tasks.categoryById()"
            (toggled)="tasks.toggleComplete(task)"
            (pushed)="pushOneDay(task)"
          />
        } @empty {
          <div class="rounded-2xl border-2 border-dashed border-ink-200 px-6 py-12 text-center">
            <p class="text-4xl" aria-hidden="true">&#9748;</p>
            <p class="mt-3 font-medium text-ink-600">
              @if (tasks.filter() !== 'all') {
                Nothing tagged {{ tasks.filter() }} today.
              } @else if (tasks.completedCount() > 0) {
                All clear for today.
              } @else {
                Write the first thing down.
              }
            </p>
          </div>
        }
      </div>

      <!-- upcoming strip, collapsed by default -->
      @if (tasks.upcomingCount() > 0) {
        <div class="mt-8">
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-ink-600 transition hover:bg-ink-100"
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
            <span class="rounded-full bg-ink-200 px-2 py-0.5 text-xs">
              {{ tasks.upcomingCount() }}
            </span>
          </button>

          @if (tasks.upcomingOpen()) {
            <div class="mt-2 space-y-4">
              @for (day of tasks.upcoming(); track day.date) {
                <div>
                  <p class="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-ink-400">
                    {{ label(day.date) }}
                  </p>
                  <div class="space-y-2">
                    @for (task of day.tasks; track task.id) {
                      <app-task-row
                        [task]="task"
                        [categories]="tasks.categoryById()"
                        (toggled)="tasks.toggleComplete(task)"
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
  `,
})
export class Today implements OnInit {
  protected readonly tasks = inject(TaskStore);
  protected readonly session = inject(SessionStore);

  protected readonly heading = friendlyDate(today()) + ', ' + new Date().toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
  });

  protected readonly filters: Array<{ value: EnergyFilter; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'quick', label: 'Quick' },
    { value: 'deep', label: 'Deep' },
  ];

  ngOnInit(): void {
    // Rollover runs here, on app open, using the client's local date.
    void this.tasks.init();
  }

  protected label = friendlyDate;

  protected add(submit: CaptureSubmit): void {
    void this.tasks.addFromCapture(submit.text, submit.scheduling);
  }

  protected pushOneDay(task: Task): void {
    void this.tasks.reschedule(task, addDays(task.scheduled_date, 1));
  }
}
