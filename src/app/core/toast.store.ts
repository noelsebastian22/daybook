import { signalStore, withState, withMethods, patchState } from '@ngrx/signals';

export interface Toast {
  id: number;
  message: string;
  /** When present the toast renders an Undo button. */
  undo?: () => void;
  tone: 'neutral' | 'error';
}

interface ToastState {
  toasts: Toast[];
}

let nextId = 1;

/**
 * Undo toasts instead of confirmation dialogs, per the spec.
 */
export const ToastStore = signalStore(
  { providedIn: 'root' },
  withState<ToastState>({ toasts: [] }),
  withMethods((store) => {
    const dismiss = (id: number) =>
      patchState(store, { toasts: store.toasts().filter((t) => t.id !== id) });

    const push = (message: string, tone: Toast['tone'], undo?: () => void) => {
      const id = nextId++;
      patchState(store, { toasts: [...store.toasts(), { id, message, tone, undo }] });
      setTimeout(() => dismiss(id), undo ? 6000 : 4000);
      return id;
    };

    return {
      dismiss,
      show: (message: string, undo?: () => void) => push(message, 'neutral', undo),
      error: (message: string) => push(message, 'error'),
      runUndo(toast: Toast) {
        toast.undo?.();
        dismiss(toast.id);
      },
    };
  }),
);
