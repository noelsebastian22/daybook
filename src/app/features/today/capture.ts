import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
  type WritableSignal,
} from '@angular/core';
import { parseCapture, segments, writeToken, type TokenKind } from '../../core/parse-capture';
import { friendlyClock, friendlyDate, timeOfDay, toTimestamp } from '../../core/dates';
import { DatePicker, type PickedDate } from '../../shared/date-picker';
import { Popover } from '../../shared/popover';
import { TaskStore } from '../../core/task.store';
import type { Energy, Scheduling } from '../../core/models';

export interface CaptureSubmit {
  text: string;
  /** Set only when the picker was used. Null means the text speaks for itself. */
  scheduling: Scheduling | null;
}

/**
 * Opening state for an edit. The text is the task's own text with its `#tag`
 * and `!energy` spelled back out, so the chips render and the tokens stay
 * editable in the one place the user is already looking.
 */
export interface CaptureSeed {
  text: string;
  scheduling: Scheduling | null;
}

/**
 * Natural language capture.
 *
 * A transparent textarea sits on top of a styled mirror div, per the spec.
 * Not contenteditable: contenteditable fights the IME, mangles paste and
 * loses the caret on re-render. The two elements must share identical font,
 * padding and line-height or the chips drift away from the text.
 *
 * The date chip is live from the moment the box is open, not only once a date
 * parses (BUILD-PLAN §9): `scheduled_date` is required, so a default is always
 * being applied and hiding it is dishonest about what is about to happen.
 * Clicking it opens the picker.
 */
