import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Swipe, type SwipeDirection } from '../../shared/swipe';
import type { Category, Task } from '../../core/models';
import { addDays, friendlyDate, friendlyTime, shortWeekday } from '../../core/dates';

/**
 * A completed row is **not** faded with `opacity`. It used to carry
 * `opacity-60`, which took the whole row down with it: the text fell to
 * 2.38:1, the done timestamp to 3.75:1 and the energy badge to 3.24:1, all
 * under WCAG AA, and no colour choice inside the row could recover it because
 * the wrapper was washing out the badge backgrounds too.
 *
 * The fade was never one of the four beats of the completion choreography
 * anyway (`styles.css`): the box fills, the tick pops, the strike draws and
 * the row re-sorts. Those still do all the work — a struck-through line in
 * ink-400 on a white card is 5.08:1 and still plainly reads as finished.
 */
@Component({
  selector: 'app-task-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Swipe],
  host: {
    // Phase 3 uses this for the task-as-object expansion. It must be unique
    // across the live DOM, so the list has to unmount, not hide.
    '[style.view-transition-name]': '"task-" + task().id',
  },
  template: `
    <div class="relative overflow-hidden rounded-xl">
      <!--
        The action revealed under the row. Which side shows follows the
        direction of travel: a row moving right uncovers its left edge.
        Green is the reserved completion colour and this completes. The
        reschedule side is brand, not red — pushing a task on purpose is not
        the same as one going badly, and red would say it was.

        Not rendered at all on a finished row, because there is no gesture
        left to label: the swipe is disabled there. It used to promise
        "Tomorrow" on a completed row and then do nothing, since onSwipe has
        always guarded the push with a not-done check.
      -->
      @if (!done()) {
        <div
          class="pointer-events-none absolute inset-0 flex items-center justify-between px-4 text-sm font-medium"
          aria-hidden="true"
        >
          <span
            class="flex items-center gap-1.5 transition-opacity"
            [class]="swipe.armed() ? 'text-done-700' : 'text-done-500/60'"
            [class.opacity-0]="swipe.offset() <= 0"
          >
            <span aria-hidden="true">&check;</span> Done
          </span>
          <span
            class="flex items-center gap-1.5 transition-opacity"
            [class]="swipe.armed() ? 'text-brand-700' : 'text-brand-500/60'"
            [class.opacity-0]="swipe.offset() >= 0"
          >
            {{ pushLabel() }} <span aria-hidden="true">&rarr;</span>
          </span>
        </div>
      }

      <div
        appSwipe
        #swipe="appSwipe"
        [appSwipeDisabled]="done()"
        (swiped)="onSwipe($event)"
        class="group relative flex items-start gap-3 rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-ink-200/60 transition"
      >
        <button
          type="button"
          class="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 transition"
          [class]="
            done()
              ? 'border-done-500 bg-done-500 text-white'
              : 'border-ink-200 hover:border-brand-500'
          "
          [attr.aria-pressed]="done()"
          [attr.aria-label]="done() ? 'Mark as not done' : 'Mark as done'"
          (click)="toggled.emit()"
        >
          @if (done()) {
            <svg viewBox="0 0 20 20" fill="currentColor" class="tick h-3.5 w-3.5">
              <path
                fill-rule="evenodd"
                d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z"
                clip-rule="evenodd"
              />
            </svg>
          }
        </button>

        <div class="min-w-0 flex-1">
          <!--
          The text is the link, not the whole row: the row already holds two
          buttons, and nesting those inside an anchor is invalid and makes the
          hit targets fight each other.
        -->
          <a
            [routerLink]="['/today', task().id]"
            class="block text-[15px] leading-snug outline-none focus-visible:underline"
          >
            <span
              class="task-text"
              [class.is-done]="done()"
              [class.text-ink-400]="done()"
              [class.text-ink-900]="!done()"
            >
              {{ task().text }}
            </span>
          </a>

          <div class="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
            @if (category(); as c) {
              <span
                class="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2 py-0.5 font-medium text-ink-600"
              >
                <span class="h-1.5 w-1.5 rounded-full" [style.background]="c.colour"></span>
                {{ c.name }}
              </span>
            }
            @if (task().energy; as e) {
              <span
                class="rounded-full px-2 py-0.5 font-medium"
                [class]="
                  e === 'quick' ? 'bg-quick-100 text-quick-700' : 'bg-deep-100 text-deep-700'
                "
              >
                {{ e }}
              </span>
            }
            @if (task().carried_over_count > 0 && !done()) {
              <span
                class="rounded-full px-2 py-0.5 font-medium"
                [class]="
                  task().carried_over_count >= 3
                    ? 'bg-late-100 text-late-700'
                    : 'bg-ink-100 text-ink-600'
                "
                [title]="'Rolled over ' + task().carried_over_count + ' times'"
              >
                carried &times;{{ task().carried_over_count }}
              </span>
            }
            @if (task().completed_at; as at) {
              <span class="font-medium text-done-700">done {{ time(at) }}</span>
            }
          </div>
        </div>

        @if (!done()) {
          <button
            type="button"
            class="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-ink-400 transition hover:bg-ink-50 hover:text-ink-600 group-hover:text-ink-600"
            [attr.aria-label]="'Move to ' + pushTargetDate()"
            (click)="pushed.emit()"
          >
            <span aria-hidden="true">&rarr;</span> {{ pushLabel() }}
          </button>
        }
      </div>
    </div>
  `,
})
export class TaskRow {
  readonly task = input.required<Task>();
  readonly categories = input.required<Map<string, Category>>();

  readonly toggled = output<void>();
  readonly pushed = output<void>();

  protected readonly done = computed(() => !!this.task().completed_at);
  protected readonly category = computed(() => {
    const id = this.task().category_id;
    return id ? (this.categories().get(id) ?? null) : null;
  });

  /**
   * The push button moves a task on by one day from its own scheduled date,
   * not from today. On the Today list that is tomorrow; in the Next 7 days
   * strip it is not, so the button has to name the day it actually lands on.
   */
  protected readonly pushTargetDate = computed(() =>
    friendlyDate(addDays(this.task().scheduled_date, 1)),
  );

  /** "Tomorrow" for a today task, otherwise "Sat" — "Sat 22 Aug" is too wide. */
  protected readonly pushLabel = computed(() => {
    const target = addDays(this.task().scheduled_date, 1);
    const friendly = friendlyDate(target);
    return friendly === 'Tomorrow' ? friendly : shortWeekday(target);
  });

  protected time = friendlyTime;

  /**
   * Both gestures land on outputs the row already had, so a swipe and the
   * button beside it go through exactly the same store call — including the
   * same undo toast.
   *
   * The `done()` guard is now belt and braces: the directive is disabled on a
   * finished row, so nothing fires there at all. It stays because it is the
   * guard that makes the rule true — a completed task pins `scheduled_date`
   * to the day it was finished, and `day-detail` reads that pin to say what
   * that day amounted to. Pushing a done task would rewrite history.
   */
  protected onSwipe(direction: SwipeDirection): void {
    if (direction === 'right') this.toggled.emit();
    else if (!this.done()) this.pushed.emit();
  }
}
