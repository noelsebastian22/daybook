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

| Pile       | Meaning                                                                                      |
| ---------- | -------------------------------------------------------------------------------------------- |
| **Steal**  | Capture, feedback and motion ideas. Fair game, no plan change needed beyond a feature entry. |
| **Adapt**  | Right idea, wrong shape for a day-book. Note what changes.                                   |
| **Reject** | Project-management structure. Say why, so it does not get re-proposed in three months.       |

## Naming

Name for what to steal, not what the screen is. `todoist-quick-add.png` means nothing
cold; `quick-add--date-chip-inline.png` does.

```
<area>--<specific thing>.<ext>
```

Areas: `quick-add`, `list`, `task-detail`, `scheduling`, `complete`, `swipe`,
`empty`, `settings`, `upcoming`, `nav`, `auth`.

Stills are `.png`, recordings `.mov` or `.gif`. Compress stills before committing — a
dozen untouched retina screenshots will outweigh the source.

Everything in here was renamed to this convention on 18 Aug. The originals were named
after the screen (`Screen1 - today tab selected.png`), which is exactly the failure the
convention exists to prevent — it tells you where the shot was taken and not one thing
about why it was kept.

### Reading the recordings

An agent cannot play a `.mov`. Extract frames first:

```bash
ffmpeg -v error -i quick-add--composer-to-toast.mov -vf "fps=1,scale=1350:-1" /tmp/f_%02d.png
```

`fps=1` is right for a 15–20s workflow. Use `fps=2` for anything under 5s or the whole
recording lands in three frames. Scale down — full retina frames burn context for no
extra detail.

## Stills vs recordings

Capture as a **recording** anything being judged on timing, and as a **still** anything
being judged on layout. What separates Todoist from a CRUD list is how things move; a
still cannot carry that, and the motion items below are exactly the ones Daybook has
open in Phase 3.

---

## Shot list

Ordered by what Daybook most needs. Items marked ★ map to something already pending in
`BUILD-PLAN.md` §4.

**Status as of 18 Aug.** Ten captures are in. What they cover, against this list:

| Section | State |
|---|---|
| 1. Quick add | **covered** by `quick-add--composer-to-toast.mov` — resting state, parsing, chips and the post-submit toast in one recording |
| 2. Completion | **not captured** — needs the phone app |
| 3. Swipe | **not captured** — needs the phone app |
| 4. Task detail | **covered** by `task-detail--inline-edit.png`. Todoist's answer is an inline row editor, not a detail page |
| 5. Scheduling | **half** — `scheduling--date-picker.png` is in; overdue handling is visible in `list--today-with-drawer.png` and already Rejected below |
| 6. List and density | **covered** by `list--today-with-drawer.png` and `upcoming--week-grouped-by-day.png` |
| 7. Empty states | not captured, still Phase 6 |
| 8. Settings | **covered** by `settings--modal-account.png` and `nav--account-menu.png` |
| — | also captured, not on the original list: `nav--mobile-drawer.mov`, `nav--filters-and-labels.png`, `auth--login-split.png` |

**Sections 2 and 3 are blocked on the wrong device.** Both are judged on touch timing,
and everything captured so far is the web app in Chrome — `nav--mobile-drawer.mov` is a
narrowed desktop window, not a phone. Completion choreography and swipe thresholds
cannot be read off a mouse. Capture those two from the Todoist **iOS app** before any
Phase 3 motion work starts.

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
### `<area>--<thing>.png`

