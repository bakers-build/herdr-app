# Ticket list and ticket detail (R2-4, R2-3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the bakers layout, the Tickets tab (R2-4) and the ticket tab (R2-3) as Herdr mods, one to one with the wireframe at 1440 x 900 and with every drawn function.

**Architecture:** There is one `bakers` mod, routed by `props().view`, with shared logic in `mods/bakers/lib/` and one file per view in `mods/bakers/views/`. A `bakers-tabs` copy of Herdr's `tabs` mod draws the tab bar. A Bun installer builds `layouts/bakers.json` from Herdr's `main` layout. All data goes through the developer's `bakers` CLI (`exec`); shared state holds only ids, counts, the project and the view.

**Tech Stack:** Plain ES-module JavaScript mods (`gpui-kit`, `herdr`), Bun 1.4.4 tests, Biome, `tsc -p jsconfig.json`.

**Spec:** `docs/superpowers/specs/2026-11-15-ticket-list-and-detail-design.md`. Read it with this plan. Frames: canvas `KX7s4JK8wRRuyodj54xmmJ`, artboards `project/ListTab.dc.html` (R2-4) and `project/TicketTab.dc.html` (R2-3), read with the Artifact tool. Reference artboards are `RegionMap`, `Flow`, `Dialogs` and `RemoteDialogs`.

## Global Constraints

- The artboards are the source of truth for px, type sizes and copy. Copy values from them; never estimate.
- Rail 56 px; sidebar 220 px, hidden by default, cmd-B; tab bar 40 px; status bar 28 px; panel 368 px, hidden by default, cmd-shift-T; document max 760 px; title 22 px/600; Go to ticket popup 480 px wide, 120 px from the top; filter 220 px.
- List grid: `76px minmax(0,1fr) 170px 150px 44px`, gap 12 px; row padding 10 px 12 px; header 11 px uppercase, 600, letter-spacing 0.04em.
- Colors come only from `theme()` tokens, mapped as in the spec's *Theme mapping*: needs-you uses `blocked`, and the primary action uses `accent`/`solid`.
- Fonts: Inter for the UI; monospace for identifiers.
- Wireframe annotations listed in the spec's *Copy vs. annotation* are never rendered.
- Shared state (`setShared`) holds no ticket content: only `bakers.project` (uuid), `bakers.view`, `bakers.selected` (identifier), `bakers.preview` (tab id), and `bakers.needs` (`{count, ids, updated}`).
- Every write that changes state, freezes or unfreezes, moves or cancels goes through `confirm` first. Esc writes nothing.
- No token is kept. Every call is `exec("bakers", ["tools", tool, "--data", JSON.stringify(args)])`.
- Herdr reference: `herdrdev/herdr-app` tag `v0.1.15` (read-only on GitHub). Record its origin in each copied or derived file.
- `bun run check` passes after every task.

## Review Focus

1. **The bakers CLI is missing, signed out or offline.** Views show "bakers offline" (status item) or the CLI's message inline, never a blank tab. Test it in Task 2 and Task 6.
2. **The project has no tickets, or the chosen view is empty.** The empty hint shows for each view, and the panel shows nothing selected. Test it in Task 6.
3. **The ticket was closed or changed by someone else while its tab is open.** The tab becomes "<ID> closed", and the edit save warns when the ticket changed since edit mode started. Test it in Task 4 and Task 9.
4. **The answer partly fails.** The comment is posted but the unfreeze fails: the error names the failed step, and the composer keeps the text. Test it in Task 9.
5. **A double Enter or a fast Enter on another row.** Only one preview tab exists, and an already open ticket is selected rather than opened twice. Test it in Task 4.

---

### Task 1: Herdr reference, types and the test harness

**Files:**
- Modify: `types/gpui-kit.d.ts` (only declarations confirmed in `herdr-app` v0.1.15 mods; note the origin per block)
- Create: `docs/herdr-reference.md` (which `v0.1.15` files were used and for what: layout format, `tabs`/`toast`/`confirm`/`picker` mods, keys)
- Create: `tests/harness.ts`
- Modify: `tests/bakers.test.ts` (move to the harness; drop the placeholder assertion once Task 5 replaces `main.js`)

