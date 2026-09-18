# Task Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a task one body of free-text notes, typed inside the capture box behind a collapsed affordance, read on the detail page, and marked with a glyph on the row.

**Architecture:** A single nullable `notes text` column on `tasks`. Notes are carried by the existing `Capture` component, so adding and editing are the same code path, and by the existing `update()` / `insert` store paths, so the offline queue needs no new operation. Notes never pass through `parseCapture`.

**Tech Stack:** Angular 22 standalone + zoneless, NgRx SignalStore, Supabase Postgres, Tailwind v4, Vitest via `@angular/build:unit-test`.

**Spec:** [`docs/NOTES-PLAN.md`](../NOTES-PLAN.md)

## Global Constraints

Copied from `AGENTS.md` and the spec. Every task is held to all of these.

- **No `any`.** TypeScript everywhere; rows typed against `src/app/core/models.ts`.
- **No `NgModule`, no `*ngIf` / `*ngFor`.** Built-in control flow only (`@if`, `@for`).
- **`ChangeDetectionStrategy.OnPush`** without exception; `input()` / `output()` functions; `inject()` not constructor injection.
- **Templates live in a sibling `.html` file.** Never an inline `template:` — a single backtick inside one closes the literal and the compiler blames the wrong line.
- **No component stylesheets.** The app has none and must keep none.
- **Spacing is 1, 2, 3, 4, 6, 8 only.** No fractional steps in new markup — there are already 41 outstanding and this must not add a 42nd.
- **Semantic colour tokens only** — `bg-surface`, `text-text-muted`, `text-text-subtle`, `bg-hover-strong`, `border-border-soft`. Never `bg-white`, never a raw palette shade for a surface, text or border.
- **Type steps only** — `text-caption` 12px, `text-body` 14px, `text-task` 15px, `text-subtitle` 16px. Never `text-sm` / `text-xs`.
- **Radii**: `rounded-control` 6px, `rounded-card` 12px, `rounded-panel` 16px. Never `rounded-lg`.
- **Never assert on a Tailwind class string** in a test. Assert on text, ARIA, state and calls.
- **`await` every interaction in a spec.** The app is zoneless; a click without an await reads the DOM as it was before the click.
- **Every mutation is optimistic**: patch the store first, call Supabase after, roll back and toast on failure.
- Run the suite with `npx ng test --watch=false`.

---

### Task 1: Schema and types

Adds the column and the field, with nothing reading it yet. The app must build and the whole suite stay green at the end of this task.

**Files:**
- Create: `supabase/migrations/0006_task_notes.sql`
- Modify: `src/app/core/models.ts` (the `Task` interface, and the `push_subscription` doc comment)
- Modify: `src/app/core/task.store.ts:476` (the optimistic `Task` literal)
- Modify: `src/testing/fakes.ts` (`makeTask`)

**Interfaces:**
- Consumes: nothing.
- Produces: `Task.notes: string | null`, present on every `Task` in the app and on `makeTask()` output.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0006_task_notes.sql`:

```sql
-- One body of standing detail per task.
--
-- A column rather than a task_notes table: an edit is then already a
-- Partial<Task> patch and an add already carries the row whole, so the offline
-- queue needs no new operation. A note is overwritten, never appended to, so
-- there is nothing to order, author or timestamp. See docs/NOTES-PLAN.md §7.
--
-- No RLS change. The existing `for all to authenticated` policy on tasks has
-- `auth.uid() = user_id` in both `using` and `with check`, which covers every
-- column including this one. No index: notes are never filtered or searched,
-- only read alongside a row that has already been fetched.
alter table tasks add column notes text;
```

- [ ] **Step 2: Add the field to `Task`**

In `src/app/core/models.ts`, inside `interface Task`, after `reminder_at`:

```ts
  /** Standing detail. Null means none — never an empty string. */
  notes: string | null;
```

- [ ] **Step 3: Reword the `push_subscription` comment**

`0006` is taken by this work, so the promise in `models.ts` that names it is now wrong. Change the last sentence of that `@deprecated` block from:

```
   * it. Still on the table as the rollback path; dropped in migration 0006.
   * Nothing reads it.
```

to:

```
   * it. Still on the table as the rollback path; dropped in a later
   * migration. Nothing reads it.