**What it does** — the mechanism, not the screen. One or two lines.
**Daybook today** — what ours does instead, naming the file if known.
**Verdict** — Steal / Adapt / Reject, and why in one line.
**If adopted** — the BUILD-PLAN section it would change.
```

The template was overwritten with the body of the Login page entry at some point on
18 Aug and restored here. If you are editing an annotation, edit the entry below, not
the fenced block.

Noel's annotations are kept verbatim. Anything added afterwards is marked
**Read —** and is a second opinion, not a correction.

<!-- annotations below, newest first -->

### `auth--login-split.png`

**What it does** — It has the login options on the left and an image to the right ,which looks clean.
**Read —** The split is the whole idea: providers stacked left, one tall product image right, and the copy under it selling a single feature. It also remembers the last provider used ("You used **Google** last time.") above the buttons, which removes the only real decision on the screen.
**Daybook today** — `features/auth/login.ts` is a single centred card, Google button plus magic-link field, no imagery.
**Verdict** — **Steal.** §5.4 already asks for a "premium-feeling login screen" and this is the cheapest shape that delivers it. The right-hand panel is also where the §6 AI-generated hero illustration goes, so it costs one layout change and fills an existing hole.
**If adopted** — §5.3 Login stays "done" but §5.4 and Phase 6 gain a defined slot for the artwork. Skip the last-provider hint until there is more than one provider worth remembering.

### `list--today-with-drawer.png`

**What it does** — It had the drawer open and today tab selected and in the available screen we ncan see the title Today, we can ignore the overduve and date sections we can just have todays tasks listed there. We can also adopt the Add task button at the bottom there.
**Daybook today** — We dont have a drawer and we diosplay the add task ionput all the time with tasks underneath.
**Verdict** — Steal as this design looks more professional and descriptive.,
**Read —** Two separate things here, and they land differently. The **drawer** (Today / Upcoming / Filters & Labels / Reporting, then a project list) is Steal as Noel says — Daybook has no navigation at all and needs somewhere to put the Phase 4 calendar and Phase 5 weekly review. The **overdue bucket with a bulk `Reschedule` link** is Reject, and it is the sharpest disagreement in the whole folder: Todoist parks slipped work in a permanent bucket you clear by hand, Daybook rolls it forward automatically and counts the slip. That count is the product. Noel's "we can ignore the overdue section" is the right call for exactly that reason.
**If adopted** — §5.3 gains a nav shell. Recorded in §9 as two decisions: the drawer, and the overdue rejection.

### `task-detail--inline-edit.png`

**What it does** — This shows waht will happen when the user clicks on the edity button at the right end of each list, the item itself become editable and below there will be clickable pills for date and category in the right end there is cancel/save button.
**Daybook today** — We dont have edit or delete as of now.
**Verdict** — Steal.
**Read —** The row does not open a form. It is replaced in place by the same composer used to add a task: one text field, the same chip row underneath, cancel and commit on the right. Daybook already has that component — `features/today/capture.ts`. Edit is that component rendered in the row's slot with the task's values loaded, not a second UI.
**If adopted** — §4 Phase 3 "Delete and edit a task", which is currently the item blocking daily use. Recorded in §9.

### `scheduling--date-picker.png`

**What it does** — This shows what will happen when the iser click on the date pill while editing the task , a cl;endar will be opened, with Today, Tomnorrow or this weekend option and under it there is a claendar if we need to reschedule it to a later date.
**Verdict** — Adapt.
**Daybook today** — No picker at all. The only reschedule control is the one-day push button on the row, and the date preview in capture is a read-only span (`capture.ts:69`).
**Read —** Adapt, and the adaptation is subtraction. Steal the shape: a shortcut row with each option's **resolved day printed beside it** (Today · Mon, Tomorrow · Tue, This weekend · Sat, Next week · Mon 24 Aug), over a scrolling month grid. That resolved day is the detail worth copying — it makes the shortcut checkable before you commit to it. Drop two things: **"No Date"**, which §10 has already rejected because `scheduled_date` is required, and **"Repeat"**, which has no column in the data model and no phase. Keep the time field: `reminder_at` exists and is currently unreachable from the UI.
**If adopted** — §9 for the two omissions. One picker serves capture, edit and reschedule-from-a-row, so it is worth building before the edit UI rather than after.

### `upcoming--week-grouped-by-day.png`

**What it does** — The upcoming shows a calendar view with all the tasks we have decided against each date and this calendar is navigatable to the future. If we want to add a task on a particular date we can use the add task in that date row to add the task.
**Verdict** — Steal.
**Daybook today** — A collapsed 7-day strip at the bottom of Today. No route, no navigation beyond the week, no way to add into a specific day.
**Read —** The two details that earn this its Steal are the **per-day `+ Add task` row**, which schedules by position instead of by typing a date, and the **week strip across the top** that pages forward. Note it is a list grouped by day header, not a grid — the grid is Phase 4's calendar and this does not replace it.
**If adopted** — §5.3 gains an Upcoming page. Open question for Noel: what happens to the strip on Today once Upcoming is a route of its own — stay, go, or shrink to a peek.

### `nav--filters-and-labels.png`

**What it does** — I thought we could use it to display our categories/tags, I leave it to you to decide.
**Verdict** — Adapt.
**Read —** Recommend **not building this page.** Roughly 80% of it is saved filters — Priority 1–4, Assigned to me, Assigned to others, No due date — and every one of those is Reject: priorities are not in the data model, assignment needs a second user, and "No due date" is the §10 someday bucket by another name. The real parallel to Daybook's categories is the `#Personal #Shopping #Work` list in the sidebar of the same screenshot, not this page. Categories also self-create from `#tags`, so there is nothing to create here and only the occasional stray to delete — which belongs in Settings next to the other management, not on a route of its own.
**If adopted** — nothing. Category management lands in the Settings modal; the sidebar list is part of the nav shell.

