/**
 * The tools, end to end through the real MCP handler, against an in-memory
 * stand-in for the user-scoped Supabase client. Run under Deno:
 *
 *   deno test --allow-env tools.test.ts
 *
 * What this proves: tool names and schemas, the rules each verb applies to a
 * row (which counter moves, what completing does to the date), zoned capture,
 * rollover running first, and that a bad argument comes back as something a
 * model can read. What it cannot: RLS, JWT verification, the OAuth dance.
 * Those are the live checks in docs/plans/2026-10-06-mcp.md, task 8.
 */
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { registerDaybook } from './tools.ts';

type Row = Record<string, unknown>;

/** Enough of PostgREST's builder for the queries tools.ts makes. */
class FakeDb {
  tables: Record<string, Row[]> = {
    tasks: [],
    categories: [],
    day_snapshots: [],
    user_settings: [],
  };
  rpcs: { fn: string; args: unknown }[] = [];

  from(table: string) {
    return new Query(this, table);
  }

  rpc(fn: string, args: unknown) {
    this.rpcs.push({ fn, args });
    return Promise.resolve({ data: [{ rolled_count: 0, snapshots_written: 0 }], error: null });
  }
}

class Query {
  private filters: ((r: Row) => boolean)[] = [];
  private op: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select';
  private payload: Row | Row[] | null = null;
  private ignoreDuplicates = false;
  private max = Infinity;
  private head = false;
  private one: 'single' | 'maybe' | null = null;

  constructor(
    private db: FakeDb,
    private table: string,
  ) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (opts?.head) this.head = true;
    return this;
  }
  insert(rows: Row | Row[]) {
    this.op = 'insert';
    this.payload = rows;
    return this;
  }
  upsert(rows: Row[], opts?: { ignoreDuplicates?: boolean }) {
    this.op = 'upsert';
    this.payload = rows;
    this.ignoreDuplicates = !!opts?.ignoreDuplicates;
    return this;
  }
  update(patch: Row) {
    this.op = 'update';
    this.payload = patch;
    return this;
  }
  delete() {
    this.op = 'delete';
    return this;
  }
  eq(c: string, v: unknown) {
    this.filters.push((r) => r[c] === v);
    return this;
  }
  gte(c: string, v: never) {
    this.filters.push((r) => (r[c] as never) >= v);
    return this;
  }
  lte(c: string, v: never) {
    this.filters.push((r) => (r[c] as never) <= v);
    return this;
  }
  gt(c: string, v: never) {
    this.filters.push((r) => (r[c] as never) > v);
    return this;
  }
  in(c: string, vs: unknown[]) {
    this.filters.push((r) => vs.includes(r[c]));
    return this;
  }
  is(c: string, v: null) {
    this.filters.push((r) => r[c] === v);
    return this;
  }
  not(c: string, _op: 'is', _v: null) {
    this.filters.push((r) => r[c] !== null);
    return this;
  }
  or(expr: string) {
    // Only the one shape tools.ts uses: "a.gt.0,b.gt.0".
    const parts = expr.split(',').map((p) => p.split('.'));
    this.filters.push((r) => parts.some(([c, , v]) => (r[c] as number) > Number(v)));
    return this;
  }
  order() {
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  single() {
    this.one = 'single';
    return this;
  }
  maybeSingle() {
    this.one = 'maybe';
    return this;
  }

  private run(): { data: unknown; error: { code: string } | null; count?: number } {
    const rows = this.db.tables[this.table];
    const match = (r: Row) => this.filters.every((f) => f(r));
    let out: Row[] = [];
    if (this.op === 'select') out = rows.filter(match).slice(0, this.max);
    if (this.op === 'insert' || this.op === 'upsert') {
      for (const row of ([] as Row[]).concat(this.payload as Row | Row[])) {
        const withId = { id: row.id ?? crypto.randomUUID(), ...row };
        if (rows.some((r) => r.id === withId.id)) {
          if (this.ignoreDuplicates) continue;
          return { data: null, error: { code: '23505' } };
        }
        rows.push(withId);
        out.push(withId);
      }
    }
    if (this.op === 'update') {
      for (const r of rows.filter(match)) {
        Object.assign(r, this.payload);
        out.push(r);
      }
    }
    if (this.op === 'delete') {
      this.db.tables[this.table] = rows.filter((r) => !match(r));
    }
    if (this.head) return { data: null, error: null, count: out.length };
    if (this.one) return { data: out[0] ?? null, error: null };
    return { data: out.map((r) => ({ ...r })), error: null };
  }

  then<T>(resolve: (v: ReturnType<Query['run']>) => T) {
    return Promise.resolve(this.run()).then(resolve);
  }
}

