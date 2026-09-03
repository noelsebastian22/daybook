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
import { CAPTURE_LAYER_HEIGHT } from './today.constants';
import { ENERGY_OPTIONS, ENERGY_TONE } from './today.data';
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
  templateUrl: './capture.html',
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
  protected readonly energies = ENERGY_OPTIONS;

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
    this.dropUp() ? 'absolute left-0 bottom-full z-50 mb-2' : 'absolute left-0 top-full z-50 mt-2',
  );

  protected readonly energyChipClass = computed(() => {
    const energy = this.parsed().energy;
    if (!energy) return '';
    return ENERGY_TONE[energy];
  });

  protected clock = friendlyClock;

  /** Colours an energy token in the mirror to match its chip. */
  protected energyTokenClass(raw: string): string {
    return ENERGY_TONE[raw.toLowerCase().includes('deep') ? 'deep' : 'quick'];
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

  /** Opens one layer, closing the others, with the side measured first. */
  protected open(layer: WritableSignal<boolean>): void {
    const below = window.innerHeight - this.chipRow().nativeElement.getBoundingClientRect().bottom;
    this.dropUp.set(below < CAPTURE_LAYER_HEIGHT);

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
