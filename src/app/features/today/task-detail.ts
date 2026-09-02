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
  template: `
    <div class="mx-auto min-h-dvh max-w-2xl px-4 pb-24">
      <header class="safe-py-6 flex items-center justify-between gap-4">
        <a
          routerLink="/today"
          class="-ml-2 inline-flex items-center gap-1 rounded-control px-2 py-1.5 text-body font-medium text-ink-500 transition hover:bg-ink-100 hover:text-ink-700"
        >
          <span aria-hidden="true">&lsaquo;</span> Today
        </a>
      </header>

      @if (task(); as t) {
        <article
          class="rounded-panel bg-white p-5 shadow-sm ring-1 ring-ink-200/60"
          [style.view-transition-name]="'task-' + t.id"
        >
          @if (editing()) {
            <app-capture
              [seed]="seed()"
              [actions]="true"
              [autoFocus]="true"
              commitLabel="Save"
              (submitted)="save($event)"
              (cancelled)="editing.set(false)"
            />
          } @else {
            <div class="flex items-start gap-3">
              <button
                type="button"
                class="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-control border-2 transition"
                [class]="
                  done()
                    ? 'border-done-500 bg-done-500 text-white'
                    : 'border-ink-200 hover:border-brand-500'
                "
                [attr.aria-pressed]="done()"
                [attr.aria-label]="done() ? 'Mark as not done' : 'Mark as done'"
                (click)="tasks.toggleComplete(t)"
              >
                @if (done()) {
                  <svg viewBox="0 0 20 20" fill="currentColor" class="tick h-4 w-4">
                    <path
                      fill-rule="evenodd"
                      d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z"
                      clip-rule="evenodd"
                    />
                  </svg>
                }
              </button>

              <h1 class="min-w-0 flex-1 text-header font-semibold tracking-tight">
                <span
                  class="task-text"
                  [class.is-done]="done()"
                  [class.text-ink-400]="done()"
                  [class.text-ink-900]="!done()"
                >
                  {{ t.text }}
                </span>
              </h1>
            </div>

            <!-- chips -->
            <div class="mt-4 flex flex-wrap items-center gap-1.5 text-caption">
              <span class="rounded-full bg-brand-50 px-2.5 py-1 font-medium text-brand-700">
                {{ day() }}
              </span>

              @if (t.reminder_at; as at) {
                <span class="rounded-full bg-brand-50 px-2.5 py-1 font-medium text-brand-700">
                  {{ time(at) }}
                </span>
              }

              @if (category(); as c) {
                <span
                  class="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2.5 py-1 font-medium text-ink-600"
                >
                  <span class="h-1.5 w-1.5 rounded-full" [style.background]="c.colour"></span>
                  {{ c.name }}
                </span>
              }

              @if (t.energy; as e) {
                <span
                  class="rounded-full px-2.5 py-1 font-medium"
                  [class]="e === 'quick' ? 'bg-quick-100 text-quick-700' : 'bg-deep-100 text-deep-700'"
                >
                  {{ e }}
                </span>
              }

              @if (t.completed_at; as at) {
                <span class="rounded-full bg-done-100 px-2.5 py-1 font-medium text-done-700">
                  done {{ time(at) }}
                </span>
              }
            </div>

            <!-- history: the two counts §5 feature 10 exists to answer -->
            <dl class="mt-5 grid grid-cols-3 gap-3 border-t border-ink-100 pt-4 text-body">
              <div>
                <dt class="text-caption text-ink-400">Written</dt>
                <dd class="mt-0.5 font-medium">{{ written() }}</dd>
              </div>
              <div>
                <dt class="text-caption text-ink-400">Carried over</dt>
                <dd
                  class="mt-0.5 font-medium"
                  [class]="t.carried_over_count >= 3 ? 'text-late-700' : 'text-ink-900'"
                >
                  {{ t.carried_over_count }}&times;
                </dd>
              </div>
              <div>
                <dt class="text-caption text-ink-400">Pushed</dt>
                <dd class="mt-0.5 font-medium">{{ t.reschedule_count }}&times;</dd>
              </div>
            </dl>

            <!-- actions -->
            <div class="mt-5 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-4">
              <button
                type="button"
                class="rounded-control bg-ink-100 px-3 py-1.5 text-body font-medium text-ink-700 transition hover:bg-ink-200"
                (click)="editing.set(true)"
              >
                Edit
              </button>

              @if (!done()) {
                <button
                  type="button"
                  class="rounded-control px-3 py-1.5 text-body font-medium text-ink-500 transition hover:bg-ink-100 hover:text-ink-700"
                  (click)="tasks.reschedule(t, tomorrow())"
                >
                  <span aria-hidden="true">&rarr;</span> {{ pushLabel() }}
                </button>
              }

              <button
                type="button"
                class="ml-auto rounded-control px-3 py-1.5 text-body font-medium text-late-700 transition hover:bg-late-100"
                (click)="remove()"
              >
                Delete
              </button>
            </div>
          }
        </article>
      } @else if (tasks.loaded()) {
        <div class="rounded-panel border-2 border-dashed border-ink-200 px-6 py-12 text-center">
          <p class="font-medium text-ink-600">That task is gone.</p>
          <a routerLink="/today" class="mt-2 inline-block text-body font-medium text-brand-700">
            Back to today
          </a>
        </div>
      } @else {
        <div class="h-24 animate-pulse rounded-panel bg-ink-100"></div>
      }
    </div>
  `,
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
