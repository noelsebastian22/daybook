# Todoist reference captures

Screens and recordings from Todoist, kept as a reference for aligning Daybook's UX.
Committed on purpose: Cowork, Claude Code and Command Code all need to see them, and a
folder on one machine is invisible to the other two.

**This is a reference, not a spec.** Nothing in here is a decision. A capture becomes a
decision only when it lands in `BUILD-PLAN.md` §5 as a feature, or §9 as a decision. If
something here contradicts §10 (out of scope), it needs a conscious reversal recorded in
§9 — not a quiet implementation.

## The premise guard

Todoist is a project manager. Its IA is projects → sections → tasks → subtasks, with
P1–P4 priorities, labels, saved filters and karma. Daybook is a day-book: one day at a
time, every task carries a `scheduled_date`, incomplete work rolls forward and the count
of days it slipped is the point.

`BUILD-PLAN.md` §10 has already rejected two things Todoist does well, and both
rejections are load-bearing:

- **Board / kanban views** — pull the app toward a project tracker, and every extra
  column is somewhere tasks sit for weeks.
- **An undated "someday" bucket** — `scheduled_date` is required so capture forces a
  decision. Friction by design.

So for each capture, sort it into one of three piles:

| Pile | Meaning |
|---|---|
| **Steal** | Capture, feedback and motion ideas. Fair game, no plan change needed beyond a feature entry. |
| **Adapt** | Right idea, wrong shape for a day-book. Note what changes. |
| **Reject** | Project-management structure. Say why, so it does not get re-proposed in three months. |

## Naming

Name for what to steal, not what the screen is. `todoist-quick-add.png` means nothing
cold; `quick-add--date-chip-inline.png` does.

```
<area>--<specific thing>.<ext>
```

Areas: `quick-add`, `list`, `task-detail`, `scheduling`, `complete`, `swipe`,
`empty`, `settings`, `upcoming`.

Stills are `.png`, recordings `.mov` or `.gif`. Compress stills before committing — a
dozen untouched retina screenshots will outweigh the source.

## Stills vs recordings

Capture as a **recording** anything being judged on timing, and as a **still** anything
being judged on layout. What separates Todoist from a CRUD list is how things move; a
still cannot carry that, and the motion items below are exactly the ones Daybook has
open in Phase 3.

---

## Shot list

Ordered by what Daybook most needs. Items marked ★ map to something already pending in
`BUILD-PLAN.md` §4.

### 1. Quick add ★ — Daybook's closest sibling

Daybook already borrowed natural-language capture from here, so this is comparison
rather than discovery. Wanted:

- `quick-add--empty.png` — the resting state of the add field.
- `quick-add--parsing-date.png` — mid-typing, a date being recognised. Daybook renders
  a read-only preview line; Todoist makes the parsed date a **tappable chip you can
  correct without retyping**. That difference is the reason to shoot this.
- `quick-add--unrecognised-date.png` — type something ambiguous. What happens when the
  parser is unsure is the interesting half, and Daybook currently just silently
  defaults to today.
- `quick-add--after-submit.mov` — **the highest-value capture in this list.** Where the
  task goes, what confirms it, what happens when it was scheduled for a day that is not
  on screen. This is the bug found on 18 Aug: Daybook clears the box and the task
  vanishes into a collapsed strip with no acknowledgement.

### 2. Completion ★ — Phase 3 choreography

- `complete--checkbox-to-gone.mov` — checkbox fill, strike, dim, row leave, gap close,
  and the timing between each. Daybook has the keyframe and no row-leave.
- `complete--undo.png` — the undo affordance and how long it lingers.

### 3. Swipe ★ — Phase 3, mobile only

- `swipe--right-to-complete.mov` and `swipe--left-to-reschedule.mov`. Watch for
  resistance, the threshold at which it commits, and what shows behind the row.

### 4. Task detail ★ — Phase 3 task-as-object

Daybook's router has `withViewTransitions()` configured and nothing using it.

- `task-detail--open.png` — what a task expands into, and which fields earn a place.
- `task-detail--edit-title.png` — **Daybook has no edit UI at all**, so this one
  informs work that is currently unplanned and blocking daily use.
- `task-detail--transition.mov` — how the list behaves while the card is open.

### 5. Scheduling and rescheduling ★

- `scheduling--date-picker.png` — the shortcut row (Today / Tomorrow / Next week) above
  the calendar. Daybook's only reschedule control is a one-day push button.
- `scheduling--overdue-handling.png` — how overdue work is presented and what bulk
  action is offered. Daybook rolls it forward automatically and counts the slip; worth
  seeing the alternative before assuming ours is better.

### 6. List and density

- `list--populated.png` — row height, how metadata (category, priority, date) sits
  without crowding the title. Daybook stacks chips under the title.
- `list--grouped-by-day.png` — day headers in the upcoming view, for comparison with
  Daybook's `FRI 21 AUG` group header.
- `list--overdue-vs-today.png` — how the boundary between overdue and today is drawn.

### 7. Empty states

- `empty--all-done.png` and `empty--no-tasks-yet.png`. Phase 6, but cheap to capture
  while you are in there.

### 8. Settings — capture last, judge hardest

Most of Todoist's settings exist to serve features Daybook does not have. Useful only
for the shape of the page. `settings--overview.png` is enough; do not shoot every pane.

---

## Annotations

One section per capture, added as you go. A capture with no annotation is ambiguous a
month later and worse than nothing, because it looks like it was considered.

Template:

```markdown
### `quick-add--date-chip-inline.png`

**What it does** — one or two sentences, mechanical, no praise.
**Daybook today** — what ours does instead, naming the file if known.
**Verdict** — Steal / Adapt / Reject, and why in one line.
**If adopted** — the BUILD-PLAN section it would change.
```

<!-- annotations below, newest first -->