### `nav--account-menu.png`

**What it does** — The dropdown when clicked on the account name and image on the top left, on top of the drawer shows a drop down with several options like settings, logout etc. we could keeop it and add other admin options later on, for now we can keep the settings and logout and other options if available. I have added a red rectangle to highlight the piece
**Verdict** — Adapt.
**Read —** Agreed, and the adaptation is mostly deletion — Add a team, Try Pro, Print, What's new and Changelog are all Reject for a single-user personal app. What is left is Settings and Log out, which is enough to justify the menu. Worth stealing from the top row: it shows **`0/5 tasks`** under the account name, a completion count for the day sitting in the chrome rather than in the page. Daybook has that number already.
**If adopted** — §5.3, as part of the nav shell rather than a page of its own.

### `settings--modal-account.png`

**What it does** — The settings modal which open when clicked on the settings from the account dropdown. contains the options to change image, email/ password. Think how we can use this
**Verdict** — Adapt.
**Daybook today** — §4 Phase 5 and §5.3 both specify Settings as a *page*. Nothing is built.
**Read —** The thing to take is that it is a **modal, not a route** — left rail of sections, right pane of content, closes back to wherever you were. For an installed PWA that is the better shape: no URL to deep-link, no ambiguity about where the back button goes, and no full-page navigation away from the day. Recommend reversing §5.3's "Settings page" to a modal. Of Todoist's fourteen panes Daybook needs three: Account (email, sign out), General (timezone, which nothing reads yet), and Digest (`digest_enabled`, `digest_send_at`) — plus category management, which is where the Filters & Labels question above resolves to.
**If adopted** — §5.3 Settings changes from page to modal, §4 Phase 5. **Open for Noel.**

### `quick-add--composer-to-toast.mov`

**What it does** — This video contain the workflow of adding the task. on clicking add task open a floating input, we can use this for all add tasks I believe. this. contains the option to add or cancel the adding process, once the task is added the toas message is displayed and the task is added to the appropriate places
**Verdict** — Adapt.
**Read —** The highest-value capture in the folder. Four things, frame by frame at `fps=1`:

1. **The composer floats and is invoked**, not always present. Opens from the `Add task` button, overlays the list, has explicit cancel (`×`) and commit (`↑`). This reverses Daybook's always-visible box at `today.ts:45`.
2. **The date chip is there before you type anything** — it reads `Today ×` on open (frame 4) and becomes `Tomorrow 16:00 ×` as the text is typed (frame 12). Daybook's equivalent only appears once a date is recognised and cannot be clicked. Since `scheduled_date` is required, showing the default up front and letting it be corrected is simply more honest about what is going to happen.
3. **A time in the text adds a second chip**, `At time of task` — the reminder, surfaced as its own object. Daybook parses `reminder_at` in `parse-capture.ts` and renders nothing for it, which is why feature 7 reads "parsed and stored, never fires".
4. **The toast names the destination and links it** (frame 15): a dark pill bottom-left, `Task added to Inbox · Open · ×`, where Inbox is a link and Open jumps to the task. That is precisely the fix for the bug found in real use on 18 Aug. Daybook's version says the day instead of the project — "Added to Friday 21 Aug" — because the day is what the user cannot see.

**If adopted** — §4 Phase 3 "Confirm that a task was added" and §12. The floating composer supersedes the Magic Plus FAB; recorded in §9 and §10.

### `nav--mobile-drawer.mov`

**What it does** — This video shows how the drawer open on a mobile screen, I feel we can use this
**Verdict** — Adapt.
**Read —** Agreed — same nav model on both widths, which is one component instead of two. **Caveat, and it is load-bearing: it must open from the button only, never from a left-edge swipe.** Phase 3 puts swipe-left-to-reschedule on every task row, and a left-edge drawer gesture competes with it directly on the exact pixels where rows start. Todoist's own recording here is button-driven, so nothing is lost by copying it as-is.
**Caveat on the capture itself** — this is a narrowed desktop window, not a phone. Fine for judging the drawer's layout and scrim, useless for touch timing. See the note under the shot list.
**If adopted** — §5.3, alongside the desktop drawer. Recorded in §9.
