import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
  OnInit,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TaskStore } from '../../core/task.store';
import { Capture, type CaptureSeed, type CaptureSubmit } from './capture';
import { toCaptureText } from '../../core/parse-capture';
import {
  addDays,
  friendlyDate,
  friendlyTime,
  sentenceDate,
  weekdayAndDate,
} from '../../core/dates';

/**
 * Task as object: the row expanded into a card at its own route.
 *
 * A route rather than a piece of local state, so the back button and a
 * deep link both work. The list is *unmounted* while this is on screen
 * because `view-transition-name: task-{id}` has to be unique across the live
 * DOM — hiding the list instead would leave two elements claiming the same
 * name and the transition silently does nothing.
 *
 * This is also the only screen with a delete, and the first place a typo can
 * be fixed at all.
 */
@Component({
  selector: 'app-task-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Capture, RouterLink],
  host: {
    '(document:keydown.escape)': 'onEscape()',
  },
  templateUrl: './task-detail.html',
})
export class TaskDetail implements OnInit {
  /** From the router, via withComponentInputBinding(). */
  readonly id = input.required<string>();

  protected readonly tasks = inject(TaskStore);
  private readonly router = inject(Router);

  protected readonly editing = signal(false);

  protected readonly task = computed(() => this.tasks.taskById().get(this.id()) ?? null);
  protected readonly done = computed(() => !!this.task()?.completed_at);

  protected readonly category = computed(() => {
    const id = this.task()?.category_id;
    return id ? (this.tasks.categoryById().get(id) ?? null) : null;
  });

  protected readonly day = computed(() => {
    const t = this.task();
    return t ? friendlyDate(t.scheduled_date) : '';
  });

  protected readonly written = computed(() => {
    const t = this.task();
    return t ? sentenceDate(t.created_date) : '';
  });

  protected readonly tomorrow = computed(() => {
    const t = this.task();
    return t ? addDays(t.scheduled_date, 1) : '';
  });

  protected readonly pushLabel = computed(() => {
    const target = this.tomorrow();
    const friendly = friendlyDate(target);
    return friendly === 'Tomorrow' ? friendly : weekdayAndDate(target);
  });

  /** The task's own tokens, spelled back out so the edit box shows its chips. */
  protected readonly seed = computed<CaptureSeed | null>(() => {
    const t = this.task();
    if (!t) return null;
    return {
      text: toCaptureText(t.text, this.category()?.slug ?? null, t.energy),
      scheduling: { scheduled_date: t.scheduled_date, reminder_at: t.reminder_at },
    };
  });

  protected time = friendlyTime;

  ngOnInit(): void {
    // A deep link can land here without Today ever having mounted.
    void this.tasks.ensureLoaded();
  }

  protected save(submit: CaptureSubmit): void {
    const t = this.task();
    if (!t) return;
    this.editing.set(false);
    void this.tasks.editFromCapture(t, submit.text, submit.scheduling);
  }

  /**
   * Deleting leaves for the list rather than sitting on a card whose task no
   * longer exists. The Undo lives in the toast, which outlives the route.
   */
  protected remove(): void {
    const t = this.task();
    if (!t) return;
    void this.router.navigate(['/today']);
    void this.tasks.removeWithUndo(t);
  }

  protected onEscape(): void {
    // While editing, Capture handles its own Escape and stops there.
    if (this.editing()) return;
    void this.router.navigate(['/today']);
  }
}
