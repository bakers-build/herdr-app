# Run beside the ticket Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The front ticket tab's live run terminal, local or remote, shows in a `run` column right
of `main`, follows the front tab every second, and "Show agent", "Answer in the run" and "Hide"
drive it, without Herdr ever taking the terminal over.

**Architecture:** A synchronous window task `ticket.run` (every 1 s) compares what should show
(`focusedTicket()`, `terminals()`, `bakers.runHidden`) with `layout()` and calls `layout.set`,
`layout.show` or `layout.hide` only on a real change. The ticket module owns the ids and the
decision (`ticket/terminal.js`); `core/herdr.js` gets one generic tree helper. A new route
`ticket.run` draws the column's header.

**Tech Stack:** Herdr mod (plain JS with JSDoc, `herdr`, `gpui-kit`, `gpui-base`), Bun tests over
stubbed Herdr globals (`tests/harness.ts`), Biome, tsc.

**Spec:** `docs/superpowers/specs/2026-11-23-run-beside-the-ticket-design.md`; acceptance AC1-AC11
in the ticket's qualification handoff.

## Global Constraints

- Permanent ids: column `run`, header block `run-header`, terminal block `run-terminal`, route
  `ticket.run`, window task `ticket.run`, shared `bakers.runHidden` (boolean), shared
  `bakers.runFocus` (`{ id, at }`).
- The layout ids `work-body`, `main`, `run`, `run-header`, `run-terminal` are written once, at the
  top of `ticket/terminal.js`.
- The task's `run()` is synchronous: no `await`, no `ready()`; `shell.status` spawns every tick.
- `layout.set` only when the column is missing or `run-terminal` is missing or shows another
  address; `layout.show`/`layout.hide` only when visibility changes; never on an unchanged tick.
- A write changes only the `run` column's `hidden` and its `run-terminal` block; everything else
  in the tree, including the column's size, stays as read.
- No `work-body` or no `main` in `layout()`: no call at all.
- Never `hc`, `terminal.*` or `agent.focus` for the run; never a `herdr.*` label.
- `docs/architecture.md` rule 10: `core/` names no module, not even in comments.
- Copy: `NO_TERMINAL` = "No live run terminal"; "The run is on <claim_machine>, which Herdr is
  not connected to"; header "Run <bakers.run>" and "Hide".
- Plain dash "-" in all text, never the em dash.

## Review Focus

1. **The run ends while its column shows:** Herdr deletes `run-terminal` and leaves the header
   alone; the next tick must hide the column, or rebuild it for a new live run (Task 2 tests).
2. **`layout()` shows a write a moment late:** the next tick must not write the same thing again
   (Task 2, "does not repeat a write while layout() lags").
3. **The panel's "Show agent" on the Tickets tab:** the preview tab appears after the click; the
   focus must wait for it and not fire later for a ticket opened much later (Task 3 tests).
4. **A run labelled with the ticket's UUID**, not its identifier (Task 1 and Task 2 tests).
5. **A layout installed with `--from` (no `main`)** or the plain Herdr layout: no write (Task 2).

## Files

- Modify `mods/bakers/ticket/terminal.js`: the live filter, `runReason`, the ids, `syncRun`,
  `showRun`, `hideRun`, `_resetForTests`.
- Modify `mods/bakers/ticket/presenter/context.js`: `agent.show` from the `reason` option.
- Modify `tests/harness.ts`: a `machines()` stub over `env.machines`.
- Modify `mods/bakers/core/herdr.js`: `withNode`.
- Modify `mods/bakers/ticket/register.js`: window task and route `ticket.run`.
- Create `mods/bakers/ticket/view/run.js`: the header view.
- Modify `mods/bakers/ticket/view/full.js`, `mods/bakers/ticket/view/context.js`: call `showRun`.
- Modify `tests/fixtures/shop.ts` (`resetMod`), `tests/golden.test.ts`,
  `tests/ticket/view/full.test.ts`, `tests/ticket/view/context.test.ts`.
- Create `tests/ticket/terminal.test.ts`, `tests/core/herdr.test.ts`, `tests/ticket/view/run.test.ts`.
- Modify `docs/architecture.md`.

---

### Task 1: Only a live run counts, and the reason says where the run is

**Files:**
- Modify: `mods/bakers/ticket/terminal.js`, `mods/bakers/ticket/presenter/context.js:4,39`,
  `mods/bakers/ticket/view/full.js:226`, `mods/bakers/ticket/view/context.js:104-127,377-382`