**Interfaces:**
- Produces: `loadView(file: string, env?: Partial<HerdrStub>): Promise<any>`, which evaluates `mods/bakers/<file>` with `gpui-kit` and `herdr` replaced through `mock.module`. Also `herdrStub(): HerdrStub`, a recorder with `calls: {fn: string, args: unknown[]}[]`, settable returns for `exec`, `spaces`, `terminals`, `shared` and `props`, and `run`/`notify`/`openOverlay`/`setShared` recorded. Also `el` helpers: `findText(root, text)`, `findByKey(root, key)`, `click(node)` and `key(node, keystroke)`, which call the recorded `on_click` and `on_key_down` handlers.

- [ ] **Step 1:** Read the `v0.1.15` `defaults/AGENTS.md` sections *Layouts*, *Keys*, *Mods* and *UI*, and the `tabs`, `toast`, `confirm` and `picker` mods. Write `docs/herdr-reference.md`.
- [ ] **Step 2:** Write a failing test, `harness evaluates a view and records run()`: a fixture view under `tests/fixtures/` calls `run("tab.select", {index: 1})` on click, and the test asserts `stub.calls` contains `{fn: "run", args: ["tab.select", {index: 1}]}`.
- [ ] **Step 3:** Run `bun test tests/harness.test.ts`. Expected: FAIL (no harness).
- [ ] **Step 4:** Implement `tests/harness.ts`. The element proxy records `child`, style setters and event handlers (`on_click`, `on_key_down`, `on_double_click`, and so on, as named in the real gpui-kit API).
- [ ] **Step 5:** Run `bun run check`. Expected: PASS.
- [ ] **Step 6:** Commit `test: harness for bakers views over stubbed gpui-kit and herdr`.

### Task 2: CLI client `lib/api.js`

**Files:** Create `mods/bakers/lib/api.js`; Test: `tests/api.test.ts`

**Interfaces:**
- Produces: `call(tool: string, args: object): Promise<any>`, which throws `BakersError {tool, code, message}`; code 127 or a rejected `exec` gives `offline: true`. Named wrappers: `listTickets(project)` (follows `next_offset`/pages until done), `readTicket(t)`, `readComments(t)`, `listRuns(t)`, `listActivity(t)`, `searchTickets(query, project)`, `listProjects()`, `listLabels(workspace)`, `listConductors(project)`, `publishComment(t, body, type = "comment")`, `updateTicket(t, fields)`, `classifyTicket(t, {type, recipe})`, `transitionTicket(t, state)`, `cancelRun(t, reason)`, `createTicket(fields)`.

- [ ] **Step 1:** Write failing tests. `call sends bakers tools <tool> --data <json>` asserts `exec` was called with `("bakers", ["tools", "bakers_ticket_read", "--data", "{\"ticket\":\"SHOP-41\"}"])`. `nonzero exit throws BakersError with stderr`. `exec rejection is offline`. `listTickets pages until done`.
- [ ] **Step 2:** Run `bun test tests/api.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. Timeout 30 000 ms per call.
- [ ] **Step 4:** Run `bun run check`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(bakers): CLI client for bakers tools`.

### Task 3: Store and derived facts `lib/store.js`

**Files:** Create `mods/bakers/lib/store.js`, `mods/bakers/lib/format.js`; Test: `tests/store.test.ts`

**Interfaces:**
- Consumes: Task 2 wrappers.
- Produces: `createStore(api)` returns `{load(project), refresh(), tickets, byId(idOrUuid), needs(): {count, ids}, view(name, {filter, showClosed}): Row[], counts(): {needsMe, mine: null, open, byState: Record<state, n>, recentlyClosed}, ticket(id): Promise<Detail>, onChange(fn)}`. `Row = {id, uuid, title, state, why: string|null, agent: AgentLine, age: string, closed}`. `AgentLine = {text, tone: "blocked"|"muted"|"working", terminal: string|null}`. `deriveWhy(ticket, comments, runs): string|null` uses the spec's table. `format.age(ms): "35m"|"2h"|"3d"`.

- [ ] **Step 1:** Write failing tests. `deriveWhy`: frozen + Question gives "Asked a question"; plan + plan comment + no active run gives "Plan ready for approval"; review gives "Ready for review"; otherwise null. `view("needs-me")` sorts by age, oldest first. `view("open")` groups by state in workflow order qualification, plan, working, review. `filter` matches the identifier or title, case-insensitive. `showClosed` includes done and cancelled. `counts().mine` is null (API). `needs()` returns identifiers only. `format.age`.
- [ ] **Step 2:** Run `bun test tests/store.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. Per-ticket enrichment uses `readTicket` and `listRuns` with at most 4 in flight, cached by ticket `revision`/`changed` when present.
- [ ] **Step 4:** Run `bun run check`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(bakers): store with views, filter and needs-you derivation`.

