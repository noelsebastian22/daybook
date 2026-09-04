import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Nav } from '../core/nav';
import { ToastStore, type Toast } from '../core/toast.store';
import { render, type Rendered } from '../../testing/render';
import { Toasts } from './toasts';

/** Undo toasts, never confirmation dialogs — so the Undo button is the point. */

let toasts: WritableSignal<Toast[]>;
let dismiss: ReturnType<typeof vi.fn>;
let runUndo: ReturnType<typeof vi.fn>;

function makeToast(over: Partial<Toast> = {}): Toast {
  return { id: 1, message: 'Done.', tone: 'neutral', ...over };
}

async function renderToasts(): Promise<Rendered<Toasts>> {
  return render(Toasts);
}

describe('Toasts', () => {
  beforeEach(() => {
    toasts = signal<Toast[]>([]);
    dismiss = vi.fn();
    runUndo = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        { provide: ToastStore, useValue: { toasts, dismiss, runUndo } },
        { provide: Nav, useValue: { collapsed: signal(false) } },
      ],
    });
  });

  it('announces politely rather than interrupting', async () => {
    const region = (await renderToasts()).query('[role="status"]');
    expect(region?.getAttribute('aria-live')).toBe('polite');
  });

  it('shows nothing when there is nothing to say', async () => {
    const view = await renderToasts();
    expect(view.queryAll('button')).toEqual([]);
  });

  it('renders one toast per message', async () => {
    toasts.set([makeToast({ id: 1, message: 'Done.' }), makeToast({ id: 2, message: 'Moved.' })]);
    const view = await renderToasts();

    expect(view.el.textContent).toContain('Done.');
    expect(view.el.textContent).toContain('Moved.');
  });

  it('offers Undo only on a toast that carries one', async () => {
    toasts.set([makeToast()]);
    const plain = await renderToasts();
    expect(plain.byText('button', 'Undo')).toBeNull();

    toasts.set([makeToast({ undo: () => {} })]);
    await plain.settle();
    expect(plain.byText('button', 'Undo')).not.toBeNull();
  });

  it('runs the undo through the store, so the toast clears with it', async () => {
    const toast = makeToast({ undo: () => {} });
    toasts.set([toast]);
    const view = await renderToasts();

    await view.click(view.byText('button', 'Undo') as HTMLElement);

    expect(runUndo).toHaveBeenCalledWith(toast);
  });

  it('names the dismiss control, which is an icon on its own', async () => {
    toasts.set([makeToast()]);
    const view = await renderToasts();
    const close = view.queryAll('button').find((b) => b.getAttribute('aria-label') === 'Dismiss');

    expect(close).toBeDefined();

    await view.click(close as HTMLElement);
    expect(dismiss).toHaveBeenCalledWith(1);
  });
});
