# Daybook MCP plan: using the app through Claude

Daybook gets a remote MCP server so any approved user can read and change
their own day from Claude (web, desktop, phone, Claude Code) and from any
other MCP client, with the same rules the app follows.

Written 6 Oct. Decisions closed the same day (§9); the task plan is
[`docs/plans/2026-10-06-mcp.md`](./plans/2026-10-06-mcp.md). **Built 6 Oct, not
yet deployed** — what is left needs the dashboard and the CLI (OPERATIONS.md,
"The MCP server").

---

## 1. Why, and why not the Supabase connector

Claude can already reach Daybook's data through the Supabase connector. That
is the wrong tool for daily use, for reasons that are all in this repo:

- **The rules live in the client.** `reschedule_count` moves only when you
  push a task: always through `reschedule`, and through `edit` only when the
  date moves forward (`task.store.ts`). Completing pins
  `scheduled_date` to today (`toggleComplete`). `#slug` resolves to a category,
  creating it if new (`resolveCategory`). Capture syntax is `parseCapture` and
  chrono-node. A raw `update tasks` gets every one of these wrong silently,
  and the two-counter split is the product.
- **It is the admin surface.** It runs above RLS, needs `user_id` typed in by
  hand, and can apply migrations and pause the project.
- **Rollover cannot run through it.** `rollover_and_snapshot` raises on a null
  `auth.uid()`. And rollover only runs when a client opens (§7 of BUILD-PLAN),
  so a read of "today" before the app has been opened shows yesterday's page.

The Supabase connector stays what it is now: the tool for schema work,
debugging and audits. The MCP server is the way to use the app.

## 2. What is decided

- **Remote, not local.** One Supabase Edge Function, `supabase/functions/mcp`,
  next to `notify` and `access`. A stdio server in the repo would only ever
  work on one Mac; a remote one works on the phone, which is where capture
  happens.
- **Streamable HTTP, stateless, official TypeScript SDK.** A fresh `McpServer`
  per request, per Supabase's MCP-on-Edge-Functions guide. Stateless rules out
  sampling and server-pushed notifications. Neither is wanted.
- **Every request runs as the user, under RLS.** The function never holds or
  uses `service_role`. Tenancy comes from the token, not from code: a missing
  `where user_id` cannot leak anything, because RLS is doing the filtering.
  This is the opposite of `notify`, and on purpose (BUILD-PLAN §4 Phase 7,
  "everything downstream of service_role").
- **Auth is Supabase's own OAuth 2.1 server**, with Dynamic Client
  Registration on. Claude registers itself, sends the user to Daybook to sign
  in and approve, and gets a token for that user. Signing in goes through the
  existing Google and magic-link flows, so **the access gate applies for
  free**: nobody without an approved account can complete the consent.
- **Tools are Daybook verbs, not table operations.** `capture`, `complete`,
  `reschedule`, never `update_task(patch)`. §5.
- **One rulebook, two callers.** The rules in §1 move out of `task.store.ts`
  into a pure domain module that the store and the function both import. §4.

## 3. Shape

```
Claude ── OAuth (DCR + PKCE) ──▶ Supabase Auth OAuth server
  │                                    │ redirects to
  │                                    ▼
  │                       daybook.noel-sebastian.com/oauth/consent
  │                       (sign in if needed, approve / deny)
  │
  └── Bearer token ──▶ functions/v1/mcp  (verify_jwt = false; checks itself)
                          │ 401 + WWW-Authenticate: resource_metadata=…
                          │ user-scoped supabase client (RLS)
                          ├─ rollover_and_snapshot(zoned today)  once per call
                          └─ domain/*  → tasks, categories, day_snapshots
```

- **401 is required**, with `WWW-Authenticate: Bearer resource_metadata=…`.
  Claude ignores the header on any other status.
- **Metadata URL off-origin is fine.** Edge Functions only route under
  `/functions/v1/`, so the protected-resource document is served by the
  function itself and pointed at from the 401, not from a root `/.well-known`.
  `resource` must equal the connector URL exactly, path included.
- **Redirect URIs to allow:** `https://claude.ai/api/mcp/auth_callback` for
  the hosted apps, and loopback on any port, both `localhost` and
  `127.0.0.1`, for Claude Code.
- **Endpoint latency:** Claude gives discovery, registration and token 10 s.
  Those are Supabase's endpoints, not ours, but a cold function on the 401
  path still counts toward the user's wait.

## 4. The shared domain module

Pure TypeScript, no Angular, no Supabase client. Inputs in, rows or patches
out. What moves into it:

| Today | Moves to |
|---|---|
| `parseCapture`, `parse-capture.data.ts` | as is, but zoned (below) |
| new-task construction in `add` | `newTask(parsed, ctx)` |
| the `edit` patch and its forward-only `reschedule_count` rule | `editPatch(task, parsed, ctx)` |
| `toggleComplete`'s patch | `completePatch(task, ctx)` / `reopenPatch()` |
| `reschedule`'s patch | `reschedulePatch(task, date)` |
| the slug-to-name rule in `resolveCategory` | `categoryFromSlug(slug, sortOrder)` |
| Carried-most / pushed-most in `features/reporting/reporting.ts` | `review(tasks, snapshots, range)` |

