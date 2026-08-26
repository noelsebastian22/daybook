import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TaskStore } from '../../core/task.store';
import { addDays, friendlyDate, shortWeekday, today } from '../../core/dates';
import type { Task } from '../../core/models';

interface Bar {
  date: string;
  weekday: string;
  count: number;
  /** No snapshot row: the app was not opened. Not the same as a zero. */
  unrecorded: boolean;
  /** Percent of the tallest bar, so the chart scales to its own data. */
  height: number;
}

const TREND_DAYS = 14;
const LIST_SIZE = 5;

/**
 * Reporting: the weekly review.
 *
 * Three questions, in the order they are worth asking — how much am I
 * finishing, what do I keep carrying, and what do I keep pushing. The last two
 * are the reason `carried_over_count` and `reschedule_count` are separate
 * columns (BUILD-PLAN §5 feature 10); one is the app moving a task and the
 * other is Noel moving it, and they mean very different things.
 *
 * The chart is one series, so it carries no legend — the heading names it.
 * Green is the reserved completion colour and this is completions, which is
 * the one chart in the app allowed to use it.
 */
@Component({
  selector: 'app-reporting',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="mx-auto min-h-dvh max-w-2xl px-4 pb-24">
      <header class="safe-top py-6">
        <p class="text-caption font-medium uppercase tracking-wider text-ink-400">Reporting</p>
        <h1 class="mt-0.5 text-display font-semibold tracking-tight">The last fortnight</h1>
      </header>

      <!-- headline -->
      <div class="grid grid-cols-2 gap-3">
        <div class="rounded-panel bg-white p-4 shadow-sm ring-1 ring-ink-200/60">
          <p class="text-caption text-ink-400">Done this week</p>
          <p class="mt-1 text-display-lg font-semibold tabular-nums tracking-tight text-done-700">
            {{ thisWeek() }}
          </p>
          <p class="mt-1 text-caption text-ink-400">
            @if (lastWeek() === 0) {
              nothing recorded last week
            } @else {
              {{ deltaLabel() }} vs {{ lastWeek() }} last week
            }
          </p>
        </div>

        <div class="rounded-panel bg-white p-4 shadow-sm ring-1 ring-ink-200/60">
          <p class="text-caption text-ink-400">Open right now</p>
          <p class="mt-1 text-display-lg font-semibold tabular-nums tracking-tight">
            {{ tasks.openCount() }}
          </p>
          <p class="mt-1 text-caption text-ink-400">on today</p>
        </div>
      </div>

      <!-- completion trend -->
      <section class="mt-4 rounded-panel bg-white p-4 shadow-sm ring-1 ring-ink-200/60">
        <h2 class="text-body font-semibold tracking-tight">Tasks completed per day</h2>

        <div class="mt-4 flex h-32 items-end gap-[2px]">
          @for (bar of bars(); track bar.date) {
            <div
              class="group relative flex h-full flex-1 items-end"
              (mouseenter)="hovered.set(bar)"
              (mouseleave)="hovered.set(null)"
            >
              @if (bar.unrecorded) {
                <!-- a hairline, so "not opened" cannot be misread as a zero -->
                <div class="h-px w-full rounded-full bg-ink-200" aria-hidden="true"></div>
              } @else {
                <div
                  class="w-full rounded-t bg-done-500 transition-opacity"
                  [class.opacity-100]="hovered() === bar || hovered() === null"
                  [class.opacity-40]="hovered() !== null && hovered() !== bar"
                  [style.height.%]="bar.height"
                  [style.min-height.px]="bar.count > 0 ? 3 : 0"
                ></div>
              }
            </div>
          }
        </div>

        <div class="mt-1.5 flex gap-[2px] text-center text-caption text-ink-400">
          @for (bar of bars(); track bar.date) {
            <!-- every other label, so a fortnight of them does not collide -->
            <span class="flex-1">{{ $even ? bar.weekday : '' }}</span>
          }
        </div>

        <p class="mt-3 h-4 text-caption text-ink-400" aria-live="polite">
          @if (hovered(); as bar) {
            {{ label(bar.date) }} —
            @if (bar.unrecorded) {
              app not opened
            } @else {
              {{ bar.count }} done
            }
          }
        </p>

        <!-- the same numbers, for anyone the bars do not serve -->
        <details class="mt-2">
          <summary class="cursor-pointer text-caption text-ink-400 transition hover:text-ink-600">
            Show the numbers
          </summary>
          <table class="mt-2 w-full text-left text-caption">
            <thead class="text-ink-400">
              <tr>
                <th scope="col" class="py-1 font-medium">Day</th>
                <th scope="col" class="py-1 text-right font-medium">Completed</th>
              </tr>
            </thead>
            <tbody>
              @for (bar of bars(); track bar.date) {
                <tr class="border-t border-ink-100">
                  <th scope="row" class="py-1 font-normal">{{ label(bar.date) }}</th>
                  <td class="py-1 text-right tabular-nums">
                    {{ bar.unrecorded ? '—' : bar.count }}
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </details>
      </section>

      <!-- what keeps moving -->
      <section class="mt-4 rounded-panel bg-white p-4 shadow-sm ring-1 ring-ink-200/60">
        <h2 class="text-body font-semibold tracking-tight">Carried over most</h2>
        <p class="mt-0.5 text-caption text-ink-400">The app moved these. You did not.</p>

        @if (mostCarried().length > 0) {
          <ul class="mt-3 space-y-1">
            @for (task of mostCarried(); track task.id) {
              <li class="flex items-baseline gap-3">
                <a
                  [routerLink]="['/today', task.id]"
                  class="min-w-0 flex-1 truncate text-body text-ink-900 transition hover:text-brand-700"
                  >{{ task.text }}</a
                >
                <span
                  class="shrink-0 rounded-full px-2 py-0.5 text-caption font-medium tabular-nums"
                  [class]="
                    task.carried_over_count >= 3
                      ? 'bg-late-100 text-late-700'
                      : 'bg-ink-100 text-ink-600'
                  "
                  >&times;{{ task.carried_over_count }}</span
                >
              </li>
            }
          </ul>
        } @else {
          <p class="mt-3 text-body text-ink-400">Nothing has rolled over. Rare and good.</p>
        }
      </section>

      <section class="mt-4 rounded-panel bg-white p-4 shadow-sm ring-1 ring-ink-200/60">
        <h2 class="text-body font-semibold tracking-tight">Pushed most</h2>
        <p class="mt-0.5 text-caption text-ink-400">These you moved by hand.</p>

        @if (mostPushed().length > 0) {
          <ul class="mt-3 space-y-1">
            @for (task of mostPushed(); track task.id) {
              <li class="flex items-baseline gap-3">
                <a
                  [routerLink]="['/today', task.id]"
                  class="min-w-0 flex-1 truncate text-body text-ink-900 transition hover:text-brand-700"
                  >{{ task.text }}</a
                >
                <span
                  class="shrink-0 rounded-full bg-ink-100 px-2 py-0.5 text-caption font-medium tabular-nums text-ink-600"
                  >&times;{{ task.reschedule_count }}</span
                >
              </li>
            }
          </ul>
        } @else {
          <p class="mt-3 text-body text-ink-400">Nothing pushed by hand yet.</p>
        }
      </section>
    </div>
  `,
})
export class Reporting {
  protected readonly tasks = inject(TaskStore);

  protected readonly hovered = signal<Bar | null>(null);

  private readonly start = addDays(today(), -(TREND_DAYS - 1));

  constructor() {
    void this.tasks.ensureLoaded();
    void this.tasks.loadSnapshots(this.start, today());
  }

  protected readonly bars = computed<Bar[]>(() => {
    const snapshots = this.tasks.snapshotByDate();
    const completedToday = this.tasks.completedCount();
    const t = today();

    const raw = Array.from({ length: TREND_DAYS }, (_, i) => {
      const date = addDays(this.start, i);
      const snapshot = snapshots.get(date);
      // Today has no snapshot yet — the row is only written when the next
      // rollover runs — so the live count stands in for it.
      const count = date === t ? completedToday : (snapshot?.completed_count ?? 0);
      return { date, count, unrecorded: date !== t && !snapshot };
    });

    const tallest = Math.max(1, ...raw.map((d) => d.count));

    return raw.map((d) => ({
      ...d,
      weekday: shortWeekday(d.date),
      height: (d.count / tallest) * 100,
    }));
  });

  protected readonly thisWeek = computed(() =>
    this.bars()
      .slice(TREND_DAYS - 7)
      .reduce((sum, b) => sum + b.count, 0),
  );

  protected readonly lastWeek = computed(() =>
    this.bars()
      .slice(0, TREND_DAYS - 7)
      .reduce((sum, b) => sum + b.count, 0),
  );

  protected readonly deltaLabel = computed(() => {
    const delta = this.thisWeek() - this.lastWeek();
    if (delta === 0) return 'level';
    return `${delta > 0 ? '+' : ''}${delta}`;
  });

  /** Open tasks only: a finished task's history is no longer a warning. */
  private readonly openTasks = computed(() => this.tasks.tasks().filter((t) => !t.completed_at));

  protected readonly mostCarried = computed(() => this.top('carried_over_count'));
  protected readonly mostPushed = computed(() => this.top('reschedule_count'));

  private top(field: 'carried_over_count' | 'reschedule_count'): Task[] {
    return this.openTasks()
      .filter((t) => t[field] > 0)
      .sort((a, b) => b[field] - a[field])
      .slice(0, LIST_SIZE);
  }

  protected label = friendlyDate;
}