// 8am Wednesday 7 Oct in Sydney, 9pm Tuesday in UTC.
const NOW = new Date('2026-10-06T21:00:00Z');
const USER = '00000000-0000-4000-8000-000000000001';

function setup() {
  const db = new FakeDb();
  db.tables.user_settings.push({ user_id: USER, timezone: 'Australia/Sydney' });
  db.tables.categories.push({
    id: 'c-health',
    user_id: USER,
    slug: 'health',
    name: 'Health',
    sort_order: 0,
  });
  const handler = createMcpHandler(() => {
    const server = new McpServer({ name: 'daybook', version: 'test' });
    // deno-lint-ignore no-explicit-any
    registerDaybook(server, { db: db as any, userId: USER, now: () => NOW });
    return server;
  });

  let id = 0;
  async function rpc(method: string, params: unknown) {
    const res = await handler.fetch(
      new Request('http://localhost/functions/v1/mcp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          'mcp-protocol-version': '2025-06-18',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
      }),
    );
    const body = await res.text();
    const json = body.startsWith('{')
      ? body
      : body
          .split('\n')
          .find((l) => l.startsWith('data:'))!
          .slice(5);
    return JSON.parse(json);
  }
  const call = async (name: string, args: unknown) =>
    (await rpc('tools/call', { name, arguments: args })).result;
  return { db, rpc, call };
}

