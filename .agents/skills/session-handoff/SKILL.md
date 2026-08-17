---
name: session-handoff
description: Record what happened this session into docs/SESSIONS.md so the next session — in Cowork, Claude Code or Command Code — can pick up cleanly. Use when the user says "wrap up", "handoff", "log this session", "I'm done for today", or before ending a work session. Also use at the START of a session to read the last entry and re-establish context.
argument-hint: "[start|end] (defaults to end)"
---

# Session handoff

Daybook is built across agents and surfaces — Cowork, Claude Code, Command Code — used
interchangeably. None of them can see another's conversation history. `docs/SESSIONS.md`
is the only shared memory. It is not a changelog; git already does that. It records
**intent, dead ends, and open threads** — the things that live in a conversation and die
with it.

## Mode: start

Run when opening a session.

1. Read the **first entry** in `docs/SESSIONS.md` (newest is at the top).
2. Read `AGENTS.md`, and the **Phase status** table in `BUILD-PLAN.md`.
3. Run `git log --oneline -10` and `git status --short` to see what actually landed
   versus what the last entry claimed.
4. If the Supabase MCP is connected, run `list_migrations` and compare against
   `supabase/migrations/`. The live project is the truth; the folder can lag.
5. Report back in three lines: where things stand, what the last session left open, and
   what you propose doing now. Then stop and wait — do not start work off the log alone.

If the log's "Next" and the git state disagree, say so. That gap is the most useful thing
the log produces.

## Mode: end (default)

Run before finishing. Do not skip steps because the session felt small.

### 1. Gather the facts

Run these and read the output — do not write the entry from memory:

```bash
git log --oneline "$(git log -1 --format=%H --before=@{6.hours.ago} 2>/dev/null || echo HEAD~10)"..HEAD 2>/dev/null | head -30
git status --short
git diff --stat HEAD
npx ng build 2>&1 | tail -12
npx ng test --watch=false 2>&1 | tail -8
```

Record the real bundle size and the real test count. If a build or test run was not
done this session, say that rather than quoting the last known numbers.

If the schema changed, run `list_migrations` on the Supabase MCP and note what applied.

### 2. Write the entry

Prepend to `docs/SESSIONS.md`, directly under the `<!-- newest first -->` marker. Never
append to the bottom, never edit a previous entry — if something in an old entry turned
out wrong, say so in the new one.

Use exactly this shape:

```markdown
## YYYY-MM-DD · <agent> · <2–5 word topic>

**Did**
- Terse, factual, one line each. What changed and where.

**Decided**
- Only decisions that outlive this session. Include the reasoning, briefly.
- Omit this section entirely if nothing was decided.

**Didn't work**
- Approaches tried and abandoned, and why. This is the highest-value section —
  it is what stops the next agent burning an hour rediscovering the same wall.
- Omit if genuinely nothing was abandoned.

**Open**
- Unfinished threads, known-broken things, questions for Noel.
- Say "nothing open" rather than deleting the heading.

**Next**
- The single most sensible next action, specific enough to start from cold.

**Touched** — `path/one.ts`, `path/two.sql`
```

`<agent>` is `cowork`, `claude-code` or `command-code`. Get the date from `date +%F`, not
from memory.

### 3. Rules for the entry

- **Terse.** Six lines beats sixteen. If it reads like prose, cut it.
- **No praise, no summary of how well it went.** Facts only.
- **Name files and functions**, not vague areas. "Fixed the rollover" is useless;
  "changed `carried_over_count` to increment by `v_today - scheduled_date`" is usable.
- **Record the false starts.** An entry with no "Didn't work" section on a hard session
  is a sign the entry is too shallow.
- **Any decision that outlives the session goes in `BUILD-PLAN.md` too.** The log records
  that a decision was made, the plan records what the decision *is*. Do not let them
  drift.
- If a change contradicts `AGENTS.md`, update that file in the same commit.

### 4. Update BUILD-PLAN.md

`BUILD-PLAN.md` is the single source of truth. The log is chronological; the plan is
current state. Both are needed, and the plan is the one that goes stale silently.

In the same commit, update whichever of these the session moved:

- **§3 Phase status** if a phase advanced.
- **§5 Features** if any feature's state changed. Feature state is tracked there and
  nowhere else, so a shipped feature still marked "not started" is a real bug in the
  docs.
- **§4 Remaining work** if an item was finished, or a new one was discovered.
- **§9 Decisions made during the build** if something was decided.
- **§12 Known gaps** if a gap opened or closed.

Never update the Notion page. It is historical.

### 5. Commit

```bash
git add -A && git commit -m "session: <same topic as the entry heading>"
```

Do not push unless asked.

## Keeping the file usable

Once `docs/SESSIONS.md` passes roughly 40 entries, fold everything older than the current
phase into a single `## Archive — <period>` block at the bottom, keeping only the Decided
and Didn't-work lines. Never delete a "Didn't work" line.