### Task 4: Tab model `lib/tabs.js` and the `bakers-tabs` mod

**Files:** Create `mods/bakers/lib/tabs.js`, `mods/bakers-tabs/main.js` and `mods/bakers-tabs/mod.json` (copied from `v0.1.15` `defaults/mods/tabs` with a header noting the origin and the diff); Test: `tests/tabs.test.ts`

**Interfaces:**
- Consumes: `spaces()`, `run`, `shared`/`setShared`.
- Produces: `openTickets(): {tab, id}[]` (parsed from tab props/names in the active space), `ensureTicketsTab()`, `openTicket(ticket: {uuid,id,state}, {pin: boolean})`, `pin(tabId)`, `syncNames(store)` (renames to `"<ID> <state>"`, or `"<ID> closed"` for done or cancelled), `closeFinished()`, `closeAll()`, and `tabName(t): string`.

- [ ] **Step 1:** Write failing tests:
  - `ensureTicketsTab` creates `tab.new {mod: "bakers", props: {view: "list"}, name: "Tickets"}` then `tab.move {id, index: 1}` when missing, and only `tab.select` when present.
  - `openTicket` (preview) with no preview gives `tab.new {mod: "bakers", props: {view: "ticket", ticket: uuid}, name: "SHOP-41 working"}`, and `bakers.preview` is set.
  - `openTicket` (preview) with an existing preview gives `tab.close {id: old}` before `tab.new`, then `tab.move` to the old index.
  - `openTicket` for an already open ticket gives only `tab.select {id}`, and no second tab.
  - `openTicket(pin)` clears `bakers.preview`.
  - `syncNames` renames on a state change, gives "SHOP-49 closed" for done, and sends nothing when unchanged.
  - `closeFinished` closes only closed ticket tabs; `closeAll` closes every ticket tab but not the Tickets tab.
  - `bakers-tabs`: draws Tickets first with "Tickets 2", italic for the preview tab, a dot (`blocked`) for ids in `bakers.needs`, the Files, Changes and Ticket buttons at the right (Ticket gives `layout.toggle {id: "panel"}` plus `layout.select {stack: "panel-body", child: "ticket"}`), and a tab height of 26 px with 10 px padding and 12 px text.
- [ ] **Step 2:** Run `bun test tests/tabs.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `bun run check`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: ticket tabs with preview, pin, names and the bakers-tabs bar`.

### Task 5: Router, theme, rail, sidebar, status (AC1)

**Files:** Replace `mods/bakers/main.js` (the router on `props().view`, plus `nextCommand` for `tickets`, `goto`, `open`, `panel`, `new`); `mods/bakers/mod.json`; create `mods/bakers/lib/theme.js` and `mods/bakers/views/{rail,sidebar,status}.js`; Test: `tests/chrome.test.ts`

**Interfaces:**
- Produces: `theme.js` exports `tokens()` (the spec mapping over `theme()`), `ui` (shared builders: `button`, `chip("API")`, `pill`, `dot(tone)`, `mono(text)`), and the font constants. The router maps `view` to its class, and an unknown view renders "bakers: unknown view".

- [ ] **Step 1:** Write failing tests:
  - `rail`: the 56 px column, the bakers button 36x36 labelled "b 2" with aria "bakers, 2 tickets need you", whose click sends `bakers.tickets` (ensures the Tickets tab with view needs-me).
  - `sidebar`: "Tickets" with the project picker (projects from `listProjects`); rows Needs me 2, Mine with the API chip (disabled), Open by state 6, then one row per state, then Recently closed with the API chip. A click sets `bakers.view` and ensures the Tickets tab. Width 220 px, padding 12/10 px, 12 px text.
  - `status`: "acme-shop", "2 need you" (`blocked`, 600) and "updated 1m ago", or "bakers offline". A click opens the Tickets tab.
  - Project: with `bakers.project` unset, reads `<active space folder>/.bakers/project.config.js`, matches `project.name` against `listProjects()` and sets `bakers.project`; with no match, takes the first project and opens the picker. An unknown-tool error from `listProjects` keeps the picker disabled with the API chip.
  - Router: `nextCommand` "goto" opens the overlay `{mod: "bakers", props: {view: "goto"}, kind: "popup", width: 480, at: {x: center, y: 120}}`.
