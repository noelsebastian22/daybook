import { Injectable } from '@angular/core';

/** What every Supabase call resolves to. */
export interface Result<T> {
  data: T | null;
  error: { message: string } | null;
}

export function ok<T>(data: T): Result<T> {
  return { data, error: null };
}

export function fail<T>(message = 'boom'): Result<T> {
  return { data: null, error: { message } };
}

/** One recorded call, so a spec can assert what was sent as well as what came back. */
export interface RecordedCall {
  kind: 'from' | 'rpc' | 'auth';
  name: string;
  /** For `from`, the chained operations in order: `select`, `eq`, `insert`… */
  chain: { op: string; args: unknown[] }[];
}

/**
 * The chainable surface a spec sees.
 *
 * Supabase's builder is *thenable* rather than a promise — every method
 * returns `this`, and awaiting it anywhere in the chain runs the query. That
 * shape is the whole reason the fake exists: a plain object of `vi.fn()`s
 * cannot express "any method may be the last one", so specs written against
 * one end up asserting the shape of the mock instead of the behaviour of the
 * code.
 *
 * The listed methods are the PostgREST verbs this app actually uses, plus the
 * filters it is most likely to grow into. The index signature underneath
 * absorbs anything not listed, so a store adding an `.order()` does not break
 * a spec that never cared about ordering — but the named ones still give
 * completion and catch a typo.
 */
export interface Query<T> extends PromiseLike<Result<T>> {
  select(...args: unknown[]): Query<T>;
  insert(...args: unknown[]): Query<T>;
  update(...args: unknown[]): Query<T>;
  upsert(...args: unknown[]): Query<T>;
  delete(...args: unknown[]): Query<T>;
  eq(...args: unknown[]): Query<T>;
  neq(...args: unknown[]): Query<T>;
  in(...args: unknown[]): Query<T>;
  is(...args: unknown[]): Query<T>;
  gte(...args: unknown[]): Query<T>;
  lte(...args: unknown[]): Query<T>;
  order(...args: unknown[]): Query<T>;
  limit(...args: unknown[]): Query<T>;
  single(...args: unknown[]): Query<T>;
  maybeSingle(...args: unknown[]): Query<T>;
  [op: string]: unknown;
}

class FakeQuery<T> implements PromiseLike<Result<T>> {
  constructor(
    private readonly result: () => Result<T>,
    private readonly record: (op: string, args: unknown[]) => void,
  ) {
    return new Proxy(this, {
      get(target, prop, receiver) {
        if (prop === 'then' || prop in target) {
          return Reflect.get(target, prop, receiver);
        }
        return (...args: unknown[]) => {
          target.record(String(prop), args);
          return receiver;
        };
      },
    });
  }

  then<A = Result<T>, B = never>(
    onfulfilled?: ((value: Result<T>) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.result()).then(onfulfilled, onrejected);
  }
}

/**
 * Stands in for `Supabase` in specs. Installed globally by
 * `test-providers.ts`, so a spec only touches it to say what a call should
 * return:
 *
 * ```ts
 * const db = TestBed.inject(Supabase) as unknown as FakeSupabase;
 * db.onFrom('tasks', ok([makeTask()]));
 * db.onRpc('rollover_and_snapshot', fail('offline'));
 * ```
 *
 * Anything not configured resolves to `ok(null)` rather than throwing, so a
 * spec states only the calls it cares about.
 */
@Injectable()
export class FakeSupabase {
  readonly calls: RecordedCall[] = [];

  private readonly tableResults = new Map<string, Result<unknown>>();
  private readonly rpcResults = new Map<string, Result<unknown>>();

  /** The session `auth.getSession()` reports. `null` means signed out. */
  session: { user: { id: string; email: string } } | null = null;

  /** Callbacks handed to `onAuthStateChange`, so a spec can drive sign-in. */
  private readonly authListeners: ((event: string, session: unknown) => void)[] = [];

  onFrom<T>(table: string, result: Result<T>): void {
    this.tableResults.set(table, result as Result<unknown>);
  }

  onRpc<T>(fn: string, result: Result<T>): void {
    this.rpcResults.set(fn, result as Result<unknown>);
  }

  /** Fire an auth state change at every registered listener. */
  emitAuth(event: string, session: unknown = this.session): void {
    for (const listener of this.authListeners) listener(event, session);
  }

  /** The chained ops recorded for the most recent `from(table)`. */
  chainFor(table: string): { op: string; args: unknown[] }[] {
    const call = [...this.calls].reverse().find((c) => c.kind === 'from' && c.name === table);
    return call?.chain ?? [];
  }

  readonly client = {
    from: (table: string) => {
      const call: RecordedCall = { kind: 'from', name: table, chain: [] };
      this.calls.push(call);
      return new FakeQuery(
        () => (this.tableResults.get(table) ?? { data: null, error: null }) as Result<unknown>,
        (op, args) => call.chain.push({ op, args }),
      ) as unknown as Query<unknown>;
    },

    rpc: (fn: string, args?: unknown) => {
      const call: RecordedCall = { kind: 'rpc', name: fn, chain: [{ op: 'args', args: [args] }] };
      this.calls.push(call);
      return new FakeQuery(
        () => (this.rpcResults.get(fn) ?? { data: null, error: null }) as Result<unknown>,
        (op, a) => call.chain.push({ op, args: a }),
      ) as unknown as Query<unknown>;
    },

    auth: {
      getSession: async () => {
        this.calls.push({ kind: 'auth', name: 'getSession', chain: [] });
        return { data: { session: this.session }, error: null };
      },
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        this.calls.push({ kind: 'auth', name: 'onAuthStateChange', chain: [] });
        this.authListeners.push(cb);
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      signInWithOAuth: async (args: unknown) => {
        this.calls.push({
          kind: 'auth',
          name: 'signInWithOAuth',
          chain: [{ op: 'args', args: [args] }],
        });
        return { data: null, error: null };
      },
      signInWithOtp: async (args: unknown) => {
        this.calls.push({
          kind: 'auth',
          name: 'signInWithOtp',
          chain: [{ op: 'args', args: [args] }],
        });
        return { data: null, error: null };
      },
      signOut: async () => {
        this.calls.push({ kind: 'auth', name: 'signOut', chain: [] });
        this.session = null;
        return { error: null };
      },
    },
  };
}