@Component({
  selector: 'app-capture',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePicker, Popover],
  template: `
    <div class="rounded-panel bg-white p-1 shadow-sm ring-1 ring-ink-200/70 focus-within:ring-2 focus-within:ring-brand-500">
      <div class="relative">
        <!-- mirror -->
        <div
          class="pointer-events-none px-4 py-3 text-base leading-6 whitespace-pre-wrap break-words"
          aria-hidden="true"
        >
          @for (s of parts(); track $index) {
            @switch (s.kind) {
              @case ('date') {
                <span class="rounded-control bg-brand-100 text-brand-700">{{ s.text }}</span>
              }
              @case ('category') {
                <span class="rounded-control bg-ink-100 text-ink-600">{{ s.text }}</span>
              }
              @case ('energy') {
                <!-- quick and deep have their own scales; the mirror used to
                     paint both amber, which put an amber "!deep" beside a
                     purple deep chip -->
                <span class="rounded-control" [class]="energyTokenClass(s.text)">{{ s.text }}</span>
              }
              @default {
                <span>{{ s.text }}</span>
              }
            }
          }
          @if (!value()) {
            <span class="text-ink-400">Add a task. Try "call physio thursday 2pm #physio !quick"</span>
          }
          <!-- keeps the box from collapsing on an empty last line -->
          <span>&nbsp;</span>
        </div>

        <!-- real input -->
        <textarea
          #input
          rows="1"
          class="absolute inset-0 h-full w-full resize-none bg-transparent px-4 py-3 text-base leading-6 text-transparent caret-ink-900 outline-none"
          [value]="value()"
          (input)="onInput($event)"
          (keydown)="onKeydown($event)"
          aria-label="Add a task"
        ></textarea>
      </div>

      <div #chipRow class="flex flex-wrap items-center gap-2 px-4 pb-3 text-xs">
        <div class="relative">
          <button
            #dateChip
            type="button"
            class="rounded-full bg-brand-50 px-2 py-1 font-medium text-brand-700 transition hover:bg-brand-100"
            [attr.aria-expanded]="pickerOpen()"
            [attr.aria-label]="'Scheduled for ' + when() + '. Change the date'"
            (click)="toggle(pickerOpen)"
          >
            {{ when() }}
          </button>

          @if (pickerOpen()) {
            <app-date-picker
              [class]="layerClass()"
              [date]="scheduledDate()"
              [time]="reminderTime()"
              (picked)="onPicked($event)"
              (closed)="closePicker()"
            />
          }
        </div>

        @if (reminderTime(); as t) {
          <span class="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-1 font-medium text-brand-700">
            <button
              type="button"
              class="font-medium"
              [attr.aria-label]="'Reminder at ' + clock(t) + '. Change the time'"
              (click)="open(pickerOpen)"
            >
              {{ clock(t) }}
            </button>
            <button
              type="button"
              class="text-brand-700/60 transition hover:text-brand-700"
              [attr.aria-label]="'Clear the ' + clock(t) + ' reminder'"
              (click)="clearReminder()"
            >
              <span aria-hidden="true">&times;</span>
            </button>
          </span>
        } @else {
          <button
            type="button"
            class="rounded-full bg-ink-50 px-2 py-1 font-medium text-ink-400 transition hover:bg-ink-100 hover:text-ink-600"
            aria-label="Add a reminder time"
            (click)="open(pickerOpen)"
          >
            Add time
          </button>
        }

        <!-- category -->
        <div class="relative">
          <span class="inline-flex items-center gap-1 rounded-full font-medium"
                [class]="parsed().categorySlug ? 'bg-ink-100 text-ink-600' : ''">
            <button
              #categoryChip
              type="button"
              class="rounded-full px-2 py-1 transition"
              [class]="parsed().categorySlug ? 'hover:text-ink-700' : 'bg-ink-50 text-ink-400 hover:bg-ink-100 hover:text-ink-600'"
              [attr.aria-expanded]="categoryOpen()"
              [attr.aria-label]="
                parsed().categorySlug
                  ? 'Category ' + parsed().categorySlug + '. Change it'
                  : 'Choose a category'
              "
              (click)="toggle(categoryOpen)"
            >
              {{ parsed().categorySlug ? '#' + parsed().categorySlug : '#Category' }}
            </button>
            @if (parsed().categorySlug) {
              <button
                type="button"
                class="pr-2 text-ink-400 transition hover:text-ink-700"
                aria-label="Clear the category"
                (click)="chooseCategory(null)"
              >
                <span aria-hidden="true">&times;</span>
              </button>
            }
          </span>

          @if (categoryOpen()) {
            <app-popover
              [class]="layerClass()"
              label="Choose a category"
              dismissLabel="Close the category list"
              (closed)="closeCategory()"
            >
              @for (c of categories(); track c.id) {
                <button
                  type="button"
                  class="flex w-full items-center gap-2 rounded-control px-3 py-2 text-left text-sm transition hover:bg-ink-50"
                  [class]="c.slug === parsed().categorySlug ? 'font-semibold text-brand-700' : 'text-ink-900'"
                  [attr.aria-pressed]="c.slug === parsed().categorySlug"
                  (click)="chooseCategory(c.slug)"
                >
                  <span
                    class="h-2 w-2 shrink-0 rounded-full"
                    [style.background-color]="c.colour"
                    aria-hidden="true"
                  ></span>
                  <span class="truncate">{{ c.name }}</span>
                </button>
              }
              @if (!categories().length) {
                <p class="px-3 py-2 text-sm text-ink-400">
                  No categories yet. Add them in Settings.
                </p>
              }
            </app-popover>
          }
        </div>

        <!-- energy -->
        <div class="relative">
          <span class="inline-flex items-center gap-1 rounded-full font-medium" [class]="energyChipClass()">
            <button
              #energyChip
              type="button"
              class="rounded-full px-2 py-1 transition"
              [class]="parsed().energy ? '' : 'bg-ink-50 text-ink-400 hover:bg-ink-100 hover:text-ink-600'"
              [attr.aria-expanded]="energyOpen()"
              [attr.aria-label]="
                parsed().energy ? 'Energy ' + parsed().energy + '. Change it' : 'Choose an energy'
              "
              (click)="toggle(energyOpen)"
            >
              {{ parsed().energy ?? 'Energy' }}
            </button>
            @if (parsed().energy) {
              <button
                type="button"
                class="pr-2"
                aria-label="Clear the energy"
                (click)="chooseEnergy(null)"
              >
                <span aria-hidden="true">&times;</span>
              </button>
            }
          </span>

          @if (energyOpen()) {
            <app-popover
              [class]="layerClass()"
              label="Choose an energy"
              dismissLabel="Close the energy list"
              (closed)="closeEnergy()"
            >
              @for (e of energies; track e) {
                <button
                  type="button"
                  class="flex w-full items-center justify-between rounded-control px-3 py-2 text-left text-sm transition hover:bg-ink-50"
                  [class]="e === parsed().energy ? 'font-semibold text-brand-700' : 'text-ink-900'"
                  [attr.aria-pressed]="e === parsed().energy"
                  (click)="chooseEnergy(e)"
                >
                  <span>{{ e === 'quick' ? 'Quick' : 'Deep' }}</span>
                  <span class="text-xs text-ink-400">{{ e === 'quick' ? '!quick' : '!deep' }}</span>
                </button>
              }
            </app-popover>
          }
        </div>

        @if (actions()) {
          <div class="ml-auto flex items-center gap-2">
            <button
              type="button"
              class="rounded-control px-3 py-1.5 font-medium text-ink-500 transition hover:bg-ink-100 hover:text-ink-700"
              (click)="cancelled.emit()"
            >
              Cancel
            </button>
            <button
              type="button"
              class="rounded-control bg-brand-600 px-3 py-1.5 font-medium text-white transition hover:bg-brand-700 disabled:opacity-40"
              [disabled]="!value().trim()"
              (click)="commit()"
            >
              {{ commitLabel() }}
            </button>
          </div>
        } @else if (value().trim()) {
          <span class="ml-auto text-ink-400">Enter to add</span>
        }
      </div>
    </div>
  `,
})
export class Capture {
  /** Seeds an edit. Null, the default, is a blank add box. */
  readonly seed = input<CaptureSeed | null>(null);
  /** Renders explicit Cancel and commit buttons, for the composer and edit card. */
  readonly actions = input(false);
  readonly commitLabel = input('Add');
  /** Takes the caret on mount, when the box was opened by a deliberate act. */
  readonly autoFocus = input(false);