```

- [ ] **Step 4: Keep the build compiling**

`task.store.ts:476` builds the only `Task` literal in the app. Add `notes: null,` to it, after `reminder_at`. Task 3 replaces this with the real value; without it the build fails on a missing property.

- [ ] **Step 5: Default the fixture**

In `src/testing/fakes.ts`, inside `makeTask`'s returned object, after `reminder_at: null,`:

```ts
    notes: null,
```

- [ ] **Step 6: Verify the build and the suite**

Run: `npx ng build 2>&1 | tail -5`
Expected: build succeeds.

Run: `npx ng test --watch=false 2>&1 | tail -5`
Expected: all existing tests pass, count unchanged from before this task.

- [ ] **Step 7: Apply the migration to the live project**

Use the Supabase MCP `apply_migration` against project `zzacswfongmzpnhcjiqp`, name `daybook_task_notes`, with the SQL from Step 1. Then confirm with `list_migrations` that it appears — live goes from 7 migrations to 8.

The schema half goes first, deliberately. `BUILD-PLAN.md` §4 "the cost of the gap" records eight days where the client was deployed against objects that did not exist.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0006_task_notes.sql src/app/core/models.ts src/app/core/task.store.ts src/testing/fakes.ts
git commit -m "feat: add a notes column to tasks"
```

---

### Task 2: The notes field in Capture

The affordance and the textarea. `Capture` is used by the composer to add and by the detail page to edit, so this one change serves both.

**Files:**
- Modify: `src/app/features/today/capture.ts` (`CaptureSubmit`, `CaptureSeed`, new state, `commit()`, `onKeydown()`)
- Modify: `src/app/features/today/capture.html` (the affordance and the textarea)
- Test: `src/app/features/today/capture.spec.ts`

**Interfaces:**
- Consumes: `Task.notes` from Task 1.
- Produces: `CaptureSubmit { text: string; scheduling: Scheduling | null; notes: string | null }` and `CaptureSeed { text: string; scheduling: Scheduling | null; notes: string | null }`. Task 3 reads `notes` off the submit; Task 4's detail page passes `notes` into the seed.

- [ ] **Step 1: Write the failing tests**

Append to `src/app/features/today/capture.spec.ts`. This file has **no testing-library** — it uses the repo's own `render.ts`, and the local helpers `renderCapture(inputs, categories)`, `type(box, text)` and `press(box, key, shiftKey)` are already defined at the top of it. Reuse them; do not add a second render helper.

Two new local helpers go beside the existing ones:

```ts
/** The notes textarea, or null when the field has not been opened. */
function notesBox(box: Rendered<Capture>): HTMLTextAreaElement | null {
  return box.query('#capture-notes') as HTMLTextAreaElement | null;
}

async function typeNote(box: Rendered<Capture>, text: string): Promise<void> {
  const area = notesBox(box);
  if (!area) throw new Error('notes field is not open');
  area.value = text;
  area.dispatchEvent(new Event('input', { bubbles: true }));
  await box.settle();
}
```

Note that the existing `type()` and `press()` both reach for `box.query('textarea')`, which is the **first** textarea in the DOM — the task line. The notes field is added after it in the template, so every existing test keeps working untouched. Do not reorder them.

