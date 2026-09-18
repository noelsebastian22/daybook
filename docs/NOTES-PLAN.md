# Daybook notes plan: a note on a task

Status: **complete, 18 Sep 2026.** Built on `feat/task-notes`; `0006` applied
live as `20260918034736 daybook_task_notes`. 713 tests across 38 files, initial
bundle 436.71 kB, `contrast-check` green. This file is frozen — record anything
further in `BUILD-PLAN.md` §9.

Two things this plan got wrong, corrected in the building and left here rather
than tidied away: `TaskDraft` was listed as gaining the field and is dead code,
and the store change was scoped to two call sites when there are **four** —
Upcoming and the calendar day detail both add through the same composer.

This file plans one piece of work: giving a task a free-text note.
`BUILD-PLAN.md` stays the source of truth for what Daybook is. §7 below links
this file from there and records the distinction it draws, so the two cannot
drift. When the work ships, this file is frozen and the outcome is summarised in
`BUILD-PLAN.md` §9.

---

## 1. What is decided

| Decision | Choice |
|---|---|
| Shape | One body of free text per task. Not a log, not comments, no timestamps |
| Storage | A nullable `notes text` column on `tasks`. Not a second table |
| Where typed | Inside `Capture`, behind a collapsed `Add notes` affordance |
| Where read | The detail page, under the chips, read-only until `Edit` |
| Discoverability | A small glyph on a task row that has a note |
| Format | Plain text. No markdown, no renderer, no dependency |
| Empty | Collapses to `null`, never `''` |
| Digest email | Excluded |
| Length | No app-level limit |

This reverses nothing. It draws one distinction, recorded in §7: **a note is not
a comment.** Todoist's comment thread is per-entry, timestamped and authored,
which is the project-management structure `BUILD-PLAN.md` §9 rejects. A single
body of text you overwrite is a property of the task, the way `text` is.

## 2. Rules for the work

Existing repo rules, restated because this job touches each of them.

- **The migration and the client are one change.** `BUILD-PLAN.md` §4 "the cost
  of the gap" — eight days with the client half deployed and the schema half not
  put the production app in a state nobody designed. The column goes first or
  the feature does not go.
- **Never edit an applied migration.** `0006` is new.
- **Every mutation is optimistic**, patched locally before Supabase is called.
- **Templates are sibling `.html` files**, no inline `template:`.
- **Spacing is 1/2/3/4/6/8.** New markup adds no fractional steps — there are
  already 41 waiting (`BUILD-PLAN.md` §4) and this must not add a 42nd.
- **Semantic colour tokens only.** No `bg-white`, no raw palette shades.
- **Assert on text, ARIA, state and calls** — never on a Tailwind class string.

## 3. Schema

`supabase/migrations/0006_task_notes.sql`:

```sql
alter table tasks add column notes text;
```

That is the whole migration. No index — notes are never queried or filtered on,
only read alongside a row that has already been fetched. No RLS change: the
existing `for all to authenticated` policy on `tasks`, with `auth.uid() =
user_id` in both `using` and `with check`, already covers every column, and a
new column inherits it. Nothing in `0003`'s cron functions reads or needs it.

**`0006` is taken by this work.** `core/models.ts` currently promises that the
deprecated `user_settings.push_subscription` is "dropped in migration 0006";
that comment is reworded to name no number. Dropping that column stays its own
change — it is the documented rollback path for C1 and must not ride along with
a feature.

## 4. Types

`core/models.ts`:

- `Task` gains `notes: string | null`.

**`TaskDraft` is deliberately left alone.** The first draft of this plan had it
gaining the field too; it is declared in `models.ts` and referenced nowhere in
`src`, so it is dead code and adding a field to it would be noise. Whether to
delete it is a separate question for the code-quality work, not this one.

`features/today/capture.ts`:

- `CaptureSubmit` gains `notes: string | null`.
- `CaptureSeed` gains `notes: string | null`.

**Empty is `null`.** The value is trimmed on commit and an empty result becomes
`null`, so "has a note" is one null check at every call site rather than a
truthiness argument, and clearing a note cannot leave a row that lies to the row
glyph.

## 5. The work

### Phase 1. Schema and types

`0006_task_notes.sql`, applied to the live project. `Task`, `CaptureSubmit` and
`CaptureSeed` gain the field. `src/testing/fakes.ts` `makeTask` defaults
`notes: null`, and the one `Task` literal in the app —
`task.store.ts:476`'s optimistic row — gains it too, or the build breaks.

Nothing in the UI reads it yet; the app builds and the suite stays green.

### Phase 2. Capture

A muted `Add notes` button under the chip row in `capture.html`. Clicking it
reveals a plain `<textarea>`; the button carries `aria-expanded` and
`aria-controls`. The area starts expanded when `seed()` arrives with a non-null
note, so an edit never hides content that already exists.