- Modify: `tests/harness.ts` (`machines: () => env.machines`, `env.machines = []` in `reset()`),
  `tests/golden.test.ts:142`, `tests/ticket/view/full.test.ts:11,37,142,152-158`,
  `tests/ticket/view/context.test.ts:56`, `tests/ticket/presenter.test.ts` (the context
  presenter's `show`)
- Test: `tests/ticket/terminal.test.ts` (new)

**Interfaces:**
- Produces: `runTerminal(id: string, uuid?: string): any | undefined`, the first terminal with
  `state === "live"` and `labels["bakers.ticket"]` equal to `id` or `uuid`;
  `NO_TERMINAL = "No live run terminal"`;
  `runReason(ticket: { runs: any[], claim_machine: string | null }, terminal: any): string | null`:
  null with a terminal; with an active run (`activeRun` from `ticket/rules.js`) whose
  `claim_machine` is set and not a `name` in Herdr's `machines()`:
  `` `The run is on ${claim_machine}, which Herdr is not connected to` ``; else `NO_TERMINAL`.
- The context presenter takes `reason` in its options in place of deriving it from `terminal`:
  `agent.show = o.reason`; it no longer imports `ticket/terminal.js`.

- [ ] **Step 1: Write the failing tests** in `tests/ticket/terminal.test.ts`, with `live` exported
  from `tests/fixtures/shop.ts` (Tasks 2-4 use it too)

```ts
// tests/fixtures/shop.ts
export const live = (address: string, id = "SHOP-41", extra: any = {}) =>
  ({ address, state: "live", labels: { "bakers.ticket": id, "bakers.run": "3" },
     program: { name: "Claude Code" }, ...extra });

// tests/ticket/terminal.test.ts
const terminal: any = await import("../../mods/bakers/ticket/terminal.js");

test("runTerminal finds a live run by identifier or UUID, local or remote", () => {
  env.terminals = [live("vps/t7", "uuid-41")];
  expect(terminal.runTerminal("SHOP-41", "uuid-41")?.address).toBe("vps/t7");
  expect(terminal.runTerminal("SHOP-41")).toBeUndefined();
});

test("runTerminal skips a finished run", () => {
  env.terminals = [live("t6", "SHOP-41", { state: "exited" }), live("t7")];
  expect(terminal.runTerminal("SHOP-41")?.address).toBe("t7");
  env.terminals = [live("t6", "SHOP-41", { state: "exited" })];
  expect(terminal.runTerminal("SHOP-41")).toBeUndefined();
});
```

```ts
const active = { runs: [{ uuid: "r1", closed: false }], claim_machine: "studio-mac" };

test("runReason names a machine Herdr is not connected to", () => {
  env.machines = [{ name: null, layout: "ready" }];
  expect(terminal.runReason(active, undefined)).toBe(
    "The run is on studio-mac, which Herdr is not connected to");
});

test("runReason on a connected machine, without a run or without a machine: no live terminal", () => {
  env.machines = [{ name: null, layout: "ready" }, { name: "studio-mac", layout: "ready" }];
  expect(terminal.runReason(active, undefined)).toBe("No live run terminal");
  env.machines = [];
  expect(terminal.runReason({ runs: [], claim_machine: "studio-mac" }, undefined)).toBe("No live run terminal");
  expect(terminal.runReason({ ...active, claim_machine: null }, undefined)).toBe("No live run terminal");
  expect(terminal.runReason(active, live("t7"))).toBe(null);
});
```

In `full.test.ts`, rename the test at line 152 to "without a live run Answer in the run is disabled
and says where the run is"; with `claim_machine: "studio-mac"` and an open run on SHOP-41 (set
in the test's backend data) and no terminal, expect the tooltip
`["The run is on studio-mac, which Herdr is not connected to"]`; with an exited terminal and no
`claim_machine`, `["No live run terminal"]`. In `context.test.ts`, the same reason on the
panel's `show-agent` button.

- [ ] **Step 2: Run them to verify they fail**

Run: `bun test tests/ticket/terminal.test.ts tests/ticket/view/full.test.ts tests/ticket/view/context.test.ts`
Expected: FAIL, "runTerminal skips a finished run" finds `t6`, `runReason` is not a function, the
tooltip is still "The run's terminal is not on this computer".

- [ ] **Step 3: Add `t.state === "live"` to `runTerminal`'s match, set `NO_TERMINAL`, add
  `runReason`, compute it in both views (passing `reason` to the context presenter), add
  `machines` to the harness, and add `state: "live"` to the five existing `env.terminals`
  fixtures listed above**

Update the file's header comment: a run terminal is live, local or `<machine>/tN`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test tests/ticket tests/golden.test.ts`
Expected: PASS, the golden snapshot unchanged.

- [ ] **Step 5: Commit**

```bash
git add mods/bakers/ticket tests
git commit -m "fix(ticket): only a live run terminal counts, and the reason names the run's machine"
```

### Task 2: The run column follows the front ticket

**Files:**
- Modify: `mods/bakers/core/herdr.js`, `mods/bakers/ticket/terminal.js`,
  `mods/bakers/ticket/register.js:68`, `tests/fixtures/shop.ts` (`resetMod`), `docs/architecture.md`
- Test: `tests/core/herdr.test.ts` (new), `tests/ticket/terminal.test.ts`

**Interfaces:**
- Consumes: `runTerminal` (Task 1); `focusedTicket()` from `ticket/tabs.js`; `getStore().byId(id)?.uuid`.
- Produces:
  - `withNode(root: any, node: any, parent: string, after: string): any | null` in `core/herdr.js`:
    a `structuredClone` of `root` where the node with `node.id` is replaced in place, or, when
    absent, inserted into `parent`'s children right after the child `after`; null when it is
    absent and `parent` or `after` is missing.
  - `syncRun(now?: number): void` in `ticket/terminal.js` (`now` defaults to `Date.now()`).
  - `_resetForTests(): void` in `ticket/terminal.js`, called from `resetMod()`.
  - Registry: `define("window.task", "ticket.run", { every: 1000, run: () => syncRun() })`.

- [ ] **Step 1: Write the failing tests**

`tests/core/herdr.test.ts`: "withNode replaces a node in place and keeps the rest",
"withNode inserts after a sibling", "withNode gives null without the parent or the sibling", and
"withNode leaves its input unchanged".

`tests/ticket/terminal.test.ts`, over `bakersLayout(herdr-main.json)` (from `scripts/layout.js`
and `tests/fixtures/herdr-main.json`) as `env.layout`, with two helpers in the test file:
`front(id: string | null)` puts a Tickets tab `t0` and, for an id, a tab `t5` named `<id> working`
in the active space and focuses `t5` (or `t0`); `applies()` plays the recorded `layout.set`,
`layout.show` and `layout.hide` into `env.layout` the way Herdr would, then clears `env.calls`;
`withoutRun(tree)` is a copy of the tree without the `run` node. `run` = `findNode(env.layout, "run")`.
An `afterEach` asserts that the run is never taken over: no `runs()` entry starts with
`terminal.` or is `agent.focus`, and no `exec` call is recorded.

```ts
test("a live run of the front ticket adds the column after main, focus untouched", () => {
  front("SHOP-41"); env.terminals = [live("t7")];
  terminal.syncRun();
  const set = runs().filter(([c]) => c === "layout.set");
  expect(set).toHaveLength(1);
  expect(runs().map(([c]) => c)).toEqual(["layout.set"]);
  const body = findNode(set[0][1].layout, "work-body");
  expect(body.children.map((c: any) => c.id)).toEqual(["main", "run", "panel"]);
  expect(findNode(set[0][1].layout, "run-header").content).toEqual(
    { mod: "bakers", props: { view: "ticket.run" } });
  expect(findNode(set[0][1].layout, "run-terminal").content).toEqual({ terminal: "t7" });
  // the rest of the tree is as read
  expect(withoutRun(set[0][1].layout)).toEqual(withoutRun(bakersLayout(main)));
});
```

and, each as its own test with the assertion named:

- "a remote run shows by its address": `live("vps/t7")` gives `{ terminal: "vps/t7" }`.
- "an unchanged tick calls nothing": `syncRun(); applies(); syncRun();` then `runs()` is `[]`.
- "another ticket tab shows its run and keeps the column's size": after `applies()`, set
  `run.size = { px: 500 }`, `front("SHOP-56")` with `live("t9", "SHOP-56")`; one `layout.set`
  whose `run` has `size: { px: 500 }` and `run-terminal` `{ terminal: "t9" }`.
- "the Tickets tab, a plain tab and a ticket without a run hide the column once": each gives
  `[["layout.hide", { id: "run" }]]`, and a second tick after `applies()` gives `[]`.
- "a hidden column comes back with layout.show only": hidden, same terminal, gives
  `[["layout.show", { id: "run" }]]`.
- "a finished run never shows": `state: "exited"` gives no `layout.set`/`layout.show`.
- "the header left alone after a run ends is hidden": remove `run-terminal` from `env.layout`
  (as Herdr does), no live run: `[["layout.hide", { id: "run" }]]`.
- "the header left alone gets a new run's terminal": remove `run-terminal`, a new live run `t8`:
  one `layout.set` with `run-terminal` `{ terminal: "t8" }` and `run-header` kept.
- "Hide keeps the column hidden across tabs and new runs": `env.shared["bakers.runHidden"] = true`;
  ticks on `SHOP-41`, `SHOP-56` and a new run give only the one `layout.hide`.
- "no main or no work-body, no call": `env.layout = herdr-main.json` without `main` (and the
  default `{ id: "root", children: [] }`) with a live front run: `runs()` is `[]`.
- "a run labelled with the ticket's UUID shows once the store knows it": load the store
  (`ticketTab()` from `tests/fixtures/shop.ts`), label the run with SHOP-41's UUID from the fixture.
- "does not repeat a write while layout() lags": `syncRun(1000); syncRun(1500)` without `applies()`
  gives one `layout.set`; `syncRun(3100)` gives the second.
- "the task is registered synchronous, every second": `get("window.task", "ticket.run").every` is
  `1000` and its `run()` returns `undefined`, not a Promise.

- [ ] **Step 2: Run them to verify they fail**

Run: `bun test tests/core/herdr.test.ts tests/ticket/terminal.test.ts`
Expected: FAIL, `withNode` and `syncRun` are not functions.

- [ ] **Step 3: Implement `withNode` in `core/herdr.js`, then `syncRun` and `_resetForTests` in
  `ticket/terminal.js`, and register the task in `ticket/register.js`**

`syncRun` follows the design's steps 1-4 and 6 (step 5, the focus request, is Task 3). The column
it writes is the one in the design: `size: { weight: 1 }`, `run-header` `size: { px: 32 }`,
`resizable: false`; an existing column keeps every field and its header, and only `hidden: false`
and `run-terminal` change. The repeat guard remembers only the last write (`JSON.stringify` of
command and args, with its time) and skips the identical next write within 2000 ms. Register with
a one-line comment: "the run column follows the front ticket tab". Add the
`terminal._resetForTests()` call to `resetMod()`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test tests/core/herdr.test.ts tests/ticket/terminal.test.ts tests/architecture.test.ts`
Expected: PASS.

- [ ] **Step 5: Update `docs/architecture.md`**

`terminal.js`: "a ticket's live run terminal and the run column beside the tabs"; `window.js`'s
line stays; the registry table's `window.task` row: ids `ticket.refresh`, `ticket.run`; the
`core/herdr.js` line: "a terminal's machine, the layout tree (find a node, put a node)".

- [ ] **Step 6: Commit**

```bash
git add mods/bakers/core/herdr.js mods/bakers/ticket/terminal.js mods/bakers/ticket/register.js tests docs/architecture.md
git commit -m "feat(ticket): the front ticket's live run shows in a column beside the tabs"
```

### Task 3: Show agent and Answer in the run show and focus the run

**Files:**
- Modify: `mods/bakers/ticket/terminal.js`, `mods/bakers/ticket/view/full.js:101-108`,
  `mods/bakers/ticket/view/context.js:104,126`
- Test: `tests/ticket/terminal.test.ts`, `tests/ticket/view/full.test.ts:141-150`,
  `tests/ticket/view/context.test.ts:55-75`

**Interfaces:**
- Consumes: `syncRun` (Task 2); `openTicket(id, name)` from `ticket/tabs.js`, `tabName(row)` from
  `ticket/presenter/tab.js`.
- Produces: `showRun(id: string): void` = `setShared("bakers.runHidden", false)`,
  `setShared("bakers.runFocus", { id, at: Date.now() })`, `syncRun()`.

- [ ] **Step 1: Write the failing tests**

`full.test.ts`, the test at line 141 renamed "Answer in the run and G show and focus the run"
with the layout from Task 2:

```ts
expect(runs().filter(([c]) => c === "pane.focus")).toEqual([
  ["pane.focus", { terminal: "t7" }],
  ["pane.focus", { terminal: "t7" }],
]);
expect(runs().filter(([c]) => c === "layout.set")).toHaveLength(1);
expect(env.shared["bakers.runHidden"]).toBe(false);
```

`context.test.ts`, line 75: the panel's "Show agent" on a ticket tab gives
`layout.set` then `["pane.focus", { terminal: "t7" }]`, nothing with `agent.focus`. New tests:

- "on the Tickets tab Show agent opens the ticket, then focuses its run once the tab is in front":
  the click gives `tab.new` for `SHOP-56` and no `pane.focus`; after `front("SHOP-56")` and
  `syncRun()`, one `["pane.focus", { terminal: "t9" }]` and `bakers.runFocus` is null.
- "a focus request older than 5 s is dropped": `bakers.runFocus = { id: "SHOP-41", at: now - 6000 }`,
  `syncRun(now)` gives no `pane.focus` and clears it.
- "another ticket tab in front drops the request without focusing": request for `SHOP-56`, front
  `SHOP-41`: no `pane.focus`, request cleared.
- "Show agent after Hide shows the column again": `bakers.runHidden = true`, hidden column, click
  gives `layout.show` (or `layout.set`) and `pane.focus`.

- [ ] **Step 2: Run them to verify they fail**

Run: `bun test tests/ticket/view/full.test.ts tests/ticket/view/context.test.ts tests/ticket/terminal.test.ts`
Expected: FAIL, the views still call `agent.focus`.

- [ ] **Step 3: Add `showRun` and the design's step 5 to `syncRun`; call `showRun` from the views**

`full.js` `showAgent()` calls `showRun(this.id)` when `this.terminal()` is found. `context.js`'s
button calls a method that, when `focusedTicket()` is null, first calls
`openTicket(row.id, tabName(row))` with `row = getStore().byId(vm.id)`, then `showRun(vm.id)`.
`showRun` passes the ticket's UUID nowhere: `syncRun` looks it up itself (Task 2).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test tests/ticket tests/golden.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mods/bakers/ticket tests/ticket
git commit -m "feat(ticket): Show agent and Answer in the run show and focus the run column"
```

### Task 4: The run column's header

**Files:**
- Create: `mods/bakers/ticket/view/run.js`
- Modify: `mods/bakers/ticket/terminal.js`, `mods/bakers/ticket/register.js:48-60`, `docs/architecture.md`
- Test: `tests/ticket/view/run.test.ts` (new)

**Interfaces:**
- Consumes: `machineOf` from `core/herdr.js`; the ids from `ticket/terminal.js`.
- Produces: `hideRun(): void` in `ticket/terminal.js` = `setShared("bakers.runHidden", true)`
  and `run("layout.hide", { id: "run" })`; route
  `define("route", "ticket.run", { view: RunHeader }); // the run column's header block "run-header"`.

- [ ] **Step 1: Write the failing tests** in `tests/ticket/view/run.test.ts`

- "the header names the run, program, address and machine": `env.layout` with `run-terminal`
  `{ terminal: "vps/t7" }`, `live("vps/t7")`; mounted as `{ view: "ticket.run" }`,
  `texts(root)` equals `["Run 3", "Claude Code", "vps/t7", "vps", "Hide"]`.
- "a local run says this computer": `t7` gives `[..., "t7", "this computer", "Hide"]`.
- "without its terminal the header shows only Hide": no `run-terminal`, `texts` is `["Hide"]`.
- "Hide hides the column and leaves the run alone": the click gives
  `[["layout.hide", { id: "run" }]]`, `bakers.runHidden` is `true`, no `terminal.` command.
- "render only reads": two renders record no `run`/`setShared` call.

- [ ] **Step 2: Run them to verify they fail**

Run: `bun test tests/ticket/view/run.test.ts`
Expected: FAIL, the route `ticket.run` has no view.

- [ ] **Step 3: Write `ticket/view/run.js` and `hideRun`; register the route**

One 32 px row, the ui components `mono` for the address and `button` for "Hide", the theme's
chrome background and a bottom border like the tab bar. "Run <bakers.run>" (just "Run" without
the label), `program.name`, address, `machineOf(terminal)`.

- [ ] **Step 4: Run the full check**

Run: `bun run check`
Expected: lint, format, typecheck, hygiene, herdr-types and all tests pass, coverage at or above
the floor, architecture rules green.

- [ ] **Step 5: Update `docs/architecture.md`**: `ticket.run` in the module's route list and
  `run` in its `view/` line.

- [ ] **Step 6: Commit**

```bash
git add mods/bakers/ticket tests/ticket docs/architecture.md
git commit -m "feat(ticket): the run column's header with Hide"
```

### Task 5: Live check in Herdr

Not code: the functional check of AC1-AC10 in a running Herdr with the installed mod
(`bun run install:herdr`), as in the ticket's `test` comment (checks L1-L10). Done by the run when `herdr-app` and
`hc` are reachable from its shell, else by a person at review. Results go in the coding handoff.
