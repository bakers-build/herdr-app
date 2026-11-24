# Panel as the ticket work area Implementation Plan

**Spec:** `docs/superpowers/specs/2026-11-24-panel-work-area-design.md`; acceptance AC1–AC12 in the ticket's qualification handoff. Test plan T1–T17, F1–F3 in the ticket's test comment.

Execute with `executing-plans` or `subagent-driven-development`, test-first (`test-driven-development`). One commit per task, Conventional Commits, `feat(ticket): …`.

## Global Constraints

Layout and route ids never renamed (`panel`, `panel-body`, `ticket`, `run`, `run-header`, `run-terminal`, `ticket.context`, `ticket.run`); core names no module (`tests/architecture.test.ts`); Herdr runtime has no `structuredClone` in mods; coverage floor lines 92 %, functions 90 %.

### Task 0: base
`git merge --ff-only origin/next` (branch is at d96d150, two commits behind). `bun run check` green before any change.

### Task 1: selection replaces tabs (AC1, AC2)
Files: `ticket/tabs.js`, `ticket/view/list.js`, `ticket/view/commands.js`, `ticket/view/actions.js`, `ticket/form/create.js`, `ticket/store.js`, `ticket/window.js`, `ticket/register.js`, `ticket/presenter/teaser.js`.
- `selectTicket(id: string): void` in `ticket/tabs.js`: `setShared("bakers.selected", id)`, `run("layout.select", {stack: "panel-body", child: "ticket"})`, `run("layout.show", {id: "panel"})`. `selectedTicket(): string | null` reads it.
- Remove `openTicket`, `pinTicket`, `focusedTicket`, `openTicketIds`, `syncTicketNames`, `closeFinished`. `frontTicket()` = `selectedTicket()` when the Tickets tab is focused or `panel` is shown with `panel-body.active === "ticket"`, else null. Keep `closeAll` for leftovers.
- List: Enter, cmd-Enter, double-click → `selectTicket(r.id)`. `syncSelection(records)`: keep `shared("bakers.selected")` when set, even if not in `records`; first row only when it is null. Read the shared value into `this.selected` on each check. Menu: drop both "Close … ticket tabs" items.
- Palette ticket row, create `after`, `commands.open` → `selectTicket`.
- Store option `tabs: () => [selectedTicket()].filter(Boolean)`.
- `window.js`: on the first run per window `closeAll()`; drop `syncTicketNames`. `register.js`: drop `ticket.view` route, `tabs.closeFinished/closeAll` actions, the ticket-tab dot in `decorate` (keep the home label).
- Teaser hint: "Enter or a double click shows the ticket in the panel, N a new ticket, …".
Tests (`tests/ticket/tabs.test.ts`, `tests/ticket/view/list.test.ts`, `tests/ticket/commands.test.ts`, `tests/ticket/view/actions.test.ts`, `tests/ticket/form.test.ts`): T1–T4. Delete tests of removed functions.

### Task 2: `run` inside `panel` in the installed layout (AC4)
- `core/herdr.js`: `withoutNode(root: any, id: string): any` (JSON copy without that node; same tree when absent).
- `scripts/layout.js`: after the panel step, remove any `run` from `work-body` and append to `panel` (after `panel-body`) `{id: "run", type: "column", size: {weight: 1}, hidden: true, children: [run-header block 32 px, resizable false, view "ticket.run"]}`; set `panel-body.size = {weight: 1}`. Idempotent. Header comment updated.
Tests: `tests/core/herdr.test.ts`, `tests/install.test.ts` (T5).

### Task 3: the run follows the selection in the panel (AC4–AC8, AC10)
File `ticket/terminal.js`. Exports kept: `runTerminal`, `runReason`, `NO_TERMINAL`, `RUN`, `TERMINAL`, `syncRun(now?)`, `hideRun()`, `showAgent(id)`, `_resetForTests()`. New: `PANEL = "panel"`, `PANEL_BODY = "panel-body"`, `PANEL_PX = 368`, `RUN_PX = 480`. `showRun` folds into `showAgent`.
- `syncRun`: no `panel` or `panel-body` → return. `want` = null when `bakers.runHidden` or `panel-body.active !== "ticket"`, else `runTerminal(selectedTicket(), uuid)`.
- `layout.set` when (a) `run` missing or its parent is not `panel` (remove it with `withoutNode`, re-add after `panel-body`), or (b) `want` and `run-terminal` address ≠ `want.address`, or (c) the width rule changes `panel.size`. One write carries all three. Else `layout.show/hide {id: run}` when hidden ≠ !want.
- Width: shown run and `panel.size.px === PANEL_PX` → 480; no run and `=== RUN_PX` → 368; else untouched.
- Every write via `write()`; `hideRun` too (F1). `showAgent(id)`: `selectTicket(id)`, runHidden false, `runFocus {id, at}`, `last = null`, `syncRun()`. Focus: when `want` shown and `ask.id === selectedTicket()` → `pane.focus {terminal}`; clear; drop after 5 s.
- `register.js` comment of the task: "the run follows the selected ticket".
Tests `tests/ticket/terminal.test.ts`: T6–T12, rewritten from the tab-based ones.

### Task 4: the panel shows the full ticket (AC3, AC6)
- Create `ticket/view/document.js`: `class TicketDocument { constructor(id, onChange) ; load(); header(vm); card(vm); description(vm); comments(vm); composerView(); onKey(e, cx) }` moved from `full.js` (no `handle.focus()`, no `pinTicket`, G → `showAgent`).
- `ticket/view/context.js`: follows `selectedTicket()` only; a new `TicketDocument` per followed id; render order header, title, card, Agent and conductor, Description, Properties, Comments, Activity, Runs in the scroll, composer `flex_none` at the bottom; `track_focus` + `on_key_down` on the root without focusing.
- Delete `ticket/view/full.js`, `ticket/presenter/tab.js` if unused.
Tests: move `tests/ticket/view/full*.test.ts` to `tests/ticket/view/panel-*.test.ts` against the panel; update `context.test.ts`, `tests/golden.test.ts` snapshot (`bun test -u` then review the diff). T13–T15.

### Task 5: docs (AC11) and check (AC12)
README keys table (Tickets tab: Enter shows in panel; panel keys A, E, G, R; cmd-shift-T), intro, routes; `docs/architecture.md` routes and the run section. `rg -n "ticket tab|preview tab|run column|ticket.view" README.md docs/architecture.md mods` → no hits. `bun run check` green.

### Task 6: live check (AC9, AC8 risk)
Install into Herdr (`bun run install:herdr`), walk F1–F3 of the test comment, record observations in the coding handoff.
