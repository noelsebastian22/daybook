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
 * ink-400 is 4.74:1 against the ink-50 the row now sits on and 5.08:1 against
 * the white it lifts to on hover, so it clears AA either way.
 *
 * The row is flat: no card, no ring, no shadow, one hairline underneath.
 * Its background still has to be **opaque**, though, and has to match the
 * page — it is the lid over the swipe action layer, and the "Done" and
 * "Tomorrow" labels behind it would otherwise be legible through every row
 * at rest. That is why hover lifts to white rather than dimming to ink-100:
 * white is opaque, and it raises the done row's contrast instead of lowering
 * it.
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
  templateUrl: './task-row.html',
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