  readonly submitted = output<CaptureSubmit>();
  /** Escape, or the Cancel button. The parent decides what dismissing means. */
  readonly cancelled = output<void>();

  private readonly tasks = inject(TaskStore);

  private readonly inputEl = viewChild.required<ElementRef<HTMLTextAreaElement>>('input');
  private readonly chipRow = viewChild.required<ElementRef<HTMLDivElement>>('chipRow');
  private readonly dateChip = viewChild.required<ElementRef<HTMLButtonElement>>('dateChip');
  private readonly categoryChip = viewChild.required<ElementRef<HTMLButtonElement>>('categoryChip');
  private readonly energyChip = viewChild.required<ElementRef<HTMLButtonElement>>('energyChip');

  protected readonly value = linkedSignal(() => this.seed()?.text ?? '');
  protected readonly pickerOpen = signal(false);
  protected readonly categoryOpen = signal(false);
  protected readonly energyOpen = signal(false);

  protected readonly categories = this.tasks.categories;
  protected readonly energies: Energy[] = ['quick', 'deep'];

  /**
   * What the picker chose, if it was used. Null means the text decides.
   *
   * An edit seeds it, because the task already has a day and that day did not
   * come from the words in the box — leaving it null would let the parser
   * re-date the task to today the moment anything was typed.
   */
  private readonly picked = linkedSignal<PickedDate | null>(() => {
    const scheduling = this.seed()?.scheduling;
    if (!scheduling) return null;
    return {
      date: scheduling.scheduled_date,
      time: scheduling.reminder_at ? timeOfDay(scheduling.reminder_at) : null,
    };
  });

  protected readonly parsed = computed(() => parseCapture(this.value()));
  protected readonly parts = computed(() => segments(this.value(), this.parsed().tokens));

  protected readonly scheduledDate = computed(
    () => this.picked()?.date ?? this.parsed().scheduled_date,
  );

  /** Local "HH:MM", from the picker if it was used, otherwise from the text. */
  protected readonly reminderTime = computed(() => {
    const chosen = this.picked();
    if (chosen) return chosen.time;
    const at = this.parsed().reminder_at;
    return at ? timeOfDay(at) : null;
  });

  protected readonly when = computed(() => friendlyDate(this.scheduledDate()));

  /**
   * Which way the layers open. Measured, not assumed: the composer is pinned to
   * the bottom of the viewport, so a panel hung below the chip row lands off
   * the bottom of the screen — the date picker did exactly that, unnoticed,
   * until the chips were built beside it. The edit card in task detail sits
   * mid-page and usually has room below.
   *
   * One decision for all three chips rather than one each. They share a row, so
   * a picker opening up while the category list opens down would read as a bug.
   * Measured when a layer opens; a resize while one is open leaves it stale,
   * which is not worth an observer for a panel that closes on the next click.
   */
  private readonly dropUp = signal(false);

  protected readonly layerClass = computed(() =>
    this.dropUp()
      ? 'absolute left-0 bottom-full z-50 mb-2'
      : 'absolute left-0 top-full z-50 mt-2',
  );

  protected readonly energyChipClass = computed(() => {
    const energy = this.parsed().energy;
    if (!energy) return '';
    return energy === 'quick' ? 'bg-quick-100 text-quick-700' : 'bg-deep-100 text-deep-700';
  });

  protected clock = friendlyClock;

  /** Colours an energy token in the mirror to match its chip. */
  protected energyTokenClass(raw: string): string {
    return raw.toLowerCase().includes('deep')
      ? 'bg-deep-100 text-deep-700'
      : 'bg-quick-100 text-quick-700';
  }