```ts
describe('notes', () => {
  it('hides the notes field until the affordance is clicked', async () => {
    const box = await renderCapture();
    expect(notesBox(box)).toBeNull();

    await box.click(addNotes(box));

    expect(notesBox(box)).not.toBeNull();
  });

  it('starts expanded when seeded with a note', async () => {
    const box = await renderCapture({
      seed: { text: 'call physio', scheduling: null, notes: 'Suite 4' },
    });

    expect(notesBox(box)?.value).toBe('Suite 4');
  });

  it('emits the note with the submission', async () => {
    const submitted = vi.fn();
    const box = await renderCapture();
    box.component.submitted.subscribe(submitted);

    await type(box, 'call physio');
    await box.click(addNotes(box));
    await typeNote(box, 'Suite 4');
    await press(box, 'Enter');

    expect(submitted).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'call physio', notes: 'Suite 4' }),
    );
  });

  it('emits null for a whitespace-only note', async () => {
    const submitted = vi.fn();
    const box = await renderCapture();
    box.component.submitted.subscribe(submitted);

    await type(box, 'call physio');
    await box.click(addNotes(box));
    await typeNote(box, '   ');
    await press(box, 'Enter');

    expect(submitted).toHaveBeenCalledWith(expect.objectContaining({ notes: null }));
  });

  it('does not parse tokens inside a note', async () => {
    const submitted = vi.fn();
    const box = await renderCapture();
    box.component.submitted.subscribe(submitted);

    await type(box, 'call physio');
    await box.click(addNotes(box));
    await typeNote(box, 'ask about #physio !quick');
    await press(box, 'Enter');

    // The note is literal text. The task line owns the tokens, so the task
    // keeps its own text and the note keeps its hash and bang verbatim.
    expect(submitted).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'call physio',
        notes: 'ask about #physio !quick',
      }),
    );
  });

  it('treats Enter in the notes field as a newline, not a commit', async () => {
    const submitted = vi.fn();
    const box = await renderCapture();
    box.component.submitted.subscribe(submitted);

    await type(box, 'call physio');
    await box.click(addNotes(box));

    const area = notesBox(box) as HTMLTextAreaElement;
    area.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await box.settle();

    expect(submitted).not.toHaveBeenCalled();
  });

  it('commits from the notes field on Cmd+Enter', async () => {
    const submitted = vi.fn();
    const box = await renderCapture();
    box.component.submitted.subscribe(submitted);

    await type(box, 'call physio');
    await box.click(addNotes(box));
    await typeNote(box, 'Suite 4');

    const area = notesBox(box) as HTMLTextAreaElement;
    area.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }),
    );
    await box.settle();

    expect(submitted).toHaveBeenCalledWith(expect.objectContaining({ notes: 'Suite 4' }));
  });
});
```

and the helper that finds the affordance, beside `chipByLabel`:

```ts
function addNotes(box: Rendered<Capture>): HTMLElement {
  const found = box.queryAll('button').find((b) => (b.textContent ?? '').trim() === 'Add notes');
  if (!found) throw new Error('no Add notes button');
  return found;
}
```

**The Enter-is-a-newline test asserts only that nothing was committed**, not that the textarea now holds a newline. jsdom does not insert characters for a dispatched `KeyboardEvent` — the browser does that, not the event — so asserting on the value would test jsdom rather than the app. The real guarantee is that the handler did not commit, and that is what is asserted.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx ng test --watch=false 2>&1 | tail -20`
Expected: the seven new tests fail — no `Add notes` button exists, and `CaptureSubmit` has no `notes`.

- [ ] **Step 3: Extend the two interfaces**

In `src/app/features/today/capture.ts`:

```ts
export interface CaptureSubmit {
  text: string;
  /** Set only when the picker was used. Null means the text speaks for itself. */
  scheduling: Scheduling | null;
  /** Standing detail. Trimmed; empty becomes null. */
  notes: string | null;
}
```

```ts
export interface CaptureSeed {
  text: string;
  scheduling: Scheduling | null;
  notes: string | null;
}
```

- [ ] **Step 4: Add the state**

In the `Capture` class, beside `value`:

```ts
  protected readonly notes = linkedSignal(() => this.seed()?.notes ?? '');

  /**
   * Whether the notes field is showing. Seeded open when the task already has
   * a note, so an edit never hides content that exists. Once open it stays
   * open for the life of the box — collapsing it under the user mid-thought
   * would be worse than a slightly taller card.
   */
  protected readonly notesOpen = linkedSignal(() => !!this.seed()?.notes);
```

`linkedSignal` is already imported in this file for `value`.

- [ ] **Step 5: Carry the note through `commit()`**

In `commit()`, extend the emitted object. The existing body reads `const text = this.value().trim();` — add beneath it:

```ts
    const notes = this.notes().trim();
```

and add to the `submitted.emit({ … })` payload, after `scheduling`:

```ts
      notes: notes || null,
```

Then, in the block that blanks the box for a fresh add (guarded by `if (this.seed()) return;`), reset the field too:

```ts
    this.notes.set('');
    this.notesOpen.set(false);
```

- [ ] **Step 6: Add the handlers**

```ts
  protected onNotesInput(event: Event): void {
    this.notes.set((event.target as HTMLTextAreaElement).value);
  }

  /**
   * Enter is a newline here, unlike the task line where it commits — this is a
   * multi-line field and that mapping would make it unusable. Cmd/Ctrl+Enter
   * commits, so the keyboard path out of the field does not require the mouse.
   *
   * Escape is deliberately not handled: it bubbles to onKeydown on the box,
   * which cancels the whole capture. A key that means two things depending on
   * which field has focus is worse than a key that means one.
   */
  protected onNotesKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) return;
    event.preventDefault();
    this.commit();
  }

  protected openNotes(): void {
    this.notesOpen.set(true);
  }