**The timezone is the real work here.** `dates.ts` reads the device clock
(`toLocalDate()` uses `getFullYear()` and friends) and `parseCapture(input,
ref)` assumes the device's zone. On an Edge Function the device is UTC, so
"tomorrow 9am" typed at 8am Sydney time lands on the wrong day and the wrong
hour. The module therefore takes an explicit context:

```ts
interface DomainContext {
  timeZone: string;   // user_settings.timezone, already validated by 0005
  today: string;      // YYYY-MM-DD in that zone
  now: Date;
}
```

The browser builds it from the device as now; the function builds it from
`user_settings`. `reminder_at` is wall time in the user's zone converted to
UTC through `Intl`, never through the runtime's local zone. Tests pin it
across the Sydney DST change, which happened on 4 Oct, two days before this
was written.

**The store keeps its optimistic, offline-queued behaviour.** It calls the
same functions to build the same patches. The 811 existing tests are the
guard that the extraction changed nothing.

**Where it lives is open** (D1, §9): Deno has to bundle it at deploy and the
Angular build has to import it. Proving both is the first task of the
implementation plan, before anything is moved.

## 5. Tools

Tool design is where "works through AI properly" is won or lost. The rules:

- **Descriptions teach the product.** Every tool description says, in one
  sentence, what a day page is, that there is no backlog, and which counter
  the action touches. The model plans better when it knows `reschedule`
  "counts as you moving it" and rollover "counts as the app moving it".
- **Verbs, small and batchable.** `capture` takes a list of lines, so "add
  these five things" is one call. `complete` and `reschedule` take lists of
  ids.
- **Return what happened, readably.** Every write returns the resulting rows
  plus a one-line summary (`Added "call physio" to Thu 8 Oct, 14:00, #health,
  quick`), so Claude can confirm without a second read. Structured content
  alongside the text, with output schemas.
- **Find by words, act by id.** `find_tasks` exists so "the physio one" and
  "everything I carried this week" resolve to ids without listing whole
  months.
- **Hints are honest.** Reads are `readOnlyHint`. `delete_task` is
  `destructiveHint`, so clients ask first. `capture` accepts an optional
  client id per line, as the app already does, so a retried call cannot
  create a duplicate (`idempotentHint` on the write tools that support it).
- **Errors are results, not exceptions,** and say what to do: "No task with
  that id on your account. Use find_tasks."

v1 tools:

| Tool | Kind | Notes |
|---|---|---|
| `get_day(date?)` | read | Defaults to today in the user's zone. Open, done with times, carried counts. |
| `get_upcoming(days?)` | read | ≤ 21, matching the Upcoming page's three weeks. |
| `find_tasks(query?, filters, limit?)` | read | Text match, category, energy, open/done, carried ≥ n, date range. Paged. |
| `get_review(from?, to?)` | read | Completed per day, carried most, pushed most. ≤ 92 days. |
| `list_categories()` | read | Slugs and names, so Claude uses existing tags. |
| `capture(lines[])` | write | Runs the real parser. Returns what each token became. |
| `complete(ids[])` / `reopen(id)` | write | Same patch as the checkbox. |
| `reschedule(ids[], date)` | write | Increments `reschedule_count`, same as swipe-left. |
| `edit_task(id, text?, notes?, category?, energy?, reminder_time?)` | write | Named fields, `null` clears. Never moves the day or a counter; moving is `reschedule`. |
| `delete_task(id)` | write | Destructive. |

**Before any tool touches tasks, the function calls `rollover_and_snapshot`**
with the zoned today. It is idempotent and clamps the date server-side, so
this is safe and usually a no-op. Without it, a Claude read before the first
app open of the day is wrong.

**Prompts, v1 optional:** `plan_my_day` and `weekly_review`. They show up as
slash commands in Claude Code. Workflows that combine Daybook with Calendar
or Gmail belong in a Claude skill, not in this server.

**Not in v1:** settings (digest, timezone), category rename and delete,
attachments. Each can be added without changing anything above.

## 6. The consent page

A new signed-out-capable route, `/oauth/consent`, set as the OAuth server's
Authorization Path. It reads `authorization_id` from the query string, sends
the user through sign-in first if needed (and back, keeping the id), then
shows:

- which client is asking (name from `getAuthorizationDetails`),
- **the redirect host, displayed plainly**, which the MCP spec requires, with
  a stronger warning when it is a loopback address,
- what it will be able to do: read and change your tasks and categories,
- Approve / Deny, calling `approveAuthorization` / `denyAuthorization`.

Built to the usual rules (`AGENTS.md`): sibling `.html`, tokens only, paper
theme, specs asserting on text and ARIA. It is unguarded, like
`/access/decide`, because a signed-out visitor has to be able to land on it.
The first visit after the deploy that adds it may be served the old build;
the unknown-route guard from 3 Oct is what fetches the new one.

