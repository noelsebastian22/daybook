import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { parseCapture, segments } from '../../core/parse-capture';
import { friendlyClock, friendlyDate, timeOfDay, toTimestamp } from '../../core/dates';
import { DatePicker, type PickedDate } from '../../shared/date-picker';
import type { Scheduling } from '../../core/models';

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
  imports: [DatePicker],
  template: `
    <div class="rounded-2xl bg-white p-1 shadow-sm ring-1 ring-ink-200/70 focus-within:ring-2 focus-within:ring-brand-500">
      <div class="relative">
        <!-- mirror -->
        <div
          class="pointer-events-none px-4 py-3 text-base leading-6 whitespace-pre-wrap break-words"
          aria-hidden="true"
        >
          @for (s of parts(); track $index) {
            @switch (s.kind) {
              @case ('date') {
                <span class="rounded-md bg-brand-100 text-brand-700">{{ s.text }}</span>
              }
              @case ('category') {
                <span class="rounded-md bg-ink-100 text-ink-600">{{ s.text }}</span>
              }
              @case ('energy') {
                <span class="rounded-md bg-quick-100 text-quick-700">{{ s.text }}</span>
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

      <div class="flex flex-wrap items-center gap-2 px-4 pb-3 text-xs">
        <div class="relative">
          <button
            #dateChip
            type="button"
            class="rounded-full bg-brand-50 px-2 py-1 font-medium text-brand-700 transition hover:bg-brand-100"
            [attr.aria-expanded]="pickerOpen()"
            [attr.aria-label]="'Scheduled for ' + when() + '. Change the date'"
            (click)="pickerOpen.set(!pickerOpen())"
          >
            {{ when() }}
          </button>

          @if (pickerOpen()) {
            <app-date-picker
              class="absolute left-0 top-full z-50 mt-2"
              [date]="scheduledDate()"
              [time]="reminderTime()"
              (picked)="onPicked($event)"
              (closed)="closePicker()"
            />
          }
        </div>

        @if (reminderTime(); as t) {
          <span class="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-1 font-medium text-brand-700">
            {{ clock(t) }}
            <button
              type="button"
              class="text-brand-700/60 transition hover:text-brand-700"
              [attr.aria-label]="'Clear the ' + clock(t) + ' reminder'"
              (click)="clearReminder()"
            >
              <span aria-hidden="true">&times;</span>
            </button>
          </span>
        }

        @if (parsed().categorySlug; as category) {
          <span class="rounded-full bg-ink-100 px-2 py-1 font-medium text-ink-600">
            #{{ category }}
          </span>
        }

        @if (parsed().energy; as energy) {
          <span
            class="rounded-full px-2 py-1 font-medium"
            [class]="energy === 'quick' ? 'bg-quick-100 text-quick-700' : 'bg-deep-100 text-deep-700'"
          >
            {{ energy }}
          </span>
        }

        @if (actions()) {
          <div class="ml-auto flex items-center gap-2">
            <button
              type="button"
              class="rounded-lg px-3 py-1.5 font-medium text-ink-500 transition hover:bg-ink-100 hover:text-ink-700"
              (click)="cancelled.emit()"
            >
              Cancel
            </button>
            <button
              type="button"
              class="rounded-lg bg-brand-600 px-3 py-1.5 font-medium text-white transition hover:bg-brand-700 disabled:opacity-40"
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

  private readonly inputEl = viewChild.required<ElementRef<HTMLTextAreaElement>>('input');
  private readonly dateChip = viewChild.required<ElementRef<HTMLButtonElement>>('dateChip');

  protected readonly value = linkedSignal(() => this.seed()?.text ?? '');
  protected readonly pickerOpen = signal(false);

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

  protected clock = friendlyClock;

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

  protected onKeydown(event: KeyboardEvent): void {
    // Escape backs out. The picker is a layer above the box, so it eats the
    // first press and the box only closes on the second.
    if (event.key === 'Escape') {
      event.preventDefault();
      if (this.pickerOpen()) this.closePicker();
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
