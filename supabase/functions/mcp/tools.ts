/**
 * Daybook's MCP tools. Every one is a Daybook verb — capture, complete,
 * reschedule — never a table operation, so a model cannot move a task without
 * the counter the app would have moved (docs/MCP-PLAN.md §5).
 *
 * Every query runs on `db`, the client `withSupabase` scoped to the caller's
 * token: RLS is what keeps one user's rows from another, not anything here.
 * There is no admin client in this file and there must never be one.
 */
import type { McpServer } from '@modelcontextprotocol/server';
import type { SupabaseContext } from '@supabase/server';
import { z } from 'zod';
import type { Database } from './database.types.ts';
import type { Category, Task } from '../_shared/domain/models.ts';
import { addDays, fromLocalDate, isIsoDate } from '../_shared/domain/dates.ts';
import { parseCapture } from '../_shared/domain/parse-capture.ts';
import {
  completePatch,
  categoryFromSlug,
  newTask,
  normaliseNotes,
  reopenPatch,
  reschedulePatch,
} from '../_shared/domain/task-rules.ts';
import { completedPerDay, topBy } from '../_shared/domain/review.ts';
import { isValidTimeZone, todayIn, wallToInstant } from '../_shared/domain/zone.ts';
import {
  checkRange,
  dayLabel,
  fail,
  LIMITS,
  lineOf,
  matchesQuery,
  normaliseSlug,
  ok,
  parseClock,
  sortForDay,
  viewOf,
  type TaskView,
  type ToolResult,
} from './core.ts';

type Db = SupabaseContext<Database>['supabase'];

/** Where the app was written and where its user is; the same fallback as `dates.ts`. */
const DEFAULT_TIMEZONE = 'Australia/Sydney';

export const INSTRUCTIONS = `Daybook is a daily to-do app where each day is a page. There is no backlog or inbox: every task lives on a date.

- Unfinished tasks move to the next day by themselves overnight. That is "carried", and the app counts it.
- Moving a task yourself is "pushed", counted separately. Never treat the two as the same thing; the user reads them as different signals.
- Completing a task stamps the time and moves it onto today's page.
- Capture uses the app's own one-line syntax: plain words, an optional date or time ("thursday 2pm", "tomorrow", "2026-10-12"), "#category", and "!quick" or "!deep" for energy.

Dates and times are in the user's own time zone. Act on tasks by the id each tool returns. Confirm with the user before deleting, and before changing many tasks at once.`;

export interface DaybookDeps {
  db: Db;
  userId: string;
  now: () => Date;
}

/**
 * One request's worth of state: the user's zone, their categories, and
 * whether rollover has run. Each is fetched at most once, and only by a tool
 * that needs it — `tools/list` touches the database not at all.
 */
class Daybook {
  constructor(private readonly deps: DaybookDeps) {}

  get db(): Db {
    return this.deps.db;
  }

  get userId(): string {
    return this.deps.userId;
  }

  now(): Date {
    return this.deps.now();
  }

  private zoneP?: Promise<string>;
  zone(): Promise<string> {
    this.zoneP ??= (async () => {
      const { data } = await this.db.from('user_settings').select('timezone').maybeSingle();
      const zone = data?.timezone;
      return zone && isValidTimeZone(zone) ? zone : DEFAULT_TIMEZONE;
    })();
    return this.zoneP;
  }

  async today(): Promise<string> {
    return todayIn(await this.zone(), this.now());
  }

  /**
   * Rollover only runs when a client opens, so a read before the app has been
   * opened today would show yesterday's page. Idempotent and clamped
   * server-side, so running it ahead of every task tool is safe and usually a
   * no-op. A failure is logged and does not stop the tool: the read is still
   * true, only possibly a day stale, which is what the app does too.
   */
  private rolledP?: Promise<void>;
  rollover(): Promise<void> {
    this.rolledP ??= (async () => {
      const { error } = await this.db.rpc('rollover_and_snapshot', { p_today: await this.today() });
      if (error) console.error('mcp rollover failed', error.code);
    })();
    return this.rolledP;
  }

