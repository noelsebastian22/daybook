import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { Category, Task } from '../../core/models';
import { friendlyTime } from '../../core/dates';

@Component({
  selector: 'app-task-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    // Phase 3 uses this for the task-as-object expansion. It must be unique
    // across the live DOM, so the list has to unmount, not hide.
    '[style.view-transition-name]': '"task-" + task().id',
  },
  template: `
    <div
      class="group flex items-start gap-3 rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-ink-200/60 transition"
      [class.opacity-60]="done()"
    >
      <button
        type="button"
        class="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 transition"
        [class]="done() ? 'border-done-500 bg-done-500 text-white' : 'border-ink-200 hover:border-brand-500'"
        [attr.aria-pressed]="done()"
        [attr.aria-label]="done() ? 'Mark as not done' : 'Mark as done'"
        (click)="toggled.emit()"
      >
        @if (done()) {
          <svg viewBox="0 0 20 20" fill="currentColor" class="h-3.5 w-3.5">
            <path
              fill-rule="evenodd"
              d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z"
              clip-rule="evenodd"
            />
          </svg>
        }
      </button>

      <div class="min-w-0 flex-1">
        <p class="text-[15px] leading-snug" [class]="done() ? 'text-ink-400 line-through' : 'text-ink-900'">
          {{ task().text }}
        </p>

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
              [class]="e === 'quick' ? 'bg-quick-100 text-quick-700' : 'bg-deep-100 text-deep-700'"
            >
              {{ e }}
            </span>
          }
          @if (task().carried_over_count > 0 && !done()) {
            <span
              class="rounded-full px-2 py-0.5 font-medium"
              [class]="task().carried_over_count >= 3 ? 'bg-late-100 text-late-700' : 'bg-ink-100 text-ink-600'"
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
          class="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-ink-400 opacity-0 transition hover:bg-ink-50 hover:text-ink-600 focus:opacity-100 group-hover:opacity-100"
          (click)="pushed.emit()"
        >
          Tomorrow
        </button>
      }
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

  protected time = friendlyTime;
}
