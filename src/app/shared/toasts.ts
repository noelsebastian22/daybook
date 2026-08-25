import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastStore } from '../core/toast.store';

@Component({
  selector: 'app-toasts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="safe-bottom pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 lg:left-60"
      role="status"
      aria-live="polite"
    >
      @for (t of toasts.toasts(); track t.id) {
        <div
          class="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-card px-4 py-3 text-sm shadow-lg"
          [class]="t.tone === 'error' ? 'bg-late-700 text-white' : 'bg-ink-900 text-white'"
        >
          <span class="flex-1">{{ t.message }}</span>
          @if (t.undo) {
            <button
              type="button"
              class="rounded-control px-2 py-1 font-semibold text-brand-100 hover:bg-white/10"
              (click)="toasts.runUndo(t)"
            >
              Undo
            </button>
          }
          <button
            type="button"
            class="rounded-control px-2 py-1 text-white/60 hover:bg-white/10"
            aria-label="Dismiss"
            (click)="toasts.dismiss(t.id)"
          >
            &times;
          </button>
        </div>
      }
    </div>
  `,
})
export class Toasts {
  protected readonly toasts = inject(ToastStore);
}
