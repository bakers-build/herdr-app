# Actions on cmd-K Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** cmd-K opens a palette of the front ticket's actions and the bakers commands, each with its key, so a developer finds every action of a ticket in one place.

**Architecture:** The ticket module gains one source of a ticket's actions (`ticket/operations/actions.js`). The "..." menu, the ticket view's single keys and the palette all read it. A new command `actions` resolves the target ticket in the status block's copy and opens the route `ticket.actions`, a 480 px popup placed like Go to ticket. The palette runs ticket entries through the existing actions (`perform`), and bakers entries through the registered `command` definitions, which now carry a `label`. Core and shell do not change.

**Tech Stack:** Plain ES-module JavaScript mods for Herdr 0.1.16 (gpui-kit, gpui-base, herdr), JSDoc types checked by `tsc`, Bun tests over the stubbed Herdr harness (`tests/harness.ts`), Biome.

**Spec:** the description of HERDRAPP-9 (https://app.bakers.build/bakers/ticket/herdrapp-9), criteria AC1 to AC9; prototype https://claude.ai/artifact/QEiMHE4gsM2EH7ZTqsEUcs (private).

## Global Constraints

- Base: `feat/herdrapp-8-run-terminal-b` (PR #7). Show agent uses its `showRun` and `runReason` (`ticket/terminal.js`).
- Core and shell name no module: `docs/architecture.md`, `tests/architecture.test.ts` stays green. No new registry type.
- Palette: route `ticket.actions`, `open: { kind: "popup", width: 480 }`, at `{ x: max(0, round(left + width / 2 - 240)), y: 120 }` like Go to ticket.
- Key: `"cmd-k": "bakers.actions"` in `BAKERS_KEYS` (`scripts/layout.js`), global section.
- Entry labels, verbatim: `Show agent`, `Change state...`, `Move to...`, `Freeze...` / `Unfreeze...`, `Cancel run...`, `Copy identifier`; `Go to ticket...`, `New ticket`, `Tickets`, `Ticket panel`; `Go to ticket "<text>"...`.
- Reasons, verbatim: Show agent `runReason(...)` (e.g. `No live run terminal`), Cancel run `No active run`. Header without a ticket: `No ticket in front`.
- Ticket keys: Show agent `G`, Move to... `R`. Bakers keys come from Herdr's `keys()` (the person's own binding), shown like `cmd-shift-O` (last letter upper case).
- Herdr's mod runtime has no `structuredClone`. No `console` in `mods/`. `strictNullChecks` on; every helper parameter gets a JSDoc type.
- Plain dash only, never the em dash; comments say why in one line.

## Review Focus

1. **Detail still loading or failing** when the palette opens: the header uses the store row, the ticket section shows `Loading <id>...` or the error, and the bakers commands still work. Test in Task 3.
2. **A stale or empty target**: the Tickets tab with `bakers.selected` null gives no ticket. Test in Task 2.
3. **A filter that matches nothing**: only `Go to ticket "<text>"...` is left, highlighted, and Enter opens Go to ticket with that text. Test in Task 3.
4. **Availability changing before Enter**: the run ends between render and Enter. Enter does nothing, and the reason shows. Test in Task 3.
5. **The highlight after filtering**: it always lands on the first usable entry, and Enter with no usable entry does nothing. Test in Task 3.

---

### Task 1: One source of a ticket's actions

**Files:**
- Create: `mods/bakers/ticket/operations/actions.js`
- Modify: `mods/bakers/ticket/operations/more.js` (derive from `ticketActions`)
- Modify: `mods/bakers/ticket/terminal.js` (add `showAgent`, moved from `ticket/view/context.js` `showAgent`)
- Modify: `mods/bakers/ticket/view/context.js:100-107` (call `showAgent` from `terminal.js`)
- Modify: `mods/bakers/ticket/view/full.js:152-169` (`g` and `r` through `ticketActions` and `perform`)
- Modify: `mods/bakers/ticket/register.js` (actions `ticket.showAgent`, `ticket.move`)
- Test: `tests/ticket/presenter.test.ts`, `tests/ticket/view/full.test.ts`

**Interfaces:**
- Produces: `ticketActions(detail: { ticket: any, runs: any[] }, showReason: string | null): TicketAction[]` with `TicketAction = { key: "agent" | "state" | "move" | "freeze" | "cancel" | "copy", label: string, keys?: string, reason?: string | null, step?: "state", action?: any[] }`, in that order. Actions: `["ticket.showAgent", id]`, `["ticket.move", id]`, `["form.open", "freeze" | "unfreeze", { ticket: id }]`, `["form.open", "cancel", { ticket: id }]`, `["copy", id]`; `state` has `step: "state"` and no action.
- Produces: `showAgent(id: string): void` in `ticket/terminal.js`. On the Tickets tab (no ticket tab in front) it opens the row's ticket first, then `showRun(id)`.
- Produces: registered actions `ticket.showAgent` (args `id`) and `ticket.move` (args `id`, opens `ticket.conductor-picker` with `{ ticket: id }`).

- [ ] **Step 1: Write the failing tests** in `tests/ticket/presenter.test.ts`:

```ts
const { ticketActions } = await import("../../mods/bakers/ticket/operations/actions.js");
const { moreItems } = await import("../../mods/bakers/ticket/operations/more.js");
const detail = (o: any = {}) => ({ ticket: { identifier: "SHOP-41", frozen: false, ...o }, runs: o.runs ?? [] });

test("ticketActions: the six actions with keys, reasons and actions", () => {
  const a = ticketActions(detail({ runs: [{ closed: false }] }), null);
  expect(a.map((x: any) => x.label)).toEqual(["Show agent", "Change state...", "Move to...", "Freeze...", "Cancel run...", "Copy identifier"]);
  expect(a.map((x: any) => x.keys ?? null)).toEqual(["G", null, "R", null, null, null]);
  expect(a[0].action).toEqual(["ticket.showAgent", "SHOP-41"]);
  expect(a[1]).toMatchObject({ step: "state" });
  expect(a[2].action).toEqual(["ticket.move", "SHOP-41"]);
  expect(a[4].reason).toBeNull();
  expect(a[5].action).toEqual(["copy", "SHOP-41"]);
});

test("ticketActions: frozen gives Unfreeze, no active run and no terminal give reasons", () => {
  const a = ticketActions(detail({ frozen: true }), "No live run terminal");
  expect(a[3]).toMatchObject({ label: "Unfreeze...", action: ["form.open", "unfreeze", { ticket: "SHOP-41" }] });
  expect(a[0].reason).toBe("No live run terminal");
  expect(a[4].reason).toBe("No active run");
});

test("moreItems keeps its menu: Freeze, Cancel run (disabled without a run), Copy identifier", () => {
  const m = moreItems(detail());
  expect(m.map((i: any) => i.label)).toEqual(["Freeze...", "Cancel run...", "Copy identifier"]);
  expect(m[1].disabled).toBe(true);
  expect(m[2].separator).toBe(true);
});
```

In `tests/ticket/view/full.test.ts`, add two tests on `ticketTab("SHOP-41")` (fixture `u41` has an active run): with `env.terminals = [live("t7")]`, pressing `g` (`key(root, "g")`) writes `setShared("bakers.runFocus", { id: "SHOP-41", ... })`. Pressing `r` opens the overlay with `props.view` `"ticket.conductor-picker"` and `props.ticket` `"SHOP-41"`.

- [ ] **Step 2: Run them to verify they fail**

Run: `bun test tests/ticket/presenter.test.ts tests/ticket/view/full.test.ts`
Expected: FAIL. `operations/actions.js` cannot be found.

- [ ] **Step 3: Implement** `ticketActions` in `ticket/operations/actions.js`. Cancel's reason is `activeRun(detail.runs) ? null : "No active run"` (`ticket/rules.js`). Rewrite `moreItems(detail)` as the `freeze`, `cancel` and `copy` entries of `ticketActions(detail, null)`, mapped to `{ label, action, disabled: Boolean(reason) || undefined, separator: key === "copy" || undefined }`. Move the body of `context.js` `showAgent(id)` into `terminal.js` `showAgent(id)`; `context.js` calls it. Register `ticket.showAgent` and `ticket.move` in `ticket/register.js` (`openRoute` from `core/router.js`). In `full.js` `onKey`, replace the `g` and `r` branches with one lookup: the entry of `ticketActions(this.detail, runReason(this.runInfo(), this.terminal()))` whose `keys` lower-cased equals `k`. Without a reason, `void perform(entry.action, cx)`. With a reason, the key is consumed and nothing happens. Without a loaded detail, `return` as for any unknown key.

- [ ] **Step 4: Run the tests**

Run: `bun test tests/ticket`
Expected: PASS, including the existing `context.test.ts` Show-agent tests and `dialog-*` tests.

- [ ] **Step 5: Commit**

```bash
git add mods/bakers/ticket tests/ticket
git commit -m "refactor(ticket): one list of a ticket's actions for menus, keys and the palette"
```

### Task 2: The `actions` command, labelled bakers commands, Go to ticket with text, the key

**Files:**
- Modify: `mods/bakers/ticket/tabs.js` (add `frontTicket`)
- Modify: `mods/bakers/ticket/view/commands.js` (`atTop`, labels, `goto` with text, `actions`)
- Modify: `mods/bakers/ticket/register.js` (command order goto, new, tickets, panel, open, actions)
- Modify: `mods/bakers/ticket/view/search.js` (`init`: a `props().query` fills the field and searches at once)
- Modify: `scripts/layout.js:9-15` (`"cmd-k": "bakers.actions"`)
- Test: `tests/golden.test.ts` (or `tests/shell/status.test.ts`, whichever holds command tests), `tests/ticket/tabs.test.ts`, `tests/ticket/view/search.test.ts`, `tests/install.test.ts`

**Interfaces:**
- Produces: `frontTicket(): string | null` in `ticket/tabs.js`. Returns the focused ticket tab's identifier. When the Tickets home tab is the focused tab, returns `shared("bakers.selected") ?? null`. Otherwise returns `null`. It uses `focusedTicket()`, `homeTab("ticket")` and `focused().tab`.
- Produces: command definitions `{ label?: string, run(arg: string, where: { width: number, left: number }) }`. Labels: `goto` "Go to ticket...", `create` "New ticket", `tickets` "Tickets", `panel` "Ticket panel". `open` and `actions` have none, so the palette does not list them.
- Produces: `goto.run(arg, where)` opens `ticket.search` with props `{ query: arg }` when `arg` is non-empty, else `{}`.
- Produces: `actions.run(_arg, where)` opens `ticket.actions` with props `{ ticket: frontTicket(), where }` at `atTop(where)`.

- [ ] **Step 1: Write the failing tests**

- In the command tests, mirror the `goto` golden test, which pushes to `env.commands` and mounts `shell.status`.
  - `actions` with a ticket tab `SHOP-41 working` focused (`env.focused = { tab: "t5" }`) produces one `openOverlay` call: `{ mod: "bakers", kind: "popup", width: 480, at: { x, y: 120 }, props: { view: "ticket.actions", ticket: "SHOP-41", where: { width, left } } }`. `x` is the same as goto's for the same layout.
  - With the run block focused (`env.focused = { tab: "t5", pane: null, terminal: "t7" }`, the shape Herdr reports for a layout terminal block), `props.ticket` is `"SHOP-41"`.
  - With the Tickets tab focused and `env.shared["bakers.selected"] = "SHOP-56"`, `props.ticket` is `"SHOP-56"`.
  - With a plain tab `"3"` focused, `props.ticket` is `null`.
  - With the Tickets tab focused and no selection, `props.ticket` is `null`.
  - `goto:deliv` opens `ticket.search` with `props.query` `"deliv"`.
- In `search.test.ts`, mounting with `{ view: "ticket.search", query: "deliv" }` sets the field value to `"deliv"`. After `flush()` and without `fireTimers`, one search with `deliv` has been fetched.
- In `install.test.ts`, `expect(BAKERS_KEYS["cmd-k"]).toBe("bakers.actions")`.

- [ ] **Step 2: Run them to verify they fail**

Run: `bun test tests/golden.test.ts tests/ticket tests/install.test.ts`
Expected: FAIL. There is no `actions` command, and the search ignores `query`.

- [ ] **Step 3: Implement** as in the Interfaces. Extract goto's position as `atTop(where: { width: number, left: number }): { x: number, y: number }`. Reorder the `define("command", ...)` lines so the registry order is goto, new, tickets, panel, open, actions. Register `actions`. Update the golden snapshots only for the changed or new command calls (`bun test --update-snapshots tests/golden.test.ts`), and check the diff.

- [ ] **Step 4: Run the tests**

Run: `bun test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mods/bakers/ticket scripts/layout.js tests
git commit -m "feat(ticket): the actions command on cmd-K, and Go to ticket with a text"
```

### Task 3: The palette view

**Files:**
- Create: `mods/bakers/ticket/view/actions.js` (default class `Actions`)
- Modify: `mods/bakers/ticket/register.js` (`define("route", "ticket.actions", { view: Actions, open: { kind: "popup", width: 480 } })`, comment `// popup, cmd-K`)
- Test: `tests/ticket/view/actions.test.ts` (new), `tests/main.test.ts` (route list gains `"ticket.actions"`)

**Interfaces:**
- Consumes: `ticketActions` and `showAgent` (Task 1); the command defs with `label` and `frontTicket` (Task 2); `stateItems`, `STATE_MENU_FOOTER` (`ticket/operations/state.js`); `runTerminal`, `runReason` (`ticket/terminal.js`); `getStore`, `ready` (`ticket/store.js`); `perform` (`core/actions.js`); `all`, `get` (`core/registry.js`); `keys`, `props`, `closeOverlay` (`herdr`).
- Props: `{ ticket: string | null, where: { width: number, left: number }, overlay: string }`.
- Rows: `{ key: string, label: string, keys?: string, reason?: string | null, current?: boolean, run(cx) }`, drawn with ids `action-<key>`. Keys are the `TicketAction.key`s, `cmd-<command id>`, `goto-text`, and `state-<state>` in the state step. Header id `actions-target`, field id `actions-field`.

Behaviour, pinned by the tests below:
- The view is a `v_flex` with id `actions`, `w(480)`, the popover background, `track_focus` and `on_key_down`, built like `ticket/view/search.js`. The input has the placeholder `Type an action...` and gets the focus in `init`.
- Header: the ticket's identifier (mono), title and state, from the loaded detail, else from `getStore().byId(id)`. Without a ticket: `No ticket in front`.
- Sections: the ticket section, titled with the identifier and holding `ticketActions(detail, runReason(...))`, then `Bakers` with every `all("command")` entry that has a `label`.
  - Each entry's `keys` is the ticket key, or for a command the `keys()` binding whose action is `bakers.<id>`, formatted with the last letter upper case.
  - With a ticket but no detail yet, the ticket section shows one non-choosable row, `Loading <id>...`. A failed load shows the classified error instead.
- `init` takes the detail from `getStore().cached(id)` and refreshes it with `await ready(); await getStore().ticket(id)`.
- Typing keeps the entries whose label contains every typed word, case-insensitively. A non-empty text adds `Go to ticket "<text>"...` last.
- Usable means no reason and not current. `at` indexes the usable rows and is reset to 0 whenever the rows change. Up and Down move among the usable rows, wrapping. Enter or a click runs the row. Esc closes.
- Running a row first rebuilds the rows. If the row is no longer usable, nothing happens. Otherwise `closeOverlay(props().overlay)` and then:
  - ticket actions: `void perform(action, cx)`;
  - `step: "state"`: switch to the state step without closing;
  - commands: `get("command", id).run(arg, props().where)`, with `arg` the text for `goto-text` and `""` otherwise.
- State step: the header reads `<id> › Change state`. The rows are `stateItems(id, state)` (the current one marked `current` and not usable), the footer is `STATE_MENU_FOOTER`, and Backspace in an empty field goes back to the actions.

- [ ] **Step 1: Write the failing tests** in `tests/ticket/view/actions.test.ts`. Set up with `activeSpace(); backend();` and `env.keys = [{ section: "global", keys: "cmd-shift-o", action: "bakers.goto" }, { section: "global", keys: "cmd-shift-b", action: "bakers.tickets" }]`, then `mount(Bakers, { view: "ticket.actions", ticket: "SHOP-41", where: { width: 1384, left: 56 }, overlay: "overlay-9" })` and `await flush()`.

| Test | Assertions |
|---|---|
| entries in order with keys | `texts(root)` holds `SHOP-41`, the title of `u41` and `working`. The labels are, in order: `Show agent`, `Change state...`, `Move to...`, `Unfreeze...` (u41 is frozen), `Cancel run...`, `Copy identifier`, `Go to ticket...`, `New ticket`, `Tickets`, `Ticket panel`. The keys show `G`, `R`, `cmd-shift-O` and `cmd-shift-B`. |
| no ticket | mounted with `ticket: null`: the texts include `No ticket in front`, the four bakers labels, and none of the six action labels |
| Show agent without a terminal | `env.terminals = []`: row `action-agent` shows `No live run terminal` and has no `on_click`. Enter runs the first usable row, `action-state`, so the header switches to `SHOP-41 › Change state`. |
| Show agent with a terminal | `env.terminals = [live("t7")]`, Enter: `closeOverlay("overlay-9")`, then `setShared("bakers.runFocus", { id: "SHOP-41", ... })` |
| run ended before Enter | render with `live("t7")`, then set `env.terminals = []` and press Enter: no `closeOverlay`, and the next render shows the reason |
| Move to... | press Down until `action-move` is hot, then Enter: `openOverlay` props `{ view: "ticket.conductor-picker", ticket: "SHOP-41" }` |
| Unfreeze and Cancel run | Enter on each opens `openOverlay` with props `{ view: "dialog", form: "unfreeze" }` or `{ view: "dialog", form: "cancel" }`, with `ticket: "SHOP-41"` (check the prop names against `ui/form/dialog.js` `openForm`) |
| Copy identifier | a click on `action-copy` records `{ fn: "clipboard", args: ["SHOP-41"] }` |
| filter | `input.type("run")`: the labels are `Cancel run...` and `Go to ticket "run"...` |
| nothing matches | `input.type("zzz")`: the only row is `goto-text`, it is hot, and Enter opens `ticket.search` with `query: "zzz"` at `x = max(0, round(56 + 1384 / 2 - 240))`, `y: 120` |
| change state | Enter on `action-state`, then Down to `state-review` and Enter: `openOverlay` dialog props `{ form: "state", ticket: "SHOP-41", from: "working", to: "review" }`. `state-working` shows `current` and has no `on_click`. |
| back | in the state step, Backspace with an empty field shows the actions again |
| bakers command | a click on `cmd-tickets` selects the Tickets tab (`run("tab.select", { id: "t0" })`) |
| Esc | `key(root, "escape")`: `closeOverlay("overlay-9")` and nothing else |
| loading and failure | with the backend's read failing, the ticket section shows the error text and the bakers rows still work |

- [ ] **Step 2: Run them to verify they fail**

Run: `bun test tests/ticket/view/actions.test.ts tests/main.test.ts`
Expected: FAIL. The view says `bakers: unknown view`, and `ticket.actions` is missing from the route list.

- [ ] **Step 3: Implement** `Actions` in `mods/bakers/ticket/view/actions.js` as above. Draw the rows like `ui/components/menu.js` `menuRow`: hot gets `bg(t.selected)`, unusable rows get `text_color(t.muted)` and no `on_click`, the reason is a muted, truncated text, and the keys use `mono(keys, 11)`. The footer in the actions step reads `Up and down choose, Enter runs, Esc closes.` Register the route.

- [ ] **Step 4: Run the tests**

Run: `bun test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mods/bakers/ticket tests
git commit -m "feat(ticket): the actions palette: the front ticket's actions and the bakers commands"
```

### Task 4: Found without the key, docs

**Files:**
- Modify: `mods/bakers/ticket/view/full.js:198` (button `actions`, label `Actions`, after Edit, `() => run("bakers.actions")`)
- Modify: `mods/bakers/ticket/presenter/teaser.js:6-7` (`KEY_HINT` ends with `cmd-K the actions of the selected ticket.`)
- Modify: `README.md` Keys table (`| cmd-K | Actions of the ticket in front, or of the selected row |`), `docs/architecture.md` (route `ticket.actions` in the tree, the `command` row's ids gain `actions`, and its definition gains `label?`, the label listed in the palette)
- Test: `tests/ticket/view/full.test.ts`, `tests/ticket/view/list.test.ts`

- [ ] **Step 1: Write the failing tests.** In the ticket tab, clicking `find(root, "actions")` gives `runs()` containing `["bakers.actions"]`. The list's hint text contains `cmd-K the actions of the selected ticket`.
- [ ] **Step 2: Run them to verify they fail.** Run `bun test tests/ticket/view`: FAIL.
- [ ] **Step 3: Implement** as listed. Update the golden snapshots if the header's element tree is snapshotted, and check the diff.
- [ ] **Step 4: Run all checks.** Run `bun run check`. Expected: exit 0, with lint, format, typecheck, hygiene, herdr-types, tests and the coverage floor (92 % lines, 90 % functions) all passing.
- [ ] **Step 5: Commit**

```bash
git add mods/bakers README.md docs/architecture.md tests
git commit -m "feat(ticket): an Actions button and the key hint name cmd-K"
```

### Task 5: Verification in Herdr

- [ ] **Step 1:** `bun run herdr-check` (Herdr loads the mod and materializes its views). Expected: exit 0.
- [ ] **Step 2:** Install from this worktree into the running Herdr: `bun run install:herdr`. Then, in Herdr:
  - cmd-K on a ticket tab shows that ticket's palette;
  - cmd-K on the Tickets tab shows the selected row's ticket;
  - cmd-K on a shell tab shows `No ticket in front`;
  - cmd-K while a terminal and while the run block has the focus also opens it;
  - Esc gives the focus back;
  - Show agent, Change state (stop at the dialog with Cancel), Move to (Esc) and Copy identifier work.
  Record what was seen, and that the dialogs were cancelled.
- [ ] **Step 3:** Push the branch, open the PR against `feat/herdrapp-8-run-terminal-b`, titled `feat(ticket): actions of the front ticket on cmd-K`, with CI green.

## Scope change, 2026-11-24

Pascal asked for fuzzy search over everything and a centered palette. AC3 is revised and AC10 added; see the ticket's revised `spec`, `plan` and `test` comments.

### Task 6: Fuzzy search, tickets in the palette

**Files:** Create `mods/bakers/core/fuzzy.js` (`fuzzyScore(query: string, text: string): number | null`), Modify `mods/bakers/ticket/view/actions.js`, Test `tests/core/fuzzy.test.ts`, `tests/ticket/view/actions.test.ts`.

- [ ] Tests first: fuzzy unit tests (in-order letters or null, case and spaces ignored, `can` ranks Cancel run above Change state, an exact prefix scores highest), and palette tests (`chst`, sorting, Tickets section local at once and server after 200 ms without duplicates, exact identifier first, Enter opens pinned, empty field shows no tickets). Run them: FAIL.
- [ ] Implement. Run `bun test`: PASS. Commit.

### Task 7: Centered

**Files:** Modify `mods/bakers/ticket/register.js` (route `ticket.actions` opens `{ kind: "dialog", width: 480, height: 420 }`), `mods/bakers/ticket/view/commands.js` (`actions` passes no `at`), `mods/bakers/ticket/view/actions.js` (rows scroll in the fixed height), Test `tests/ticket/commands.test.ts`.

- [ ] Test first: the overlay spec of `actions`. FAIL. Implement. `bun run check`, `herdr-check`, live check. Commit, push.