Three behaviours, each easy to get wrong and each getting a test:

- **Notes never reach `parseCapture`.** A `#tag` or `!quick` typed into a note
  stays literal. The parser owns the task line and nothing else, and its
  extraction order (`BUILD-PLAN.md` §5.5) is not involved here at all.
- **Enter inserts a newline in the notes field.** On the task line Enter commits
  and Shift+Enter is the newline; in a multi-line field that mapping is wrong.
  Commit from inside notes is the Save button or Cmd/Ctrl+Enter.
- **Escape keeps one meaning**: cancel the capture. It does not collapse the
  notes area first. A key that means two things depending on focus is worse than
  a key that means one.

No mirror div and no highlighting. That machinery exists for the task line's
token highlighting, and a note has no tokens. The `leading-6` exception
documented on the capture box does not extend to this field.

### Phase 3. Store

`addFromCapture` carries `notes` into the optimistic row and the insert.
`editFromCapture` puts it in the `Partial<Task>` patch.

**The offline queue needs no change**, and this is the concrete reason the
column beat a `task_notes` table. An edit is already
`{ op: 'update'; id; patch: Partial<Task> }`; an add is already
`{ op: 'insert'; row: Task }`, which takes the row whole. A second table would
have needed a new op in the one file in this repo with a data-loss bug in its
history.

### Phase 4. Read surfaces

`task-detail.html`: the note renders under the chips in the non-editing branch,
`whitespace-pre-wrap` so line breaks survive. Interpolated, therefore escaped —
plain text in, plain text out, no `innerHTML` anywhere near it.

`task-row.html`: a small muted glyph in the existing chip row when
`notes !== null`. It carries meaning rather than decoration, so it gets an
`aria-label` and not `aria-hidden`. Being inline in the chip row, it changes no
row height, which keeps it clear of the swipe action layer underneath and of the
view-transition re-sort.

### Phase 5. Tests

| File | Covers |
|---|---|
| `capture.spec.ts` | expands on click; starts expanded when seeded with a note; Enter is a newline and does not commit; a `#tag` in a note survives as text; empty commits as `null` |
| `task.store.spec.ts` | `addFromCapture` carries notes; `editFromCapture` patches them; whitespace-only collapses to `null` |
| `task-detail.spec.ts` | renders a note; preserves line breaks; renders nothing when null |
| `task-row.spec.ts` | glyph present when a note exists, absent when not, and labelled |

### Phase 6. Docs

- `BUILD-PLAN.md` §6 — the `tasks` DDL gains the column.
- `BUILD-PLAN.md` §5 — a feature entry, with its state.
- `BUILD-PLAN.md` §9 — the decision: a column not a table, and the note-is-not-a-comment
  distinction from §7 below.
- `BUILD-PLAN.md` §5.5 — one line that notes are not parsed.
- This file's status line flips to complete, and the file is frozen.

## 6. Deliberately not doing

Markdown. Attachments. A character limit. Notes in the digest email. Notes in
search or any filter. A per-note timestamp, author or history. Notes on the
Today row beyond the glyph — first-line previews make rows two-line and
variable-height, which fights both the swipe layer and the re-sort.

## 7. The distinction to record

`BUILD-PLAN.md` §9 requires that anything drawn from the Todoist captures is
either an explicit reversal or a recorded distinction. This is the latter.

Todoist's comments are a thread: many entries, each timestamped and authored,
attached to a task. That is the projects → sections → tasks → subtasks structure
§9 sorts as Reject, and the reasoning holds — a day-book does not need a
discussion per task, because there is one person and the unit of time is a day.

A note is the other thing: one body of standing detail that belongs to the task
the way its text does. You overwrite it, you do not append to it. It needs no
table, no ordering, no author and no timestamp, and the absence of all four is
what keeps it on the right side of the line.

The append-only log was considered and rejected at the design stage on 18 Sep.
It is the better fit for "why does this keep being carried", but it is also
exactly the shape §9 rejects, and `carried_over_count` plus `reschedule_count`
already answer that question numerically.

## 8. Risks

- **Two write paths into one field.** Only one exists by design — `Capture` —
  but the detail page displays the note outside `Capture`, so a future
  click-to-edit on that display would create a second. It should not be added
  without reading this line first.
- **A long note on the detail page.** No limit means a pathological note makes a
  tall card. Acceptable: the card already scrolls with the page and a note is
  typed by the one person who reads it.
- **The glyph competing with the chip row.** `task-row.html` already carries
  time, category and energy chips. The glyph must read as quieter than all
  three, or it becomes the loudest thing on a row for the least important
  reason.
