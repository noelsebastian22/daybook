import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ApplicationRef } from '@angular/core';
import { addDays, friendlyTime, today } from '../../core/dates';
import type { Energy } from '../../core/models';
import { parseCapture } from '../../core/parse-capture';
import { withViewTransition } from '../../core/view-transition';
import { dayOfYear, daysInYear, longDate, pageLabel } from './try-page.helpers';
import { CARRIED_NOTE, FLIPPED_NOTE } from './notes.data';

interface TryTask {
  readonly id: number;
  readonly text: string;
  readonly done: boolean;
  /** How many times the page has carried it. 0 means it arrived today. */
  readonly carried: number;
  readonly category: string | null;
  readonly energy: Energy | null;
  /** Already formatted for display: "5:00 PM", or null. */
  readonly reminder: string | null;
}

/**
 * The welcome hero's live page: a real Daybook page you can type into before
 * you have an account.
 *
 * It exists because the carry-over is the only thing about Daybook that no
 * other list app does, and a paragraph describing it is weaker than ten
 * seconds of doing it. The old hero was a looping CSS animation of a row
 * moving between two cards — the same argument, but on rails, and nobody
 * believes a demo they cannot touch.
 *
 * **It parses with the real `parseCapture`.** Not a lookalike. That is the
 * whole discipline of this component: the hero promises "type it the way
 * you'd say it", and the only way that promise cannot quietly rot is for the
 * hero to run the same function the capture box runs. If the parser stops
 * understanding "5pm" the hero stops understanding it on the same commit.
 *
 * Nothing here is persisted and nothing reaches Supabase. There is no store,
 * no `ensureLoaded`, no uid. It is six rows of local signal state that vanish
 * on reload, which is what lets it sit in front of the sign-in wall.
 *
 * The date is live, so the page says today's real date and the real page
 * number of the year. A landing page showing a date from whenever the
 * screenshot was taken is the kind of small deadness this whole retheme is
 * trying to avoid.
 */
@Component({
  selector: 'app-try-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './try-page.html',
})
export class TryPage {
  private readonly appRef = inject(ApplicationRef);

  /**
   * The day the page is showing. Captured once at construction rather than
   * read per render: this component is allowed to be open across midnight,
   * and a date line that changed under a half-typed task would be stranger
   * than one that is a few hours stale.
   */
  private readonly start = today();

  readonly offset = signal(0);
  readonly draft = signal('');
  readonly message = signal('');

  /**
   * Seeded so the hero has something to say before anyone touches it.
   *
   * `call physio` carries 2, which renders `carried ×2` and puts the
   * handwritten "third day running" beside it — two carries means this is
   * its third day on a page. The other two are clean, so there is something
   * to tick and something to leave, which is what the hint asks for.
   */
  readonly tasks = signal<readonly TryTask[]>([
    {
      id: 1,
      text: 'call physio',
      done: false,
      carried: 2,
      category: 'health',
      energy: 'quick',
      reminder: null,
    },
    {
      id: 2,
      text: 'book flights',
      done: false,
      carried: 0,
      category: null,
      energy: null,
      reminder: null,
    },
    {
      id: 3,
      text: 'pay rent',
      done: false,
      carried: 0,
      category: null,
      energy: null,
      reminder: null,
    },
  ]);

  /** Restored by "Back to today", so the demo can be run more than once. */
  private beforeFlip: readonly TryTask[] = this.tasks();
  private nextId = 4;

  readonly MAX_ROWS = 6;
  readonly carriedNote = CARRIED_NOTE;
  readonly flippedNote = FLIPPED_NOTE;

  readonly date = computed(() => addDays(this.start, this.offset()));
  readonly flipped = computed(() => this.offset() > 0);
  readonly dateLine = computed(() => longDate(this.date()));
  readonly pageNumber = computed(() => dayOfYear(this.date()));
  readonly pageTotal = computed(() => daysInYear(this.date()));
  readonly isEmpty = computed(() => this.tasks().length === 0);

  /** Whether anything on the page has been carried, for the flipped note. */
  readonly anyCarried = computed(() => this.tasks().some((t) => t.carried > 0));

  /**
   * `[value]` + `(input)`, which is what `capture.ts` does, rather than
   * `[(ngModel)]`.
   *
   * Not a style preference: under `[(ngModel)]` the box kept the text after a
   * task was filed to another day. `add()` clears `draft`, and the signal did
   * clear — but ngModel owns the DOM value through its own control and did
   * not write the cleared value back, so the page said "Saved to Monday's
   * page" with the sentence still sitting in the input. Owning the value
   * directly removes the second source of truth, and drops FormsModule from
   * a lazy marketing route.
   */
  onInput(event: Event): void {
    this.draft.set((event.target as HTMLInputElement).value);
  }

  /** `preventDefault` or the form navigates and the page reloads. */
  submit(event: Event): void {
    event.preventDefault();
    this.add();
  }

  add(): void {
    const raw = this.draft().trim();
    if (!raw) {
      this.message.set('Type a task first.');
      return;
    }

    // The real parser, against the day the page is showing rather than the
    // real today — otherwise "5pm" on a flipped page would resolve to
    // yesterday evening and be silently filed backwards.
    const parsed = parseCapture(raw, new Date(`${this.date()}T12:00:00`));

    if (!parsed.text.trim()) {
      this.message.set('Give it a name as well.');
      return;
    }

    if (parsed.scheduled_date !== this.date()) {
      // Exactly what the app does: the task is real and it went somewhere
      // else. Saying so, and not showing it here, is the honest demo.
      this.message.set(
        `Saved to ${pageLabel(parsed.scheduled_date, this.date())}'s page. It will be waiting there.`,
      );
      this.draft.set('');
      return;
    }

    if (this.tasks().length >= this.MAX_ROWS) {
      this.message.set('That page is full. Tick something off first.');
      return;
    }

    this.tasks.update((list) => [
      ...list,
      {
        id: this.nextId++,
        text: parsed.text.trim(),
        done: false,
        carried: 0,
        category: parsed.categorySlug,
        energy: parsed.energy,
        // Formatted once, on the way in. The placeholder invites "5pm", so
        // a demo that parsed the time and then showed nothing would be
        // under-selling the one thing the hero is claiming.
        reminder: parsed.reminder_at ? friendlyTime(parsed.reminder_at) : null,
      },
    ]);
    this.draft.set('');
    this.message.set('');
  }

  toggle(id: number): void {
    this.message.set('');
    this.tasks.update((list) => list.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  }

  /**
   * Turn the page. Ticked tasks are finished and do not come; everything
   * else arrives on tomorrow with its count one higher.
   *
   * Through `withViewTransition` rather than a keyframe, for the same reason
   * the app's own list does (AGENTS.md, Motion): the rows that survive are
   * matched by `view-transition-name` across the two snapshots and the
   * browser animates whatever actually moved. It also gets the reduced-motion
   * opt-out and the zoneless `tick()` for free.
   */
  flip(): void {
    this.beforeFlip = this.tasks();
    withViewTransition(this.appRef, () => {
      this.tasks.update((list) =>
        list.filter((t) => !t.done).map((t) => ({ ...t, carried: t.carried + 1 })),
      );
      this.offset.set(1);
      this.message.set('');
    });
  }

  back(): void {
    withViewTransition(this.appRef, () => {
      this.tasks.set(this.beforeFlip);
      this.offset.set(0);
      this.message.set('');
    });
  }
}