  private categoriesP?: Promise<Category[]>;
  categories(): Promise<Category[]> {
    this.categoriesP ??= (async () => {
      const { data, error } = await this.db.from('categories').select('*').order('sort_order');
      if (error) throw new Error(`categories: ${error.code}`);
      return (data ?? []) as Category[];
    })();
    return this.categoriesP;
  }

  async categoryMap(): Promise<Map<string, Category>> {
    return new Map((await this.categories()).map((c) => [c.id, c]));
  }

  /** Unknown `#slug` creates the category, as capture in the app does. */
  async resolveCategory(slug: string | null): Promise<string | null> {
    if (!slug) return null;
    const list = await this.categories();
    const existing = list.find((c) => c.slug === slug);
    if (existing) return existing.id;

    const { data, error } = await this.db
      .from('categories')
      .insert({ user_id: this.userId, ...categoryFromSlug(slug, list.length) })
      .select()
      .single();
    if (data) {
      list.push(data as Category);
      return (data as Category).id;
    }
    // Another client made the same slug a moment ago: (user_id, slug) is
    // unique, so take theirs rather than failing the capture.
    if (error?.code === '23505') {
      this.categoriesP = undefined;
      return (await this.categories()).find((c) => c.slug === slug)?.id ?? null;
    }
    throw new Error(`category insert: ${error?.code ?? 'unknown'}`);
  }

  async tasksByIds(ids: string[]): Promise<Task[]> {
    const { data, error } = await this.db.from('tasks').select('*').in('id', ids);
    if (error) throw new Error(`tasks: ${error.code}`);
    return (data ?? []) as Task[];
  }

  async views(tasks: Task[]): Promise<TaskView[]> {
    const map = await this.categoryMap();
    return tasks.map((t) => viewOf(t, map));
  }
}

const isoDate = z.string().describe('A calendar date, YYYY-MM-DD.');
const taskId = z.guid().describe('A task id, as returned by another Daybook tool.');