function assertEquals(actual: unknown, expected: unknown, msg = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}\n  expected ${e}\n  got      ${a}`);
}
function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

Deno.test('lists the eleven verbs, with honest hints', async () => {
  const { rpc } = setup();
  const { result } = await rpc('tools/list', {});
  const names = result.tools.map((t: { name: string }) => t.name).sort();
  assertEquals(names, [
    'capture',
    'complete',
    'delete_task',
    'edit_task',
    'find_tasks',
    'get_day',
    'get_review',
    'get_upcoming',
    'list_categories',
    'reopen',
    'reschedule',
  ]);
  const byName = Object.fromEntries(result.tools.map((t: { name: string }) => [t.name, t]));
  assertEquals(byName.get_day.annotations.readOnlyHint, true);
  assertEquals(byName.delete_task.annotations.destructiveHint, true);
});

Deno.test('capture reads the line on the user clock, and rolls over first', async () => {
  const { db, call } = setup();
  const r = await call('capture', { tasks: [{ line: 'call physio tomorrow 9am #health !quick' }] });
  assert(!r.isError, r.content[0].text);
  const [t] = db.tables.tasks;
  assertEquals(
    [t.text, t.scheduled_date, t.reminder_at, t.category_id, t.energy, t.created_date],
    ['call physio', '2026-10-08', '2026-10-07T22:00:00.000Z', 'c-health', 'quick', '2026-10-07'],
  );
  assertEquals([t.carried_over_count, t.reschedule_count, t.user_id], [0, 0, USER]);
  assertEquals(db.rpcs, [{ fn: 'rollover_and_snapshot', args: { p_today: '2026-10-07' } }]);
  assert(r.content[0].text.includes('tomorrow · 09:00 · #health · quick'), r.content[0].text);
});

Deno.test(
  'capture creates an unknown category, refuses a tags-only line, and is retry-safe',
  async () => {
    const { db, call } = setup();
    const id = '11111111-1111-4111-8111-111111111111';
    const first = await call('capture', {
      tasks: [{ line: 'water plants #garden', id }, { line: '#work !deep' }],
    });
    assert(first.content[0].text.includes('all tags and no task'), first.content[0].text);
    assertEquals(
      db.tables.categories.map((c) => c.slug),
      ['health', 'garden'],
    );
    const again = await call('capture', { tasks: [{ line: 'water plants #garden', id }] });
    assertEquals(db.tables.tasks.length, 1);
    assert(again.content[0].text.includes('Already existed'), again.content[0].text);
  },
);

Deno.test(
  'complete pins the day to today; reschedule counts as pushed; neither touches carried',
  async () => {
    const { db, call } = setup();
    await call('capture', { tasks: [{ line: 'a friday' }, { line: 'b' }] });
    db.tables.tasks[1].carried_over_count = 3;
    const [a, b] = db.tables.tasks;

    await call('complete', { ids: [a.id] });
    assertEquals([a.scheduled_date, a.completed_at], ['2026-10-07', NOW.toISOString()]);

    const moved = await call('reschedule', { ids: [b.id, a.id], date: '2026-10-10' });
    assertEquals(
      [b.scheduled_date, b.reschedule_count, b.carried_over_count],
      ['2026-10-10', 1, 3],
    );
    assertEquals(a.scheduled_date, '2026-10-07', 'a finished task stays put');
    assert(moved.content[0].text.includes('is done'), moved.content[0].text);

    const past = await call('reschedule', { ids: [b.id], date: '2026-10-01' });
    assertEquals(past.isError, true);
  },
);

Deno.test('edit changes only what it is given and never the day or counters', async () => {
  const { db, call } = setup();
  await call('capture', { tasks: [{ line: 'call mum thursday #health' }] });
  const [t] = db.tables.tasks;
  await call('edit_task', {
    id: t.id,
    text: 'call mum back',
    energy: 'quick',
    reminder_time: '18:30',
    category: null,
  });
  assertEquals(
    [t.text, t.energy, t.category_id, t.scheduled_date, t.reminder_at, t.reschedule_count],
    ['call mum back', 'quick', null, '2026-10-08', '2026-10-08T07:30:00.000Z', 0],
  );
  const nothing = await call('edit_task', { id: t.id });
  assertEquals(nothing.isError, true);
});

Deno.test('reads: a day, a search, a review', async () => {
  const { db, call } = setup();
  await call('capture', { tasks: [{ line: 'pay rent' }, { line: 'book flights #travel' }] });
  db.tables.tasks[1].carried_over_count = 4;

  const day = await call('get_day', {});
  assert(
    day.content[0].text.startsWith('today (2026-10-07): 2 open, 0 done.'),
    day.content[0].text,
  );

  const found = await call('find_tasks', { query: 'FLIGHTS' });
  assertEquals(
    found.structuredContent.tasks.map((v: { text: string }) => v.text),
    ['book flights'],
  );

  const review = await call('get_review', {});
  assertEquals(
    review.structuredContent.carried.map((v: { text: string }) => v.text),
    ['book flights'],
  );
  assertEquals(review.structuredContent.days.length, 14);
});

Deno.test('an id from someone else reads as not found, not as an error', async () => {
  const { call } = setup();
  const r = await call('complete', { ids: ['22222222-2222-4222-8222-222222222222'] });
  assert(r.content[0].text.includes('Not found on your account'), r.content[0].text);
});

Deno.test('a malformed argument is refused before any tool runs', async () => {
  const { db, call, rpc } = setup();
  const r = await rpc('tools/call', {
    name: 'reschedule',
    arguments: { ids: ['nope'], date: '2026-10-10' },
  });
  assert(r.error || r.result?.isError, JSON.stringify(r));
  assertEquals(db.rpcs.length, 0);
  void call;
});
