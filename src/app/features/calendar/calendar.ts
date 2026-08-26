import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TaskStore } from '../../core/task.store';
import {
  addDays,
  addMonths,
  daysInMonth,
  friendlyDate,
  monthLabel,
  startOfMonth,
  today,
  weekdayIndex,
} from '../../core/dates';

interface Cell {
  date: string;
  day: number;
  past: boolean;
  isToday: boolean;
  /** Past: tasks finished that day. Future: tasks still scheduled for it. */
  count: number;
  /** Past only. Something rolled off this day without being done. */
  carried: number;
  /** Past only. No row in day_snapshots — the app was never opened that day. */
  unrecorded: boolean;
}

/** Green steps for the heat map. Four is enough to read; more is noise. */
const HEAT = ['transparent', 'rgba(16,185,129,0.16)', 'rgba(16,185,129,0.34)', 'rgba(16,185,129,0.55)', 'rgba(16,185,129,0.78)'];

/**
 * The bidirectional calendar. One grid, with today as the boundary: behind it
 * a completion heat map read from `day_snapshots`, ahead of it a count of what
 * is scheduled.
 *
 * The two halves answer different questions — "how did that go" and "how full
 * is that" — and putting them in one grid is the whole idea. Two separate
 * views would make the comparison impossible.
 *
 * A past day with no snapshot row is not a day with nothing done. It is a day
 * the app was never opened, and it renders as a hairline rather than an empty
 * cell so the difference is visible.
 */
@Component({
  selector: 'app-calendar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="mx-auto min-h-dvh max-w-2xl px-4 pb-24">
      <header class="safe-top flex items-center justify-between gap-4 py-6">
        <div>
          <p class="text-caption font-medium uppercase tracking-wider text-ink-400">Calendar</p>
          <h1 class="mt-0.5 text-display font-semibold tracking-tight">{{ label() }}</h1>
        </div>

        <div class="flex items-center gap-1">
          <button
            type="button"
            class="grid h-9 w-9 place-items-center rounded-card text-ink-500 transition hover:bg-ink-100 hover:text-ink-700"
            aria-label="Previous month"
            (click)="step(-1)"
          >
            <span aria-hidden="true">&lsaquo;</span>
          </button>
          <button
            type="button"
            class="rounded-card px-3 py-1.5 text-body font-medium text-ink-500 transition hover:bg-ink-100 hover:text-ink-700"
            (click)="month.set(startOfThisMonth)"
          >
            Today
          </button>
          <button
            type="button"
            class="grid h-9 w-9 place-items-center rounded-card text-ink-500 transition hover:bg-ink-100 hover:text-ink-700"
            aria-label="Next month"
            (click)="step(1)"
          >
            <span aria-hidden="true">&rsaquo;</span>
          </button>
        </div>
      </header>

      <div class="rounded-panel bg-white p-3 shadow-sm ring-1 ring-ink-200/60">
        <div class="grid grid-cols-7 gap-1 pb-1 text-center text-caption font-medium text-ink-400">
          @for (d of weekdayHeadings; track $index) {
            <span aria-hidden="true">{{ d }}</span>
          }
        </div>

        <div class="grid grid-cols-7 gap-1">
          @for (cell of cells(); track $index) {
            @if (cell) {
              <a
                [routerLink]="['/calendar', cell.date]"
                class="relative grid aspect-square place-items-center rounded-control text-body transition hover:ring-2 hover:ring-brand-500"
                [style.background]="cell.past ? heat(cell) : null"
                [class]="cellClass(cell)"
                [attr.aria-label]="describe(cell)"
              >
                <span [class.font-semibold]="cell.isToday">{{ cell.day }}</span>

                @if (!cell.past && cell.count > 0) {
                  <span
                    class="absolute bottom-1 text-caption font-medium tabular-nums text-ink-400"
                    >{{ cell.count }}</span
                  >
                }

                <!-- red is reserved for badly avoided, which is exactly this -->
                @if (cell.carried > 0) {
                  <span
                    class="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-late-500"
                    aria-hidden="true"
                  ></span>
                }

                @if (cell.unrecorded) {
                  <span
                    class="absolute inset-x-3 bottom-1.5 h-px bg-ink-200"
                    aria-hidden="true"
                  ></span>
                }
              </a>
            } @else {
              <span></span>
            }
          }
        </div>
      </div>

      <!-- legend -->
      <div class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 px-1 text-caption text-ink-400">
        <span class="inline-flex items-center gap-1.5">
          Done
          @for (step of heatSteps; track $index) {
            <span
              class="h-3 w-3 rounded-sm ring-1 ring-ink-200/70"
              [style.background]="step"
              aria-hidden="true"
            ></span>
          }
          more
        </span>
        <span class="inline-flex items-center gap-1.5">
          <span class="h-1.5 w-1.5 rounded-full bg-late-500" aria-hidden="true"></span>
          carried off
        </span>
        <span class="inline-flex items-center gap-1.5">
          <span class="h-px w-3 bg-ink-200" aria-hidden="true"></span>
          app not opened
        </span>
      </div>
    </div>
  `,
})
export class Calendar {
  private readonly tasks = inject(TaskStore);

  protected readonly startOfThisMonth = startOfMonth(today());
  protected readonly weekdayHeadings = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  protected readonly heatSteps = HEAT.slice(1);

  protected readonly month = signal(this.startOfThisMonth);
  protected readonly label = computed(() => monthLabel(this.month()));

  private readonly todayDate = today();

  constructor() {
    // Paging out of the window TaskStore opens with has to fetch, and the
    // month on screen is the only thing that decides what is needed.
    effect(() => {
      const first = this.month();
      const last = addDays(first, daysInMonth(first) - 1);
      void this.tasks.loadSnapshots(first, last);
      void this.tasks.loadRange(first, last);
    });
    void this.tasks.ensureLoaded();
  }

  protected readonly cells = computed<Array<Cell | null>>(() => {
    const first = this.month();
    const snapshots = this.tasks.snapshotByDate();
    const scheduled = this.tasks.openCountByDate();
    const blanks: Array<Cell | null> = Array(weekdayIndex(first)).fill(null);

    const days = Array.from({ length: daysInMonth(first) }, (_, i): Cell => {
      const date = addDays(first, i);
      const past = date < this.todayDate;
      const snapshot = snapshots.get(date);

      return {
        date,
        day: i + 1,
        past,
        isToday: date === this.todayDate,
        count: past ? (snapshot?.completed_count ?? 0) : (scheduled.get(date) ?? 0),
        carried: past ? (snapshot?.carried_count ?? 0) : 0,
        unrecorded: past && !snapshot,
      };
    });

    return [...blanks, ...days];
  });

  protected step(n: number): void {
    this.month.set(addMonths(this.month(), n));
  }

  protected heat(cell: Cell): string {
    return HEAT[Math.min(cell.count, HEAT.length - 1)];
  }

  protected cellClass(cell: Cell): string {
    if (cell.isToday) return 'text-brand-700 ring-2 ring-brand-500';
    if (cell.past) return 'text-ink-600';
    return 'text-ink-900';
  }

  protected describe(cell: Cell): string {
    const day = friendlyDate(cell.date);
    if (cell.unrecorded) return `${day}, app not opened`;
    if (cell.past) {
      const done = `${cell.count} done`;
      return cell.carried > 0 ? `${day}, ${done}, ${cell.carried} carried off` : `${day}, ${done}`;
    }
    return cell.count > 0 ? `${day}, ${cell.count} scheduled` : `${day}, nothing scheduled`;
  }
}