- [ ] **Step 2:** Run `bun test tests/chrome.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement with px copied from `TicketTab.dc.html` (sidebar, rail) and `ListTab.dc.html` (status).
- [ ] **Step 4:** Run `bun run check`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(bakers): rail, sidebar section and status item`.

### Task 6: Tickets tab, R2-4 (AC2, AC3)

**Files:** Create `mods/bakers/views/list.js`; Test: `tests/list.test.ts`

**Interfaces:** Consumes the Task 3 store, the Task 4 tabs and the Task 5 `ui`. The "..." menu and the view menu use the `picker` view from Task 11 (`openOverlay {mod: "bakers", props: {view: "picker", kind: "menu", items}}`).

- [ ] **Step 1:** Write failing tests:
  - Header: the view menu button "Needs me" with chevron, the filter placeholder "Filter, / focuses" (220 px), "..." and "New ticket" (`solid`).
  - The "..." items in order: Refresh, Show closed tickets, Close finished ticket tabs, Close all ticket tabs. Each sends its effect (`store.refresh`, toggles showClosed, `tabs.closeFinished`, `tabs.closeAll`).
  - Columns "TICKET TITLE WHY AGENT AGE"; WHY becomes STATE outside Needs me.
  - Rows: SHOP-41 / "Checkout fails with an empty cart" / "Asked a question" (`blocked`, 600) / the agent line / "35m".
  - The selected row has an accent outline, the `selected` background and `aria-current`.
  - Keys: Down moves the selection and sets `bakers.selected`; Enter calls `openTicket` (preview); cmd-Enter and double-click call `openTicket` (pin); `/` focuses the filter; Esc in the filter clears it; `N` opens the new-ticket dialog; `R` refreshes.
  - Empty hint in Needs me: "Nothing else needs you. Switch the view for Mine or Open by state."
  - Key hint: "Enter opens the preview tab, cmd-Enter a pinned tab, N a new ticket, / the filter, R refreshes. Up and down move the selection; the Ticket panel, when shown, follows it."
  - Offline: the CLI's message is shown inline with Retry.
  - Empty project: the hint, no rows, and `bakers.selected` null.
- [ ] **Step 2:** Run `bun test tests/list.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement with the Global Constraints px.
- [ ] **Step 4:** Run `bun run check`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(bakers): Tickets tab per R2-4`.

### Task 7: Go to ticket and the toast (AC3)

**Files:** Create `mods/bakers/views/goto.js` and `mods/bakers/lib/notify.js`; Test: `tests/goto.test.ts`

**Interfaces:** Produces `watchNeeds(prev: string[], next: Row[])`, which posts `notify({title: "<ID> asks a question", body: <first line of the question, up to 120 chars>, level: "warning", action: {name: "bakers.open", args: {ticket: uuid}}})` for each ticket newly in "Asked a question". It is called from the store's `onChange` in the `status` view, which exists once per window.

- [ ] **Step 1:** Write failing tests:
  - Typing "deliv" calls `searchTickets("deliv", project)` once after 200 ms of debounce.
  - Rows show the identifier (mono, 11 px), the title and the state.
  - Enter on SHOP-56 calls `openTicket(pin)`, or `tab.select` when SHOP-56 is open, and then `closeOverlay`.
  - Esc closes and writes nothing.
  - The hint reads "Identifier or words of the title. Enter opens it as a tab, or selects its tab if it is open."
  - `watchNeeds` posts once per newly asking ticket and not again on the next refresh; the toast's `bakers.open` command opens the tab without `pane.focus`.
- [ ] **Step 2:** Run `bun test tests/goto.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `bun run check`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(bakers): Go to ticket popup and question toast`.

### Task 8: Ticket document, R2-3 read side (AC4)

**Files:** Create `mods/bakers/views/ticket.js` and `mods/bakers/lib/markdown.js`; Test: `tests/ticket.test.ts`