**Revoking.** A "Connected apps" box in Settings (`settings/connected-apps.ts`),
on auth-js's `oauth.listGrants()` and `oauth.revokeGrant()` — both present in
the pinned 2.112.3, checked 6 Oct. Revoking ends the client's sessions and
refresh tokens server-side.

## 7. Making the app notice outside writes

The app has no realtime subscription (dropped deliberately for bundle size,
`core/supabase.ts`) and loads by range. A task Claude adds while the app is
open stays invisible until a reload, and worse, a stale row on screen can
write an old `reschedule_count + 1` over Claude's newer value.

- **Refetch the visible range on `visibilitychange` to visible**, the same
  event the offline queue already listens to. Cheap, and covers "switched
  from Claude back to Daybook".
- **Counters stay last-write-wins** for now, documented in §12 of BUILD-PLAN.
  Moving increments into the database (`reschedule_count =
  reschedule_count + 1` in an RPC) is the fix if it ever bites, and it would
  have to replay correctly through the offline queue, so it is not v1.

## 8. Scale

What keeps this cheap at five users and still fine at five hundred:

- **Stateless and RLS-scoped**, so it scales with Edge Functions and cannot
  cross tenants by construction. No per-user code paths.
- **Bounded reads.** Every list tool has a limit and every range a cap
  (21 days upcoming, 92 days review). No tool can ask for "everything".
- **One rollover per call, server-clamped.** Already proven multi-tenant in
  Phase 7.
- **Standard MCP and standard OAuth**, so ChatGPT, Cursor, VS Code or a future
  native wrap connect to the same endpoint without new server code.
- **Observable without reading tasks.** One log line per call: tool, user id,
  duration, outcome. Never task text or notes.
- **Known growth costs, deferred to Gate 3:** DCR registers a new client on
  every fresh connection, so the client list grows; per-user rate limiting;
  OAuth users count toward MAU. None matter at beta volume.
- **Category ownership (BUILD-PLAN §4 item 12) is fixed first.** A composite
  FK on `tasks (category_id, user_id)` closes the cross-user category
  reference before a second client starts writing `category_id`. One small
  migration, `0008`.

## 9. Open decisions

All four closed by Noel, 6 Oct.

- **D1. Where the domain module lives — `supabase/functions/_shared/domain/`**,
  imported by the app through relative paths with `.ts` extensions
  (`rewriteRelativeImportExtensions` in `tsconfig.json`). Proven by spike.
- **D2. No `created_via` column.** Nothing reads it yet.
- **D3. Every approved user**, not Noel only. RLS makes it free.
- **D4. The raw `…supabase.co/functions/v1/mcp` URL.**

## 10. To verify during implementation

Answered 6 Oct: grants can be listed and revoked by the user (§6). The
`@supabase/server` gate **rejects HS256 user tokens outright** — it verifies
against the project JWKS — so asymmetric signing keys are a hard
prerequisite, not a recommendation. Still open:

- Which signing keys the project uses (ES256 / RS256 needed, see above).
- That Google sign-in through `/oauth/consent` returns to the consent page
  with `authorization_id` intact.
- That RLS accepts OAuth tokens with the existing `auth.uid() = user_id`
  policies unchanged (Supabase says it does; the `client_id` claim only
  matters if policies want to restrict by client).
- That Supabase exposes a user's OAuth grants for a revoke list (§6).
- That `chrono-node` from `npm:` and the shared module bundle under
  `supabase functions deploy`, which deploys from disk, not from the MCP
  tool (BUILD-PLAN §9, "Edge Functions deploy with the Supabase CLI").
- Two accounts, two connectors, one phone: each sees only its own day. This
  is the Gate 1 swap again, through a new door.

## 11. Order of work

1. **Spike:** shared module location (D1). Prove Angular imports it and a
   throwaway function deploys with it.
2. **Domain extraction** with the zoned context. App behaviour unchanged,
   suite green, DST tests added.
3. **Migration `0008`:** composite category FK (item 12).
4. **Dashboard, in one sitting:** OAuth server on, DCR on, Authorization Path
   `/oauth/consent`, redirect URIs, signing keys checked. Do Gate 0 blockers
   4 (service role into Vault) and 5 (leaked-password protection) in the same
   visit, since both are dashboard-only.
5. **Consent page** and its specs.
6. **`mcp` function:** auth, metadata, rollover, read tools first, then
   writes. Tested against the local stack, then deployed with the CLI.
7. **Refetch on visible** in the app.
8. **Connect and verify:** custom connector in Claude on the web and the
   phone, `claude mcp add --transport http` in Claude Code, the two-account
   check in §10.
9. **Docs:** BUILD-PLAN §3, §4, §9; `AGENTS.md` for the domain-module rule;
   `docs/OPERATIONS.md` for deploy and revoke.

## 12. Deliberately not doing

- No service-role path, no admin tools, no cross-user anything.
- No generic `update_task(patch)` or SQL tool. If a verb is missing, add the
  verb.
- No sampling or server-initiated messages (stateless functions cannot).
- No realtime in the app for this. Refetch on visible is enough.
- No `created_via` until something reads it (D2).
