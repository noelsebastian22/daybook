import {
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  OnInit,
} from '@angular/core';
import { TaskStore } from '../../core/task.store';
import { ENERGY_FILTERS } from './today.data';
import { Composer } from './composer';
import { type CaptureSubmit } from './capture';
import { TaskRow } from './task-row';
import { EmptyState } from '../../shared/empty-state';
import { withViewTransition } from '../../core/view-transition';
import { Nav } from '../../core/nav';
import { addDays, friendlyDate, today } from '../../core/dates';
import type { Task } from '../../core/models';

@Component({
  selector: 'app-today',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Composer, TaskRow, EmptyState],
  templateUrl: './today.html',
})
export class Today implements OnInit {
  protected readonly tasks = inject(TaskStore);
  private readonly appRef = inject(ApplicationRef);
  private readonly nav = inject(Nav);

  /**
   * Owned by `Nav`, because the drawer's Add task button opens it from a page
   * this component is not mounted on yet.
   */
  protected readonly open = this.nav.composerOpen;

  /** Open by default so a completing row is seen travelling into it. */
  protected readonly doneOpen = signal(true);

  protected readonly heading =
    friendlyDate(today()) +
    ', ' +
    new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long' });

  protected readonly filters = ENERGY_FILTERS;

  ngOnInit(): void {
    // Rollover runs here, on app open, using the client's local date.
    void this.tasks.ensureLoaded();
  }

  protected label = friendlyDate;

  protected close(): void {
    this.open.set(false);
  }

  protected add(submit: CaptureSubmit): void {
    this.close();
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
