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
  templateUrl: './day-detail.html',
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
