import {
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TaskStore } from '../../core/task.store';
import { TaskRow } from '../today/task-row';
import { Composer } from '../today/composer';
import { type CaptureSubmit } from '../today/capture';
import { EmptyState } from '../../shared/empty-state';
import { withViewTransition } from '../../core/view-transition';
import { addDays, friendlyDate, fromLocalDate, today } from '../../core/dates';
import type { Task } from '../../core/models';

/**
 * One day, drilled into from a calendar cell.
 *
 * A past day is not simply "the tasks whose scheduled_date is that day".
 * Rollover *moves* anything unfinished forward, so the only tasks still
 * carrying a past date are the ones completed on it — which is exactly why
 * `day_snapshots.carried_task_ids` exists. The two lists below are read from
 * different places for that reason, and a past day shows both: what was
 * finished, and what walked away.
 */
@Component({
  selector: 'app-day-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TaskRow, Composer, EmptyState],
  template: `
    <div class="mx-auto min-h-dvh max-w-2xl px-4 pb-28">
      <header class="safe-top py-6">
        <a
          routerLink="/calendar"
          class="-ml-2 inline-flex items-center gap-1 rounded-control px-2 py-1.5 text-sm font-medium text-ink-500 transition hover:bg-ink-100 hover:text-ink-700"
        >
          <span aria-hidden="true">&lsaquo;</span> Calendar
        </a>

        <p class="mt-3 text-xs font-medium uppercase tracking-wider text-ink-400">
          {{ relative() }}
        </p>
        <h1 class="mt-0.5 text-2xl font-semibold tracking-tight">{{ full() }}</h1>

        @if (past()) {
          <p class="mt-1 text-sm text-ink-400">
            @if (snapshot(); as s) {
              {{ s.completed_count }} done, {{ s.carried_count }} carried off
            } @else {
              The app was not opened this day.
            }
          </p>
        }
      </header>

      @if (onDay().length > 0) {
        <section>
          @if (past()) {
            <h2 class="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-ink-400">
              Finished
            </h2>
          }
          <div class="space-y-2">
            @for (task of onDay(); track task.id) {
              <app-task-row
                [task]="task"
                [categories]="tasks.categoryById()"
                (toggled)="complete(task)"
                (pushed)="pushOneDay(task)"
              />
            }
          </div>
        </section>
      }

      @if (carried().length > 0) {
        <section class="mt-6">
          <h2 class="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-ink-400">
            Carried off this day
          </h2>
          <div class="space-y-2">
            @for (task of carried(); track task.id) {
              <div class="rounded-card bg-white px-4 py-3 shadow-sm ring-1 ring-ink-200/60">
                <a
                  [routerLink]="['/today', task.id]"
                  class="text-[15px] leading-snug text-ink-900"
                  >{{ task.text }}</a
                >
                <p class="mt-1 text-[11px] text-ink-400">
                  now on {{ label(task.scheduled_date) }}
                  @if (task.carried_over_count > 0) {
                    · carried &times;{{ task.carried_over_count }}
                  }
                </p>
              </div>
            }
          </div>
        </section>
      }

      @if (missingCarried() > 0) {
        <p class="mt-4 px-1 text-xs text-ink-400">
          {{ missingCarried() }} more carried off this day
          {{ missingCarried() === 1 ? 'has' : 'have' }} since been deleted.
        </p>
      }

      @if (onDay().length === 0 && carried().length === 0) {
        <app-empty-state
          scene="quiet"
          [title]="past() ? 'Nothing recorded for this day.' : 'Nothing scheduled yet.'"
        />
      }

      @if (!past()) {
        <button
          type="button"
          class="mt-4 flex w-full items-center gap-2 rounded-card border border-dashed border-ink-200 px-4 py-2.5 text-left text-sm font-medium text-ink-400 transition hover:border-brand-500 hover:bg-white hover:text-brand-700"
          (click)="composerOpen.set(true)"
        >
          <span aria-hidden="true">+</span> Add task
        </button>
      }
    </div>

    @if (composerOpen()) {
      <app-composer
        [day]="date()"
        (submitted)="add($event)"
        (cancelled)="composerOpen.set(false)"
      />
    }
  `,
})
export class DayDetail {
  /** Local YYYY-MM-DD, from the router. */
  readonly date = input.required<string>();

  protected readonly tasks = inject(TaskStore);
  private readonly appRef = inject(ApplicationRef);

  protected readonly composerOpen = signal(false);

  protected readonly past = computed(() => this.date() < today());
  protected readonly relative = computed(() => friendlyDate(this.date()));
  protected readonly full = computed(() =>
    fromLocalDate(this.date()).toLocaleDateString(undefined, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
  );

  protected readonly snapshot = computed(
    () => this.tasks.snapshotByDate().get(this.date()) ?? null,
  );

  /**
   * Still dated this day. On a past day that means completed on it, because
   * `toggleComplete` pins `scheduled_date` to the day the work was finished.
   */
  protected readonly onDay = computed(() =>
    this.tasks
      .tasks()
      .filter((t) => t.scheduled_date === this.date())
      .sort((a, b) => a.created_at.localeCompare(b.created_at)),
  );

  private readonly carriedIds = computed(() => this.snapshot()?.carried_task_ids ?? []);

  protected readonly carried = computed(() => {
    const byId = this.tasks.taskById();
    return this.carriedIds()
      .map((id) => byId.get(id))
      .filter((t): t is Task => t !== undefined);
  });

  /** Snapshots keep ids of tasks that may since have been deleted. */
  protected readonly missingCarried = computed(
    () => this.carriedIds().length - this.carried().length,
  );

  constructor() {
    effect(() => {
      const date = this.date();
      void this.tasks.loadSnapshots(date, date);
      // A window around the day, so anything carried off it is in hand to
      // name the day it landed on.
      void this.tasks.loadRange(date, addDays(date, 30));
    });
    void this.tasks.ensureLoaded();
  }

  protected label = friendlyDate;

  protected add(submit: CaptureSubmit): void {
    this.composerOpen.set(false);
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