```

- [ ] **Step 7: Add the markup**

In `src/app/features/today/capture.html`, between the closing `</div>` of the `#chipRow` div (line 271) and the closing `</div>` of the panel (line 272), insert:

```html
  <!--
    Progressive disclosure, so the add box keeps its current height. A note is
    usually written later than the task, so the affordance is quiet and the
    field costs nothing until it is asked for.
  -->
  @if (notesOpen()) {
    <div class="px-4 pb-3">
      <textarea
        id="capture-notes"
        rows="3"
        class="w-full resize-y rounded-control bg-surface-sunken px-3 py-2 text-body text-text outline-none placeholder:text-text-subtle"
        placeholder="Anything worth remembering"
        aria-label="Notes"
        [value]="notes()"
        (input)="onNotesInput($event)"
        (keydown)="onNotesKeydown($event)"
      ></textarea>
    </div>
  } @else {
    <div class="px-4 pb-3">
      <button
        type="button"
        class="rounded-control px-2 py-1 text-caption font-medium text-text-subtle transition hover:bg-hover-strong hover:text-text-muted"
        aria-expanded="false"
        aria-controls="capture-notes"
        (click)="openNotes()"
      >
        Add notes
      </button>
    </div>
  }
```

The button is replaced by the field rather than sitting beside it, so `aria-expanded` is always `"false"` while the button exists. That is honest — the control describes the state it is in — and it is why Step 1's first test asserts the textarea appears rather than watching an attribute flip on an element that has been removed.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx ng test --watch=false 2>&1 | tail -10`
Expected: all tests pass, seven more than before.

- [ ] **Step 9: Commit**

```bash
git add src/app/features/today/capture.ts src/app/features/today/capture.html src/app/features/today/capture.spec.ts
git commit -m "feat: a collapsed notes field in the capture box"
```

---

### Task 3: The store carries notes

**Files:**
- Modify: `src/app/core/task.store.ts` (`addFromCapture`, `editFromCapture`)
- Modify: `src/app/features/today/composer.ts` and `src/app/features/today/task-detail.ts` if either destructures `CaptureSubmit` field by field rather than passing it whole — check before editing.
- Test: `src/app/core/task.store.spec.ts`

**Interfaces:**
- Consumes: `CaptureSubmit.notes` from Task 2.
- Produces: `addFromCapture(input: string, scheduling: Scheduling | null, notes: string | null)` and `editFromCapture(task: Task, input: string, scheduling: Scheduling | null, notes: string | null)`. Both keep their existing leading parameters, so existing call sites that pass two arguments still compile — `notes` defaults to `null`.

- [ ] **Step 1: Write the failing tests**

Append to `src/app/core/task.store.spec.ts`. That file builds `store`, `db` and `session` in its own `beforeEach` — there is no per-test setup call. The idiom for reading what was sent is the existing local helper `argsFor(table, op)`, which returns the arguments of every matching chain step: `argsFor('tasks', 'insert')[0][0] as Task`. `seed(tasks)` puts rows in the store the way a real load would and clears the call log.

```ts
describe('notes', () => {
  it('carries a note into the inserted row', async () => {
    await store.addFromCapture('call physio', null, 'Suite 4');

    const sent = argsFor('tasks', 'insert')[0][0] as Task;
    expect(sent.text).toBe('call physio');
    expect(sent.notes).toBe('Suite 4');
  });

  it('inserts null when there is no note', async () => {
    await store.addFromCapture('call physio');

    const sent = argsFor('tasks', 'insert')[0][0] as Task;
    expect(sent.notes).toBeNull();
  });

  it('patches the note on an edit', async () => {
    const task = makeTask({ notes: null });
    await seed([task]);

    await store.editFromCapture(task, 'call physio', null, 'Suite 4');

    const patch = argsFor('tasks', 'update')[0][0] as Partial<Task>;
    expect(patch.notes).toBe('Suite 4');
  });

  it('clears a note back to null', async () => {
    const task = makeTask({ notes: 'Suite 4' });
    await seed([task]);

    await store.editFromCapture(task, 'call physio', null, null);

    const patch = argsFor('tasks', 'update')[0][0] as Partial<Task>;
    expect(patch.notes).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx ng test --watch=false 2>&1 | tail -20`