const READ = { readOnlyHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

function missingLine(ids: string[]): string {
  return ids.length ? `\nNot found on your account: ${ids.join(', ')}. Use find_tasks.` : '';
}

export function registerDaybook(server: McpServer, deps: DaybookDeps): void {
  const d = new Daybook(deps);

  /**
   * Every tool goes through here: rollover first when it touches tasks, one
   * log line after (tool, user, time, outcome — never task text), and any
   * unexpected failure turned into a result the model can read instead of a
   * protocol error.
   */
  const run =
    <A>(name: string, touchesTasks: boolean, body: (args: A) => Promise<ToolResult>) =>
    async (args: A): Promise<ToolResult> => {
      const started = Date.now();
      let result: ToolResult;
      try {
        if (touchesTasks) await d.rollover();
        result = await body(args);
      } catch (error) {
        console.error(`mcp ${name} failed`, error instanceof Error ? error.message : 'unknown');
        result = fail(
          'Daybook could not finish that just now. Nothing else was changed; try again.',
        );
      }
      console.log(
        JSON.stringify({
          fn: 'mcp',
          tool: name,
          user: d.userId,
          ms: Date.now() - started,
          ok: !result.isError,
        }),
      );
      return result;
    };

  // ---------------------------------------------------------------- reads

  server.registerTool(
    'get_day',
    {
      title: 'Get a day',
      description:
        "One day's page: open tasks, then what was done and when. Defaults to today in the user's time zone. A past page only keeps what was finished on it; unfinished tasks have already moved on.",
      inputSchema: z.object({ date: isoDate.optional() }),
      annotations: READ,
    },
    run('get_day', true, async ({ date }: { date?: string }) => {
      const tz = await d.zone();
      const today = await d.today();
      const day = date ?? today;
      if (!isIsoDate(day)) return fail('date must be YYYY-MM-DD.');

      const { data, error } = await d.db.from('tasks').select('*').eq('scheduled_date', day);
      if (error) throw new Error(`get_day: ${error.code}`);
      const views = (await d.views((data ?? []) as Task[])).sort(sortForDay);
      const open = views.filter((v) => !v.done_at);
      const done = views.filter((v) => v.done_at);

      const lines = [`${dayLabel(day, today)} (${day}): ${open.length} open, ${done.length} done.`];
      if (open.length) lines.push('', 'Open:', ...open.map((v) => lineOf(v, tz, today)));
      if (done.length) lines.push('', 'Done:', ...done.map((v) => lineOf(v, tz, today)));
      if (!views.length)
        lines.push(day < today ? 'Nothing was finished on this page.' : 'Nothing on this page.');

      return ok(lines.join('\n'), { date: day, today, open, done });
    }),
  );

  server.registerTool(
    'get_upcoming',
    {
      title: 'Get upcoming days',
      description: `The days after today, up to ${LIMITS.upcomingDays}, grouped by day. Only days with something on them are listed.`,
      inputSchema: z.object({ days: z.number().int().min(1).max(LIMITS.upcomingDays).default(7) }),
      annotations: READ,
    },
    run('get_upcoming', true, async ({ days }: { days: number }) => {
      const tz = await d.zone();
      const today = await d.today();
      const from = addDays(today, 1);
      const to = addDays(today, days);
      const { data, error } = await d.db
        .from('tasks')
        .select('*')
        .gte('scheduled_date', from)
        .lte('scheduled_date', to)
        .order('scheduled_date')
        .order('created_at');
      if (error) throw new Error(`get_upcoming: ${error.code}`);

      const views = await d.views((data ?? []) as Task[]);
      const byDay = new Map<string, TaskView[]>();
      for (const v of views) byDay.set(v.date, [...(byDay.get(v.date) ?? []), v]);

      const lines = [`Next ${days} day${days === 1 ? '' : 's'} (${from} to ${to}):`];
      if (!byDay.size) lines.push('Nothing scheduled.');
      for (const [day, list] of byDay) {
        lines.push(
          '',
          `${dayLabel(day, today)} (${day}):`,
          ...list.sort(sortForDay).map((v) => lineOf(v, tz, today)),
        );
      }
      return ok(lines.join('\n'), { from, to, days: Object.fromEntries(byDay) });
    }),
  );

  server.registerTool(
    'find_tasks',
    {
      title: 'Find tasks',
      description:
        'Search tasks by words in the text or notes, category, energy, status, how often carried or pushed, and date range. Use it to turn "the physio one" or "everything I keep putting off" into ids. Open tasks by default, newest dates first.',
      inputSchema: z.object({
        query: z
          .string()
          .max(200)
          .optional()
          .describe('Every word must appear in the text or notes.'),
        status: z.enum(['open', 'done', 'any']).default('open'),
        category: z.string().optional().describe('A category slug, with or without #.'),
        energy: z.enum(['quick', 'deep']).optional(),
        min_carried: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe('Carried over by the app at least this often.'),
        min_pushed: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe('Moved by the user at least this often.'),
        from: isoDate.optional(),
        to: isoDate.optional(),
        limit: z.number().int().min(1).max(LIMITS.findMax).default(LIMITS.findDefault),
      }),
      annotations: READ,
    },
    run(
      'find_tasks',
      true,
      async (a: {
        query?: string;
        status: 'open' | 'done' | 'any';
        category?: string;
        energy?: 'quick' | 'deep';
        min_carried?: number;
        min_pushed?: number;
        from?: string;
        to?: string;
        limit: number;
      }) => {
        const tz = await d.zone();
        const today = await d.today();
        if ((a.from && !isIsoDate(a.from)) || (a.to && !isIsoDate(a.to))) {
          return fail('from and to must be YYYY-MM-DD.');
        }

        let q = d.db.from('tasks').select('*');
        if (a.status === 'open') q = q.is('completed_at', null);
        if (a.status === 'done') q = q.not('completed_at', 'is', null);
        if (a.energy) q = q.eq('energy', a.energy);
        if (a.min_carried) q = q.gte('carried_over_count', a.min_carried);
        if (a.min_pushed) q = q.gte('reschedule_count', a.min_pushed);
        if (a.from) q = q.gte('scheduled_date', a.from);
        if (a.to) q = q.lte('scheduled_date', a.to);
        if (a.category !== undefined) {
          const slug = normaliseSlug(a.category);
          const match = (await d.categories()).find((c) => c.slug === slug);
          if (!match) {
            const known = (await d.categories()).map((c) => c.slug).join(', ');
            return fail(`No category "${a.category}". Yours are: ${known || 'none yet'}.`);
          }
          q = q.eq('category_id', match.id);
        }

        const { data, error } = await q
          .order('scheduled_date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(LIMITS.findScan);
        if (error) throw new Error(`find_tasks: ${error.code}`);

        let rows = (data ?? []) as Task[];
        if (a.query?.trim()) rows = rows.filter((t) => matchesQuery(t, a.query!));
        const total = rows.length;
        const views = await d.views(rows.slice(0, a.limit));

        const lines = [
          `${total} match${total === 1 ? '' : 'es'}${total > views.length ? `, showing ${views.length}` : ''}.`,
        ];
        lines.push(...views.map((v) => lineOf(v, tz, today, true)));
        return ok(lines.join('\n'), { total, tasks: views });
      },
    ),
  );

  server.registerTool(
    'get_review',
    {
      title: 'Weekly review',
      description: `What got done per day, and the open tasks carried over most (avoided) and pushed most (moved by hand), as the Reporting page shows them. Defaults to the last ${LIMITS.reviewDefaultDays} days; at most ${LIMITS.reviewDays}.`,
      inputSchema: z.object({ from: isoDate.optional(), to: isoDate.optional() }),
      annotations: READ,
    },
    run('get_review', true, async (a: { from?: string; to?: string }) => {
      const tz = await d.zone();
      const today = await d.today();
      const to = a.to ?? today;
      const range = checkRange(
        a.from ?? addDays(to, -(LIMITS.reviewDefaultDays - 1)),
        to,
        LIMITS.reviewDays,
      );
      if ('error' in range) return fail(range.error);

      const [snapshots, doneToday, flagged] = await Promise.all([
        d.db.from('day_snapshots').select('*').gte('date', range.from).lte('date', range.to),
        d.db
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('scheduled_date', today)
          .not('completed_at', 'is', null),
        d.db
          .from('tasks')
          .select('*')
          .is('completed_at', null)
          .or('carried_over_count.gt.0,reschedule_count.gt.0')
          .limit(LIMITS.findScan),
      ]);
      for (const r of [snapshots, doneToday, flagged])
        if (r.error) throw new Error(`get_review: ${r.error.code}`);

      const days = completedPerDay(
        snapshots.data ?? [],
        range.from,
        range.to,
        today,
        doneToday.count ?? 0,
      );
      const open = (flagged.data ?? []) as Task[];
      const carried = await d.views(topBy(open, 'carried_over_count', LIMITS.topListSize));
      const pushed = await d.views(topBy(open, 'reschedule_count', LIMITS.topListSize));
      const total = days.reduce((sum, x) => sum + x.completed, 0);

      const lines = [`${range.from} to ${range.to}: ${total} done.`, '', 'Done per day:'];
      for (const x of days) {
        lines.push(
          `- ${dayLabel(x.date, today)} (${x.date}): ${x.unrecorded ? 'app not opened' : x.completed}`,
        );
      }
      lines.push('', 'Carried over most (the app moved these, you did not):');
      lines.push(...(carried.length ? carried.map((v) => lineOf(v, tz, today, true)) : ['- none']));
      lines.push('', 'Pushed most (you moved these by hand):');
      lines.push(...(pushed.length ? pushed.map((v) => lineOf(v, tz, today, true)) : ['- none']));
      return ok(lines.join('\n'), { from: range.from, to: range.to, total, days, carried, pushed });
    }),
  );

  server.registerTool(
    'list_categories',
    {
      title: 'List categories',
      description:
        'The user\'s categories, by slug. Use an existing slug in capture ("#health") rather than inventing a near-duplicate.',
      inputSchema: z.object({}),
      annotations: READ,
    },
    run('list_categories', false, async () => {
      const list = await d.categories();
      const text = list.length
        ? list.map((c) => `- #${c.slug} (${c.name})`).join('\n')
        : 'No categories yet.';
      return ok(text, { categories: list.map((c) => ({ slug: c.slug, name: c.name })) });
    }),
  );

  // ---------------------------------------------------------------- writes

  server.registerTool(
    'capture',
    {
      title: 'Add tasks',
      description: `Add up to ${LIMITS.captureMax} tasks, one line each, in the app's capture syntax: "call physio thursday 2pm #health !quick". A date or time in the line schedules it (and a time sets a reminder); no date means today. Returns how each line was read. Pass your own id per task to make a retry safe: an id that already exists is not added twice.`,
      inputSchema: z.object({
        tasks: z
          .array(
            z.object({
              line: z.string().min(1).max(LIMITS.textMax),
              notes: z.string().max(LIMITS.notesMax).optional(),
              id: taskId.optional(),
            }),
          )
          .min(1)
          .max(LIMITS.captureMax),
      }),
      annotations: { ...WRITE, idempotentHint: true },
    },
    run(
      'capture',
      true,
      async ({ tasks }: { tasks: { line: string; notes?: string; id?: string }[] }) => {
        const tz = await d.zone();
        const today = await d.today();
        const now = d.now();
        const problems: string[] = [];
        const rows: Task[] = [];
        const readAs = new Map<string, string>();

        for (const t of tasks) {
          const parsed = parseCapture(t.line, now, tz);
          if (!parsed.text) {
            problems.push(`"${t.line}": that is all tags and no task.`);
            continue;
          }
          if (parsed.scheduled_date < today) {
            problems.push(
              `"${t.line}": that reads as ${parsed.scheduled_date}, which has passed. Pages in the past do not take new tasks.`,
            );
            continue;
          }
          const row = newTask({
            id: t.id ?? crypto.randomUUID(),
            userId: d.userId,
            parsed,
            scheduling: null,
            categoryId: await d.resolveCategory(parsed.categorySlug),
            notes: normaliseNotes(t.notes),
            today,
            now,
          });
          rows.push(row);
          readAs.set(
            row.id,
            parsed.tokens.map((k) => `${k.kind} "${k.raw.trim()}"`).join(', ') || 'no tokens',
          );
        }

        let added: Task[] = [];
        if (rows.length) {
          const { data, error } = await d.db
            .from('tasks')
            .upsert(rows, { onConflict: 'id', ignoreDuplicates: true })
            .select();
          if (error) throw new Error(`capture: ${error.code}`);
          added = (data ?? []) as Task[];
        }
        const addedIds = new Set(added.map((t) => t.id));
        const skipped = rows.filter((r) => !addedIds.has(r.id)).map((r) => r.id);

        const views = await d.views(added);
        const lines = [`Added ${views.length}:`];
        for (const v of views)
          lines.push(`${lineOf(v, tz, today, true)} [read as: ${readAs.get(v.id)}]`);
        if (skipped.length) lines.push(`Already existed, not added again: ${skipped.join(', ')}`);
        if (problems.length) lines.push('', 'Not added:', ...problems.map((p) => `- ${p}`));
        const result = ok(lines.join('\n'), { added: views, already_existed: skipped, problems });
        return views.length || skipped.length ? result : { ...result, isError: true };
      },
    ),
  );

  server.registerTool(
    'complete',
    {
      title: 'Complete tasks',
      description:
        "Tick tasks off. Stamps the time and moves each onto today's page, as the checkbox does. Already-done tasks are left alone.",
      inputSchema: z.object({ ids: z.array(taskId).min(1).max(LIMITS.idsMax) }),
      annotations: { ...WRITE, idempotentHint: true },
    },
    run('complete', true, async ({ ids }: { ids: string[] }) => {
      const tz = await d.zone();
      const today = await d.today();
      const found = await d.tasksByIds(ids);
      const missing = ids.filter((id) => !found.some((t) => t.id === id));
      const open = found.filter((t) => !t.completed_at);
      const already = found.filter((t) => t.completed_at);

      let done: Task[] = [];
      if (open.length) {
        const { data, error } = await d.db
          .from('tasks')
          .update(completePatch(d.now(), today))
          .in(
            'id',
            open.map((t) => t.id),
          )
          .is('completed_at', null)
          .select();
        if (error) throw new Error(`complete: ${error.code}`);
        done = (data ?? []) as Task[];
      }
      const views = await d.views(done);
      const lines = [`Done ${views.length}:`, ...views.map((v) => lineOf(v, tz, today))];
      if (already.length) lines.push(`Already done: ${already.map((t) => t.text).join('; ')}`);
      return ok(lines.join('\n') + missingLine(missing), { done: views, missing });
    }),
  );

  server.registerTool(
    'reopen',
    {
      title: 'Un-complete a task',
      description: 'Un-tick a finished task. It stays on the day it was finished.',
      inputSchema: z.object({ id: taskId }),
      annotations: { ...WRITE, idempotentHint: true },
    },
    run('reopen', true, async ({ id }: { id: string }) => {
      const tz = await d.zone();
      const today = await d.today();
      const [task] = await d.tasksByIds([id]);
      if (!task) return fail(`No task ${id} on your account. Use find_tasks.`);
      if (!task.completed_at) return ok(`"${task.text}" is already open.`);
      const { data, error } = await d.db
        .from('tasks')
        .update(reopenPatch())
        .eq('id', id)
        .select()
        .single();
      if (error) throw new Error(`reopen: ${error.code}`);
      const [view] = await d.views([data as Task]);
      return ok(`Reopened:\n${lineOf(view, tz, today, true)}`, { task: view });
    }),
  );

  server.registerTool(
    'reschedule',
    {
      title: 'Move tasks to another day',
      description:
        'Move open tasks to a day, today or later. Counts as the user pushing them (the "pushed" count goes up by one each), exactly like moving a task in the app. Finished tasks stay where they were done.',
      inputSchema: z.object({ ids: z.array(taskId).min(1).max(LIMITS.idsMax), date: isoDate }),
      annotations: WRITE,
    },
    run('reschedule', true, async ({ ids, date }: { ids: string[]; date: string }) => {
      const tz = await d.zone();
      const today = await d.today();
      if (!isIsoDate(date)) return fail('date must be YYYY-MM-DD.');
      if (date < today) return fail(`${date} has passed. Move tasks to today (${today}) or later.`);

      const found = await d.tasksByIds(ids);
      const missing = ids.filter((id) => !found.some((t) => t.id === id));
      const moved: Task[] = [];
      const skipped: string[] = [];
      for (const task of found) {
        if (task.completed_at) {
          skipped.push(`"${task.text}" is done`);
          continue;
        }
        if (task.scheduled_date === date) {
          skipped.push(`"${task.text}" is already on ${date}`);
          continue;
        }
        const { data, error } = await d.db
          .from('tasks')
          .update(reschedulePatch(task, date))
          .eq('id', task.id)
          .select()
          .single();
        if (error) throw new Error(`reschedule: ${error.code}`);
        moved.push(data as Task);
      }
      const views = await d.views(moved);
      const lines = [
        `Moved ${views.length} to ${dayLabel(date, today)} (${date}):`,
        ...views.map((v) => lineOf(v, tz, today)),
      ];
      if (skipped.length) lines.push(`Left alone: ${skipped.join('; ')}.`);
      return ok(lines.join('\n') + missingLine(missing), { moved: views, missing });
    }),
  );

  server.registerTool(
    'edit_task',
    {
      title: 'Edit a task',
      description:
        "Change a task's wording, notes, category, energy or reminder time. Only the fields given change; pass null to clear one. Never moves the day and never touches the carried or pushed counts: use reschedule to move it.",
      inputSchema: z.object({
        id: taskId,
        text: z.string().min(1).max(LIMITS.textMax).optional(),
        notes: z.string().max(LIMITS.notesMax).nullable().optional(),
        category: z.string().nullable().optional().describe('A slug; a new one is created.'),
        energy: z.enum(['quick', 'deep']).nullable().optional(),
        reminder_time: z
          .string()
          .nullable()
          .optional()
          .describe('"HH:MM", 24-hour, on the task\'s own day.'),
      }),
      annotations: { ...WRITE, idempotentHint: true },
    },
    run(
      'edit_task',
      true,
      async (a: {
        id: string;
        text?: string;
        notes?: string | null;
        category?: string | null;
        energy?: 'quick' | 'deep' | null;
        reminder_time?: string | null;
      }) => {
        const tz = await d.zone();
        const today = await d.today();
        const [task] = await d.tasksByIds([a.id]);
        if (!task) return fail(`No task ${a.id} on your account. Use find_tasks.`);

        const patch: Database['public']['Tables']['tasks']['Update'] = {};
        if (a.text !== undefined) {
          const text = a.text.replace(/\s+/g, ' ').trim();
          if (!text) return fail('text cannot be blank.');
          patch.text = text;
        }
        if (a.notes !== undefined) patch.notes = normaliseNotes(a.notes);
        if (a.energy !== undefined) patch.energy = a.energy;
        if (a.category !== undefined) {
          if (a.category === null) patch.category_id = null;
          else {
            const slug = normaliseSlug(a.category);
            if (!slug)
              return fail(
                `"${a.category}" is not a usable category: letters, numbers, - and _ only.`,
              );
            patch.category_id = await d.resolveCategory(slug);
          }
        }
        if (a.reminder_time !== undefined) {
          if (a.reminder_time === null) patch.reminder_at = null;
          else {
            const clock = parseClock(a.reminder_time);
            if (!clock) return fail('reminder_time must be "HH:MM", 24-hour.');
            const day = fromLocalDate(task.scheduled_date);
            day.setHours(clock.h, clock.m, 0, 0);
            patch.reminder_at = wallToInstant(day, tz).toISOString();
          }
        }
        if (!Object.keys(patch).length) return fail('Nothing to change: give at least one field.');

        const { data, error } = await d.db
          .from('tasks')
          .update(patch)
          .eq('id', a.id)
          .select()
          .single();
        if (error) throw new Error(`edit_task: ${error.code}`);
        const [view] = await d.views([data as Task]);
        return ok(`Updated:\n${lineOf(view, tz, today, true)}`, { task: view });
      },
    ),
  );

  server.registerTool(
    'delete_task',
    {
      title: 'Delete a task',
      description:
        'Delete a task for good. The app has Undo; this does not. Confirm with the user first.',
      inputSchema: z.object({ id: taskId }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    run('delete_task', false, async ({ id }: { id: string }) => {
      const [task] = await d.tasksByIds([id]);
      if (!task) return fail(`No task ${id} on your account. Use find_tasks.`);
      const { error } = await d.db.from('tasks').delete().eq('id', id);
      if (error) throw new Error(`delete_task: ${error.code}`);
      return ok(`Deleted "${task.text}".`, { deleted: id });
    }),
  );

  // ---------------------------------------------------------------- prompts

  server.registerPrompt(
    'plan_my_day',
    {
      title: 'Plan my day',
      description: "Look at today's page and suggest an order for it.",
    },
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: "Look at my Daybook for today (get_day) and the next three days (get_upcoming). Suggest an order for today's open tasks: quick ones for the gaps, deep ones in a block. Call out anything carried three or more times and ask whether I want to do it, push it or drop it. Don't change anything until I say so.",
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'weekly_review',
    {
      title: 'Weekly review',
      description: 'What got done this week, and what keeps getting avoided.',
    },
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: "Run my Daybook weekly review for the last 7 days (get_review). Tell me what I got done, which days were empty, and what keeps being carried or pushed — kept separate, because they mean different things. For the worst few, suggest one concrete next step each. Don't change anything until I say so.",
          },
        },
      ],
    }),
  );
}