  constructor() {
    afterNextRender(() => {
      if (!this.autoFocus()) return;
      const el = this.inputEl().nativeElement;
      el.focus();
      // An edit opens with the caret after the existing text, not selecting
      // it — the common case is appending a word, not replacing the lot.
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }

  protected onInput(event: Event): void {
    const el = event.target as HTMLTextAreaElement;
    const before = this.parsed();
    this.value.set(el.value);
    const after = this.parsed();

    // A date typed after the picker was used is the newer intent, so it wins.
    if (
      after.scheduled_date !== before.scheduled_date ||
      after.reminder_at !== before.reminder_at
    ) {
      this.picked.set(null);
    }

    el.style.height = 'auto';
  }

  /**
   * The tallest layer is the date picker: shortcut rows, a month grid and the
   * time field. Sized generously — being wrong costs an upward panel where a
   * downward one would have fitted, which is merely unusual, while the other
   * way round puts the control off-screen.
   */
  private static readonly LAYER_HEIGHT = 380;

  /** Opens one layer, closing the others, with the side measured first. */
  protected open(layer: WritableSignal<boolean>): void {
    const below = window.innerHeight - this.chipRow().nativeElement.getBoundingClientRect().bottom;
    this.dropUp.set(below < Capture.LAYER_HEIGHT);

    for (const other of [this.pickerOpen, this.categoryOpen, this.energyOpen]) {
      if (other !== layer) other.set(false);
    }
    layer.set(true);
  }

  protected toggle(layer: WritableSignal<boolean>): void {
    if (layer()) layer.set(false);
    else this.open(layer);
  }

  protected onPicked(picked: PickedDate): void {
    this.picked.set(picked);
  }

  protected closePicker(): void {
    this.pickerOpen.set(false);
    this.dateChip().nativeElement.focus();
  }

  protected clearReminder(): void {
    this.picked.set({ date: this.scheduledDate(), time: null });
  }

  protected chooseCategory(slug: string | null): void {
    // Picking the category already set clears it, so the chip is its own toggle
    // and there is no dead "None" row in the list.
    const next = slug !== null && slug === this.parsed().categorySlug ? null : slug;
    this.setToken('category', next && `#${next}`);
    this.categoryOpen.set(false);
  }

  protected chooseEnergy(energy: Energy | null): void {
    const next = energy !== null && energy === this.parsed().energy ? null : energy;
    this.setToken('energy', next && `!${next}`);
    this.energyOpen.set(false);
  }

  protected closeCategory(): void {
    this.categoryOpen.set(false);
    this.categoryChip().nativeElement.focus();
  }

  protected closeEnergy(): void {
    this.energyOpen.set(false);
    this.energyChip().nativeElement.focus();
  }

  /**
   * Rewrites the text so the chosen token is in it, then hands the caret back
   * to the textarea where the user was typing.
   *
   * The DOM value is set alongside the signal rather than left to the `[value]`
   * binding, because the caret has to be restored against the new text in the
   * same frame — waiting for change detection lets the browser drop the caret
   * to the end first, which is visible as a jump.
   */
  private setToken(kind: TokenKind, raw: string | null): void {
    const el = this.inputEl().nativeElement;
    const caret = el.selectionStart ?? el.value.length;
    const edit = writeToken(this.value(), this.parsed().tokens, kind, raw, caret);

    this.value.set(edit.text);
    el.value = edit.text;
    el.focus();
    el.setSelectionRange(edit.caret, edit.caret);
  }

  protected onKeydown(event: KeyboardEvent): void {
    // Escape backs out. An open layer eats the first press and the box only
    // closes on the second. Each layer is checked here as well as in its own
    // component, because a chip can be opened by click while the caret stays
    // in the textarea — then both this handler and the layer's own document
    // listener see the press, and without this the box would close underneath.
    if (event.key === 'Escape') {
      event.preventDefault();
      if (this.pickerOpen()) this.closePicker();
      else if (this.categoryOpen()) this.closeCategory();
      else if (this.energyOpen()) this.closeEnergy();
      else this.cancelled.emit();
      return;
    }

    // Shift+Enter is a newline. Plain Enter submits.
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    this.commit();
  }

  protected commit(): void {
    const text = this.value().trim();
    if (!text) return;

    const chosen = this.picked();
    this.submitted.emit({
      text,
      scheduling: chosen
        ? {
            scheduled_date: chosen.date,
            // The reminder follows the chosen day, so moving the date does not
            // leave the time behind on the old one.
            reminder_at: chosen.time ? toTimestamp(chosen.date, chosen.time) : null,
          }
        : null,
    });

    // An edit box is unmounted by its parent on commit; blanking it here would
    // flash an empty field on the way out.
    if (this.seed()) return;
    this.value.set('');
    this.inputEl().nativeElement.value = '';
    this.picked.set(null);
  }
}