Expected: fails — `addFromCapture` takes two parameters.

- [ ] **Step 3: Thread it through `addFromCapture`**

Change the signature:

```ts
        async addFromCapture(
          input: string,
          scheduling: Scheduling | null = null,
          notes: string | null = null,
        ): Promise<boolean> {
```

and replace the `notes: null,` placed in the optimistic row by Task 1 with:

```ts
            notes,
```

- [ ] **Step 4: Thread it through `editFromCapture`**

```ts
        async editFromCapture(
          task: Task,
          input: string,
          scheduling: Scheduling | null = null,
          notes: string | null = null,
        ): Promise<boolean> {
```

and add `notes` to the `patch` object, after `reminder_at`:

```ts
            notes,
```

- [ ] **Step 5: Update the two call sites**

Find them with `grep -rn "FromCapture" src/app --include="*.ts"` — note the quotes, an unquoted `*.ts` is a zsh glob error. Each caller receives a `CaptureSubmit`; pass its `notes` through as the third argument.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx ng test --watch=false 2>&1 | tail -10`
Expected: all pass, four more than after Task 2.

- [ ] **Step 7: Commit**

```bash
git add src/app/core/task.store.ts src/app/core/task.store.spec.ts src/app/features/today
git commit -m "feat: carry notes through add and edit"
```

---

### Task 4: Read surfaces

**Files:**
- Modify: `src/app/features/today/task-detail.html` (display), `src/app/features/today/task-detail.ts` (the seed)
- Modify: `src/app/features/today/task-row.html` (the glyph)
- Test: `src/app/features/today/task-detail.spec.ts`, `src/app/features/today/task-row.spec.ts`

**Interfaces:**
- Consumes: `Task.notes` from Task 1, `CaptureSeed.notes` from Task 2.
- Produces: nothing further.

- [ ] **Step 1: Write the failing tests**

In `task-detail.spec.ts`. That file's `renderDetail(id)` takes **an id, not a task** — the task itself is put in the store first with the local `hold(...tasks)` helper, which fills the `byId` map and flips `loaded`.

```ts
it('shows the note and keeps its line breaks', async () => {
  const task = makeTask({ notes: 'Suite 4\n210 Crown St' });
  hold(task);

  const page = await renderDetail(task.id);

  const note = page.byText('p', 'Suite 4');
  expect(note).not.toBeNull();
  expect(note?.textContent).toContain('210 Crown St');
});

it('shows nothing when there is no note', async () => {
  const task = makeTask({ notes: null });
  hold(task);

  const page = await renderDetail(task.id);

  expect(page.byText('h2', 'Notes')).toBeNull();
});
```

In `task-row.spec.ts`, whose local helper is `renderRow(task, categories?)`:

```ts
it('marks a row that has a note', async () => {
  const row = await renderRow(makeTask({ notes: 'Suite 4' }));

  const mark = row.queryAll('[role="img"]').find(
    (n) => n.getAttribute('aria-label') === 'Has a note',
  );
  expect(mark).toBeDefined();
});

it('leaves a row without a note unmarked', async () => {
  const row = await renderRow(makeTask({ notes: null }));

  const mark = row.queryAll('[role="img"]').find(
    (n) => n.getAttribute('aria-label') === 'Has a note',
  );
  expect(mark).toBeUndefined();
});
```

Both assert on the ARIA label rather than on a selector or a class, per the repo rule that a spec pins behaviour and not spelling.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx ng test --watch=false 2>&1 | tail -20`
Expected: four failures.

- [ ] **Step 3: Display the note on the detail page**

In `task-detail.html`, between the chips `</div>` (line 101) and the history `<dl>` (line 104):

```html
        @if (t.notes; as notes) {
          <!--
            Interpolated, so it is escaped — plain text in, plain text out.
            whitespace-pre-wrap is what makes the line breaks the user typed
            survive; without it the note collapses to one paragraph.
          -->
          <div class="mt-4 border-t border-border-soft pt-4">
            <h2 class="text-caption font-medium text-text-subtle">Notes</h2>
            <p class="mt-1 text-body whitespace-pre-wrap text-text-muted">{{ notes }}</p>
          </div>
        }
```

- [ ] **Step 4: Seed the edit with the note**

