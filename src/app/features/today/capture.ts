import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { parseCapture, segments } from '../../core/parse-capture';
import { friendlyDate } from '../../core/dates';

/**
 * Natural language capture.
 *
 * A transparent textarea sits on top of a styled mirror div, per the spec.
 * Not contenteditable: contenteditable fights the IME, mangles paste and
 * loses the caret on re-render. The two elements must share identical font,
 * padding and line-height or the chips drift away from the text.
 */
@Component({
  selector: 'app-capture',
  changeDetection: ChangeDetectionStrategy.OnPush,
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

      @if (preview(); as p) {
        <div class="flex flex-wrap items-center gap-2 px-4 pb-3 text-xs">
          <span class="rounded-full bg-brand-50 px-2 py-1 font-medium text-brand-700">
            {{ p.when }}
          </span>
          @if (p.category) {
            <span class="rounded-full bg-ink-100 px-2 py-1 font-medium text-ink-600">
              #{{ p.category }}
            </span>
          }
          @if (p.energy) {
            <span
              class="rounded-full px-2 py-1 font-medium"
              [class]="p.energy === 'quick' ? 'bg-quick-100 text-quick-700' : 'bg-deep-100 text-deep-700'"
            >
              {{ p.energy }}
            </span>
          }
          <span class="ml-auto text-ink-400">Enter to add</span>
        </div>
      }
    </div>
  `,
})
export class Capture {
  readonly submitted = output<string>();

  private readonly inputEl = viewChild.required<ElementRef<HTMLTextAreaElement>>('input');

  protected readonly value = signal('');

  protected readonly parsed = computed(() => parseCapture(this.value()));
  protected readonly parts = computed(() => segments(this.value(), this.parsed().tokens));

  protected readonly preview = computed(() => {
    const v = this.value().trim();
    if (!v) return null;
    const p = this.parsed();
    return {
      when: friendlyDate(p.scheduled_date),
      category: p.categorySlug,
      energy: p.energy,
    };
  });

  protected onInput(event: Event): void {
    const el = event.target as HTMLTextAreaElement;
    this.value.set(el.value);
    el.style.height = 'auto';
  }

  protected onKeydown(event: KeyboardEvent): void {
    // Shift+Enter is a newline. Plain Enter submits.
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    const text = this.value().trim();
    if (!text) return;
    this.submitted.emit(text);
    this.value.set('');
    this.inputEl().nativeElement.value = '';
  }
}
