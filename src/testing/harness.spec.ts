import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { Supabase } from '../app/core/supabase';
import { FakeSupabase, ok } from './fake-supabase';
import { makeTask, resetIds, TODAY } from './fakes';
import { render } from './render';

/**
 * Proves the harness itself works, so a failing component spec is a failing
 * component and not a broken rig. Written before any component spec, and the
 * first thing to check if the whole suite goes red at once.
 */

@Component({
  selector: 'app-probe',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>{{ label() }}</h1>
    <button type="button" (click)="count.set(count() + 1)">bump</button>
    <span data-testid="count">{{ count() }}</span>
  `,
})
class Probe {
  readonly label = input('start');
  readonly count = signal(0);
}

describe('the spec harness', () => {
  it('renders a zoneless OnPush component', async () => {
    const { query } = await render(Probe);
    expect(query('h1')?.textContent).toBe('start');
  });

  it('sets signal inputs before the first render', async () => {
    const { query } = await render(Probe, { inputs: { label: 'seeded' } });
    expect(query('h1')?.textContent).toBe('seeded');
  });

  it('re-renders after a click, which is what zoneless would not do on its own', async () => {
    const { click, query } = await render(Probe);
    await click('button');
    await click('button');
    expect(query('[data-testid="count"]')?.textContent).toBe('2');
  });

  it('updates an input after the first render', async () => {
    const { setInput, query } = await render(Probe, { inputs: { label: 'first' } });
    await setInput('label', 'second');
    expect(query('h1')?.textContent).toBe('second');
  });

  it('finds an element by its text', async () => {
    const { byText } = await render(Probe);
    expect(byText('button', 'BUMP')).not.toBeNull();
    expect(byText('button', 'nope')).toBeNull();
  });
});

describe('the fake Supabase', () => {
  it('is what the injector hands out, so no spec can reach the network', () => {
    expect(TestBed.inject(Supabase)).toBeInstanceOf(FakeSupabase);
  });

  it('resolves a configured table query and records the chain', async () => {
    const db = TestBed.inject(Supabase) as unknown as FakeSupabase;
    const task = makeTask({ text: 'call physio' });
    db.onFrom('tasks', ok([task]));

    const { data, error } = await db.client.from('tasks').select('*').eq('scheduled_date', TODAY);

    expect(error).toBeNull();
    expect(data).toEqual([task]);
    expect(db.chainFor('tasks').map((c) => c.op)).toEqual(['select', 'eq']);
  });

  it('absorbs a method it has never heard of instead of throwing', async () => {
    const db = TestBed.inject(Supabase) as unknown as FakeSupabase;
    db.onFrom('tasks', ok([]));
    // A store adding .order() must not break a spec that never cared about it.
    const { data } = await db.client.from('tasks').select('*').order('created_at').limit(5);
    expect(data).toEqual([]);
  });

  it('resolves an unconfigured call to empty rather than throwing', async () => {
    const db = TestBed.inject(Supabase) as unknown as FakeSupabase;
    const { data, error } = await db.client.rpc('never_configured');
    expect(data).toBeNull();
    expect(error).toBeNull();
  });

  it('drives auth state changes', async () => {
    const db = TestBed.inject(Supabase) as unknown as FakeSupabase;
    const seen: string[] = [];
    db.client.auth.onAuthStateChange((event) => seen.push(event));
    db.emitAuth('SIGNED_IN', { user: { id: 'u1' } });
    expect(seen).toEqual(['SIGNED_IN']);
  });
});

describe('the row builders', () => {
  it('defaults to an incomplete task on a fixed day', () => {
    const task = makeTask();
    expect(task.completed_at).toBeNull();
    expect(task.scheduled_date).toBe(TODAY);
  });

  it('gives readable, sequential ids', () => {
    resetIds();
    expect(makeTask().id).toBe('task-1');
    expect(makeTask().id).toBe('task-2');
  });

  it('lets a spec name only the field it is asserting on', () => {
    expect(makeTask({ text: 'call doctor' }).text).toBe('call doctor');
  });
});
