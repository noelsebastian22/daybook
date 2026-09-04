import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastStore } from './toast.store';

describe('ToastStore', () => {
  let store: InstanceType<typeof ToastStore>;

  beforeEach(() => {
    vi.useFakeTimers();
    store = TestBed.inject(ToastStore);
  });

  afterEach(() => vi.useRealTimers());

  it('shows a neutral message with no undo button', () => {
    store.show('Moved.');

    expect(store.toasts()).toHaveLength(1);
    expect(store.toasts()[0].message).toBe('Moved.');
    expect(store.toasts()[0].tone).toBe('neutral');
    expect(store.toasts()[0].undo).toBeUndefined();
  });

  it('renders an undo button only when there is something to undo', () => {
    store.show('Deleted.', () => {});

    expect(store.toasts()[0].undo).toBeInstanceOf(Function);
  });

  it('marks an error so it can be told apart from a confirmation', () => {
    store.error('Could not save that task.');

    expect(store.toasts()[0].tone).toBe('error');
    expect(store.toasts()[0].undo).toBeUndefined();
  });

  it('stacks messages in the order they arrived', () => {
    store.show('first');
    store.show('second');

    expect(store.toasts().map((t) => t.message)).toEqual(['first', 'second']);
  });

  it('gives every toast its own id', () => {
    const first = store.show('first');
    const second = store.show('second');

    expect(first).not.toBe(second);
  });

  it('dismisses one toast without touching the rest', () => {
    const first = store.show('first');
    store.show('second');

    store.dismiss(first);

    expect(store.toasts().map((t) => t.message)).toEqual(['second']);
  });

  it('runs the undo and takes the toast away with it', () => {
    const undo = vi.fn();
    store.show('Deleted.', undo);

    store.runUndo(store.toasts()[0]);

    expect(undo).toHaveBeenCalledOnce();
    expect(store.toasts()).toEqual([]);
  });

  it('dismisses a toast that has no undo rather than throwing', () => {
    store.error('Could not save that change.');

    store.runUndo(store.toasts()[0]);

    expect(store.toasts()).toEqual([]);
  });

  it('leaves an undo on screen after a plain message would have gone', () => {
    // An undo is a decision to make, so it gets longer than a confirmation
    // there is nothing to do about.
    store.show('Moved.');
    store.show('Deleted.', () => {});

    vi.advanceTimersByTime(4000);
    expect(store.toasts().map((t) => t.message)).toEqual(['Deleted.']);

    vi.advanceTimersByTime(2000);
    expect(store.toasts()).toEqual([]);
  });

  it('dismisses itself even after it was dismissed by hand', () => {
    const id = store.show('Moved.');
    store.dismiss(id);
    store.show('Deleted.', () => {});

    vi.advanceTimersByTime(4000);

    expect(store.toasts().map((t) => t.message)).toEqual(['Deleted.']);
  });
});
