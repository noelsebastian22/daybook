import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';

/**
 * A small dismissable panel anchored by whoever opens it.
 *
 * The backdrop is a real `<button>` covering the viewport rather than a
 * document click listener: a listener added while the opening click is still
 * bubbling closes the panel on the very click that opened it, and the button
 * needs no teardown when the panel unmounts.
 *
 * The panel takes focus on open and Escape closes it. Positioning belongs to
 * the caller — this owns dismissal and nothing else, so one popover can sit
 * under a chip and another under a menu without either fighting the other.
 */
@Component({
  selector: 'app-popover',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'closed.emit()',
  },
  template: `
    <button
      type="button"
      class="fixed inset-0 z-40 cursor-default"
      tabindex="-1"
      [attr.aria-label]="dismissLabel()"
      (click)="closed.emit()"
    ></button>

    <div
      #panel
      class="relative z-50 min-w-44 rounded-2xl bg-white p-1 shadow-lg ring-1 ring-ink-200"
      role="dialog"
      [attr.aria-label]="label()"
    >
      <ng-content />
    </div>
  `,
})
export class Popover {
  readonly label = input.required<string>();
  readonly dismissLabel = input('Close');

  readonly closed = output<void>();

  private readonly panel = viewChild.required<ElementRef<HTMLDivElement>>('panel');

  constructor() {
    // Opened by a deliberate click, so it takes focus like any other dialog.
    afterNextRender(() => this.panel().nativeElement.querySelector('button')?.focus());
  }
}