**Interfaces:** `A` on a "Plan ready for approval" card calls `confirm("state", {ticket, to: "working"})` (Task 11). Consumes `store.ticket(uuid): Detail` = `{ticket, comments, runs, why, agent}`. Produces `renderMarkdown(src): Element` (Herdr's component if `v0.1.15` has one; else paragraphs, lists, headings, code and links).

- [ ] **Step 1:** Write failing tests:
  - Header: "SHOP-41" (mono), the pill "working" with chevron, "Frozen", the agent line "Claude Code needs you on studio-mac, 35m" (`blocked`), "Edit" and "...".
  - The title is "Checkout fails with an empty cart" at 22 px/600.
  - The card shows "Needs you", "Asked a question, 35m ago", the question text, the buttons "Answer below" and "Answer in the run", and "A acts on this card". The card is absent when `why` is null.
  - "DESCRIPTION" renders the Markdown, then "Click or E to edit.".
  - "COMMENTS 3, NEWEST LAST" lists the comments in order with author, type and age. Plan, spec and summary comments show only their first line until clicked.
  - The document column has max width 760 px.
  - `A` on a plan card calls `confirm("state", {to: "working"})`; nothing is sent before confirming.
  - `A` with a question focuses the composer in answer mode. "Answer in the run" and `G` send `agent.focus {terminal}` for the terminal labelled `bakers.ticket=SHOP-41`; with none, the button is disabled with the reason "The run's terminal is not on this computer".
- [ ] **Step 2:** Run `bun test tests/ticket.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement with the px from `TicketTab.dc.html`.
- [ ] **Step 4:** Run `bun run check`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(bakers): ticket tab document per R2-3`.

### Task 9: Composer and edit mode (AC5)

**Files:** Modify `mods/bakers/views/ticket.js`; create `mods/bakers/views/composer.js`; Test: `tests/composer.test.ts`

- [ ] **Step 1:** Write failing tests:
  - Answer mode shows the label "Answer to the agent's question", the checkbox "Unfreeze and remove the label Question" (checked), "cmd-Enter sends, Esc back to a plain comment", "Just comment" and "Send answer".
  - Send answer (checked) sends, in order, `bakers_comment_publish {ticket, type: "comment", body}`, then `bakers_ticket_update {ticket, frozen: false, labels_remove: ["Question"]}`, then the toast "Answered SHOP-41, the run continues".
  - Unchecked sends only the comment.
  - Just comment sends only the comment.
  - Esc returns to comment mode and keeps the text.
  - When the update fails after the comment, the error says "Comment posted; unfreezing failed: <msg>" and the text stays.
  - The first keystroke pins the tab (`tabs.pin`).
  - Edit: `E` or a click on the description shows the title and description fields. cmd-Enter sends `bakers_ticket_update {ticket, title, description}`. Esc sends nothing. When the ticket's revision changed since edit started, a warning asks before saving.
- [ ] **Step 2:** Run `bun test tests/composer.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `bun run check`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(bakers): composer with answer mode and inline edit`.

### Task 10: Right panel (AC4, AC5)

**Files:** Create `mods/bakers/views/panel.js`; Test: `tests/panel.test.ts`

- [ ] **Step 1:** Write failing tests:
  - It follows the focused ticket tab (`focused().tab`, then that tab's props), else `bakers.selected`.
  - The header shows "SHOP-41" and "working, frozen".
  - "Agent and conductor" shows the line with "on studio-mac, this computer, 1 of 2 busy, 35m", then Show agent, Move to... and Cancel run..., then "R moves, G shows the agent.".
  - "Properties" shows Type bug, Recipe matt, Labels Question and checkout with x and +, Frozen "Yes, 35m" with Unfreeze..., Assignee "-" with API, Reviewers "-" with API, Branch, Parent "-" and Links "MR !91".
  - Type change sends `bakers_ticket_classify {ticket, type}` at once. Label x sends `bakers_ticket_update {labels_remove: [name]}`; label + opens the label picker, and its choice sends `labels_add`.
  - Activity or conductor list reporting an unknown tool shows the API chip instead of an error.
  - Unfreeze..., Move to... and Cancel run... open `confirm` and send nothing before confirming.
  - "Activity" lists events with their ages; "Runs 2" is collapsed and expands on click.
  - Nothing in the panel repeats the description, comments or composer.
- [ ] **Step 2:** Run `bun test tests/panel.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement with the panel px from `TicketTab.dc.html`.
- [ ] **Step 4:** Run `bun run check`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(bakers): ticket context panel`.

### Task 11: Confirm dialogs, pickers, New ticket (AC6, AC3)

**Files:** Create `mods/bakers/views/confirm.js`, `mods/bakers/views/picker.js` and `mods/bakers/views/new-ticket.js`; Test: `tests/dialogs.test.ts`

**Interfaces:** Produces `confirm(kind: "state"|"freeze"|"unfreeze"|"move"|"cancel", args): Promise<{ok: boolean, comment?: string}>` through `openOverlay {mod: "bakers", props: {view: "confirm", kind, ...}, kind: "dialog", modal: true}`, and `pick(kind: "state"|"labels"|"conductor"|"menu", args): Promise<item|null>`.

- [ ] **Step 1:** Write failing tests:
  - State menu: all states with the current one marked, and the API note "All states shown; the server refuses what the workflow forbids.". Choosing Working opens "Move SHOP-56 to working?" with the consequence sentence from frame 4 and an optional comment. Confirming sends `comment_publish` (only when the comment is non-empty) and then `bakers_ticket_transition {ticket, state: "working"}`. Esc and "Keep in plan" send nothing. For Done and Cancelled the text is "This closes SHOP-56. A closed ticket cannot be changed any more."
  - Freeze: "Freeze SHOP-41?"; Keep is the default; Freeze sends `ticket_update {frozen: true}`.
  - Move to: the conductor picker from `listConductors`, then the R3-2 dialog, then `run_cancel`, then `ticket_update {conductor}`. When the second call fails, the error says the run was cancelled and the move failed.
  - Cancel run: the dialog, then `bakers_run_cancel {ticket, reason}`.
  - New ticket: title, type and description. Create sends `bakers_ticket_create {title, project, workflow: <from an existing ticket>, type, description}`, then `openTicket(pin)`.
- [ ] **Step 2:** Run `bun test tests/dialogs.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement with the copy from `Dialogs.dc.html` and `RemoteDialogs.dc.html`.
- [ ] **Step 4:** Run `bun run check`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(bakers): confirm dialogs, pickers and new ticket`.

### Task 12: Layout transform and installer (AC1)

**Files:** Create `mods/bakers/lib/layout.js`, `scripts/install.ts` and `tests/fixtures/herdr-main.json` (copy of `v0.1.15` `defaults/layouts/main.json`, origin noted in `docs/herdr-reference.md`); Test: `tests/layout.test.ts`; Modify `package.json` (`"install:herdr": "bun scripts/install.ts"`), `jsconfig.json` (include `scripts/**/*.ts`)

**Interfaces:** Produces `bakersLayout(main: object): object`, a pure transform, and `mergeKeys(keys: object): {keys, conflicts: string[]}`.

- [ ] **Step 1:** Write failing tests on the fixture:
  - A rail block `{content: {mod: "bakers", props: {view: "rail"}}, size: {px: 56}}` is the first child of root.
  - `sidebar` is 220 px and `hidden: true`, with the `bakers` sidebar block after `agents`.
  - `tabs` uses `bakers-tabs` at 40 px.
  - `panel-body` gains the child `ticket`.
  - The status row holds Herdr's status plus the `bakers` status block.
  - Ids are unique, and every other block of the source is unchanged.
  - `mergeKeys` adds cmd-shift-T, cmd-shift-O, cmd-shift-B and cmd-shift-N, reports conflicts and never overwrites.
  - The transform is idempotent.
- [ ] **Step 2:** Run `bun test tests/layout.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. The installer copies the mods, reads `layouts/main.json` (or `--from <name>`), writes `layouts/bakers.json` and merges `keys.json` with `writeTextFile`-style expected-content checks. It supports `--dry-run`.
- [ ] **Step 4:** Run `bun run check`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: bakers layout transform and installer`.

### Task 13: Screenshot guide and docs (AC8)

**Files:** Create `docs/screenshots.md`; Modify `README.md` (status, install, keys)

- [ ] **Step 1:** Write `docs/screenshots.md`: install (`bun run install:herdr`), `layout.switch {name: "bakers"}`, a window at 1440 x 900, and for each frame the exact state to set up (R2-4: sidebar closed, Needs me, a preview tab open, Go to ticket open with "deliv", a toast showing; R2-3: sidebar open, panel open, a ticket with a question, the composer in answer mode). Add where to attach the images at review and a checklist of the Global Constraints px to compare.
- [ ] **Step 2:** Update the README: status, install, keys (cmd-B, cmd-shift-T, cmd-shift-O, cmd-shift-B) and the API limitations.
- [ ] **Step 3:** Run `bun run check`. Expected: PASS.
- [ ] **Step 4:** Commit `docs: install, keys and screenshot guide`.
