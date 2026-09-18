import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ApplicationRef } from '@angular/core';
import { addDays, friendlyTime, today } from '../../core/dates';
import type { Energy } from '../../core/models';
import { parseCapture, segments } from '../../core/parse-capture';
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

  /** The real textarea under the mirror. See {@link emptyBox}. */
  private readonly box = viewChild.required<ElementRef<HTMLTextAreaElement>>('box');

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
   * Noon on the day the page is showing, which is what the parser reasons
   * from — not the real now.
   *
   * Noon rather than midnight so that a bare time cannot fall off either end
   * of the day, and the shown day rather than today so "5pm" on a flipped
   * page does not resolve to yesterday evening and get filed backwards.
   */
  private readonly ref = computed(() => new Date(`${this.date()}T12:00:00`));

  /**
   * The live parse of whatever is in the box, and the runs the mirror paints.
   *
   * One parse serves the highlight, the readout and the add, so what you see
   * highlighted is by construction what gets filed. `add()` used to run its
   * own `parseCapture` — the same call with the same arguments, but a second
   * one, and two of them is how a hero that claims to run the real parser
   * quietly starts disagreeing with itself.
   */
  readonly parsed = computed(() => parseCapture(this.draft(), this.ref()));
  readonly parts = computed(() => segments(this.draft(), this.parsed().tokens));

  /**
   * What the box understood, as a phrase: "tomorrow, 5:00 PM".
   *
   * Gated on a date *token* having been recognised, not on `scheduled_date`,
   * which is the whole difference between a readout and a lie.
   * `parseCapture` initialises `scheduled_date` to today whether or not a
   * date was typed, so a readout driven off the value would assert "today"
   * over every keystroke of every task and mean nothing.
   */
  readonly readout = computed<string | null>(() => {
    const parsed = this.parsed();
    if (!parsed.tokens.some((t) => t.kind === 'date')) return null;

    const day = pageLabel(parsed.scheduled_date, this.date());
    return parsed.reminder_at ? `${day}, ${friendlyTime(parsed.reminder_at)}` : day;
  });

  /**
   * Colours an energy run in the mirror to match the chip the row will get.
   *
   * The two tones are spelled out here rather than imported from
   * `today.data.ts`, which is where the app's own `ENERGY_TONE` lives: this
   * is a lazy marketing route and the rows a few lines up in the template
   * already carry the same pair inline. One duplicated pair of class strings
   * is cheaper than a marketing chunk that imports the Today feature.
   */
  protected energyTone(raw: string): string {
    return raw.toLowerCase().includes('deep')
      ? 'bg-deep-tint text-on-deep-tint'
      : 'bg-quick-tint text-on-quick-tint';
  }

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
    this.draft.set((event.target as HTMLTextAreaElement).value);
  }

  /**
   * Enter adds the task.
   *
   * Needed because the box is a `textarea` rather than an `input` — a form
   * submits on Enter from an input on its own, but a textarea takes the
   * newline instead and the button becomes the only way out. The textarea is
   * not a preference either; see the template for why an input cannot carry
   * the highlight.
   *
   * There is nothing here that wants a second line, so Enter is unconditional
   * rather than Shift-guarded the way `capture.ts` has it.
   */
  onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    this.add();
  }

  /** `preventDefault` or the form navigates and the page reloads. */
  submit(event: Event): void {
    event.preventDefault();
    this.add();
  }

  add(): void {
    if (!this.draft().trim()) {
      this.message.set('Type a task first.');
      return;
    }

    const parsed = this.parsed();

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
      this.emptyBox();
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
    this.emptyBox();
    this.message.set('');
  }

  /**
   * Clears the box — the signal *and* the element.
   *
   * Both, because `[value]="draft()"` does not put the textarea back on its
   * own once a person has typed into it. Setting `draft` to `''` re-renders
   * the mirror, so the box looks empty and the placeholder comes back, while
   * the textarea keeps the old sentence as its value: invisible, because its
   * text is transparent, until the next keystroke appends to it.
   *
   * Seen in Chrome with real keystrokes; it does not reproduce when the value
   * is assigned and an `input` event dispatched, which is what a spec does,
   * so `try-page.spec.ts` passes either way and cannot catch this. The
   * assertion there is still worth keeping — it just is not what found it.
   *
   * `capture.ts` has carried the same two-line clear in `commit()` since it
   * was written, which is why the app's own capture box has never shown this.
   * The mirror technique needs it; the signal is not the source of truth the
   * browser is reading.
   */
  private emptyBox(): void {
    this.draft.set('');
    this.box().nativeElement.value = '';
  }

  toggle(id: number): void {
    this.message.set('');
    this.tasks.update((list) => list.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  }

  /**
   * Turn the page. Ticked tasks are finished and do not come; everything
   * else arrives on tomorrow with its count one higher.
   *
   * **The whole card turns, not its rows.** This used to name every `li`
   * `try-task-{id}` and let the browser FLIP the survivors between the two
   * snapshots, the way the app's own list does. It is now one name on the
   * card and a rotation in `src/styles.css` — Noel's call, and the right one
   * for a landing page: a row sliding a few pixels is a correct animation
   * that nobody watching a hero for ten seconds can see, where a card
   * turning over is legible at a glance and is what the button already says.
   *
   * The two cannot be combined. An element with a `view-transition-name` is
   * captured separately and is *not* painted into its ancestor's snapshot, so
   * keeping the row names would leave the rows animating over a turning card
   * rather than on it.
   *
   * Still through `withViewTransition` rather than a hand-rolled keyframe,
   * and for a sharper reason than convention (AGENTS.md, Motion): the
   * transition pseudo-elements render in the document's top layer, so the
   * hero section's overflow cannot clip the rotating card. A CSS transform on
   * the card itself would be sliced by its own ancestors. The reduced-motion
   * opt-out and the zoneless `tick()` come along for free.
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