In `task-detail.ts`, find the `seed()` computed that builds a `CaptureSeed` and add `notes: t.notes` to it, so opening Edit shows the existing note rather than dropping it.

Without this step an edit silently wipes every note, because `Capture` would emit `null` for a field it was never given. Verify it with the Task 3 clearing test still passing plus a manual read of the computed.

- [ ] **Step 5: Add the row glyph**

In `task-row.html`, inside the chip row `<div class="mt-2 flex flex-wrap items-center gap-2 text-caption">`, after the energy `@if` block (line 118):

```html
        @if (task().notes) {
          <!--
            Meaning, not decoration, so it is labelled rather than aria-hidden.
            Quieter than every chip beside it on purpose: a note is the least
            urgent thing a row can carry and must not out-shout the category,
            the energy or the carried stamp.
          -->
          <span class="text-text-subtle" role="img" aria-label="Has a note">
            <svg viewBox="0 0 16 16" fill="currentColor" class="h-3 w-3">
              <path d="M3 2.5A1.5 1.5 0 0 1 4.5 1h5.4L13 4.1v9.4a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13.5v-11Zm2.5 3a.75.75 0 0 0 0 1.5h5a.75.75 0 0 0 0-1.5h-5Zm0 3a.75.75 0 0 0 0 1.5h5a.75.75 0 0 0 0-1.5h-5Zm0 3a.75.75 0 0 0 0 1.5h3a.75.75 0 0 0 0-1.5h-3Z" />
            </svg>
          </span>
        }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx ng test --watch=false 2>&1 | tail -10`
Expected: all pass, four more than after Task 3.

- [ ] **Step 7: Check the bundle and the contrast**

Run: `npx ng build 2>&1 | tail -12` and record the initial bundle size — the `BUILD-PLAN.md` figure to compare against is 436.61 kB.

Run: `node tools/contrast-check.mjs`
Expected: green. The note text uses `text-text-muted`, which is already a measured pair.

- [ ] **Step 8: Commit**

```bash
git add src/app/features/today
git commit -m "feat: show notes on the detail page and mark the row"
```

---

### Task 5: Documentation

The repo's rule is that a change contradicting the docs updates them in the same body of work. Feature state lives in `BUILD-PLAN.md` and nowhere else.

**Files:**
- Modify: `BUILD-PLAN.md` (§5 Features, §5.5 Capture syntax, §6 Data model, §9 Decisions)
- Modify: `docs/NOTES-PLAN.md` (status line)

- [ ] **Step 1: Update the data model**

`BUILD-PLAN.md` §6, in the `tasks` DDL block, after `reminder_at`:

```
  notes              text,                   -- added 0006, one body of standing detail
```

- [ ] **Step 2: Add the feature entry**

`BUILD-PLAN.md` §5, as a new numbered feature, with its state set to built and the date.

- [ ] **Step 3: Note that capture does not parse notes**

`BUILD-PLAN.md` §5.5, after the parsing-order paragraph:

> Notes are not parsed. A `#tag` or `!quick` typed into the notes field stays literal text — the parser owns the task line and nothing else.

- [ ] **Step 4: Record the decision**

`BUILD-PLAN.md` §9, a new entry covering both halves: a column rather than a `task_notes` table because the offline queue then needs no new op, and the note-is-not-a-comment distinction from `docs/NOTES-PLAN.md` §7, which §9 requires for anything drawn from the Todoist captures.

- [ ] **Step 5: Freeze the plan file**

Change `docs/NOTES-PLAN.md`'s status line to complete with the date, per the convention `docs/RETHEME-PLAN.md` follows.

- [ ] **Step 6: Commit**

```bash
git add BUILD-PLAN.md docs/NOTES-PLAN.md
git commit -m "docs: task notes as built"
```

---

## Verification before calling this done

- [ ] `npx ng build` succeeds; initial bundle recorded and compared against 436.61 kB.
- [ ] `npx ng test --watch=false` passes; count is 697 + 15 = 712 (7 capture, 4 store, 2 detail, 2 row), or the difference is explained.
- [ ] `node tools/contrast-check.mjs` is green.
- [ ] `list_migrations` shows 8 live migrations.
- [ ] A note typed on a task survives a reload — the round trip, not just the optimistic patch.
- [ ] Editing a task that has a note does not wipe it. This is the one regression this feature can cause and it is invisible in the happy path.
