# Core and shell know no domain module: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the generic part of the bakers mod (`core/`, `form/`, `list/`, `ui/`, the
`shell` frame) know no domain module, with no change a user can see.

**Architecture:** There is one registry, `core/registry.js`, and it holds the routes too. `main.js`
fills it per mod copy by calling each module's `register()`, and routes through it. Every drawing
contribution names a route, and the shell creates that route's controller. `core/tabs.js` manages keyed tabs of registered kinds.
`shell` draws its frames and the contributions registered at its extension points. Golden render
snapshots, taken before any change, prove that nothing visible moves.

**Tech Stack:** plain ES-module JavaScript with JSDoc (Herdr mod), Bun 1.4.4 (`bun test`), Biome,
`tsc -p jsconfig.json`.

**Spec:** `docs/superpowers/specs/2026-11-18-core-and-shell-know-no-module-design.md`. Read it
first: its §1 registry table, its §2 tabs table and its §3 extension points are the interfaces
used below.

## Global Constraints

- No visible change: every pixel, text, key, click and Herdr command (`run(...)`, `openOverlay`,
  `notify`, `setShared`) stays as on `main`.
- Golden snapshots from Task 1 are never updated (`bun test -u` is forbidden on this branch).
- No test is weakened or deleted. Import and setup edits are allowed only when every assertion and
  expected value stays the same (spec, *Allowed test edits*).
- The shared `bakers.preview` keeps its shape `{ id, index }`. The shared `bakers.needs` keeps
  `{ count, ids, updated }`.
- Key command names stay `bakers.goto`, `bakers.tickets`, `bakers.panel`, `bakers.new` and
  `bakers.open:<id>`.
- Module logic draws nothing. Drawing contributions live in `<module>/controller/`. A module's
  `register.js` may import its controllers.
- `bun run check` is green at the end of every task.

## Review Focus

1. **A preview tab opened before the upgrade.** It is still italic and is still replaced in place.
   Task 4 pins this with a test that seeds `bakers.preview = { id, index }` in the old shape.
2. **An overlay copy (menu, dialog, popup) runs an action or form.** Each copy registers through
   `main.js`, so a menu item's action still runs in that copy. Task 3 pins this with a test that
   loads `main.js` fresh, resets the registry, calls `registerAll()` and performs `["ticket.view",
   "mine"]` through `ui/components/menu.js`.
3. **A tab named like a key of no registered kind.** For example, a terminal tab renamed `FOO-1 x`
   while no kind matches it. It stays a plain tab: it gets the program icon and renames on
   double-click. Task 7 pins this with a test where no kind is registered.
4. **The `goto` popup with the sidebar hidden or shown.** It is at the same x as on `main`. Task 6
   pins this with both cases, keeping the expected `at` values from `main`.
5. **A status block with no items.** For example, before `ticket` registers in a test: it draws an
   empty block and a click does nothing, without throwing. Task 6 pins this.

---

### Task 0: Sync with `main` after PR #4

**Files:** none until the merge.

- [ ] **Step 1:** `forge_fetch`, then confirm that PR #4 (HERDRAPP-4) is merged into
  `origin/main`. If it is not merged, stop and report it. Do not build on the old base.
- [ ] **Step 2:** `forge_update_branch` and follow its `sync`.
- [ ] **Step 3: Inventory.** Each command's output must be covered by the spec's §1 and §2 tables.
  Add any new route, list, form, action, `core/tabs.js` caller or shell import to the spec, and
  commit it with `docs(spec): inventory after PR #4`.

  ```bash
  git grep -nE 'core/tabs|core/actions|list/registry|form/registry|register\(|defineList|defineForm' -- mods
  git grep -nE 'from "\.\./\.\./(ticket|project)/' -- mods/bakers/shell
  ```
- [ ] **Step 4:** Run `bun install --frozen-lockfile && bun run check`. Expected: green.

### Task 1: Golden render snapshots (characterisation)

**Files:**
- Create: `tests/golden.test.ts`, `tests/golden.ts` (the serialiser)
- Create (generated): `tests/__snapshots__/golden.test.ts.snap`

**Interfaces:**
- Produces: `serialise(root: El): unknown`, which returns `{ calls, nodes }` per element. Each
  function inside `calls` becomes `"[fn]"`, keys are sorted, and text nodes stay strings.

- [ ] **Step 1: Write the tests** on unchanged code. Use the shop fixture (`activeSpace`,
  `backend`, `NOW`, `ticketTab`). Each test mounts a route through `main.js`, waits with `flush()`
  and asserts `expect(serialise(view.render())).toMatchSnapshot()`:
  - `golden: shell.rail` — needs count 2;
  - `golden: shell.sidebar` — Needs me selected, project picker available;
  - `golden: shell.status` — the normal case, plus a second test for `bakers offline`;
  - `golden: shell.tabs R2-4` — Tickets active, `SHOP-41 working`, preview `SHOP-56 plan`, and
    `SHOP-49 closed`, with `bakers.needs` `{ count: 2, ids: ["SHOP-41","SHOP-56"] }`, a terminal
    tab `tb3` with a program, Files and Changes enabled, and the panel hidden;
  - `golden: shell.tabs R2-3` — a ticket tab active, the ticket panel shown;
  - `golden: ticket.list R2-4` and `golden: ticket.view R2-3`.

  After the tests, a second block records the Herdr calls of each click and key that the existing
  tests exercise in rail, sidebar, status and tabs. Each records `expect(runs()).toMatchSnapshot()`
  (rail click, sidebar row click, status click, each of `goto` with the sidebar shown and hidden,
  `tickets`, `panel`, `new`, `open:SHOP-41`, tab double-click on `tb3` and on a ticket tab, and a
  Ticket panel click).
- [ ] **Step 2:** Run `bun test tests/golden.test.ts`. Expected: PASS, with the snapshot file
  written. Run it again. Expected: PASS, with no snapshot changes (the output is deterministic).
- [ ] **Step 3: Commit** with `test: golden render snapshots of shell and ticket frames`.
  From here on, `git diff --exit-code tests/__snapshots__` must stay empty.

### Task 2: The registry

**Files:**
- Create: `mods/bakers/core/registry.js`, `tests/core/registry.test.ts`

**Interfaces:**
- Produces:
  - `define(type: string, id: string, def: object): object` (returns `def`);
  - `get(type, id): object | null`;
  - `all(type): ({ id: string } & object)[]`, sorted by `def.order ?? 0`, then by first definition;
  - `_resetForTests(): void`.

- [ ] **Step 1: Failing tests:**
  - `define then get returns the def; unknown type or id is null`;
  - `all sorts by order then by first definition; a redefinition keeps its place and replaces the def`
    (define `a` with order 0, `b` with order -1 and `c` with order 0, then redefine `a`;
    expect `["b","a","c"]` and `a`'s new def);
  - `all of an unknown type is []`;
  - `_resetForTests empties every type`.
- [ ] **Step 2:** Run `bun test tests/core/registry.test.ts`. Expected: FAIL, because the module
  is not found.
- [ ] **Step 3:** Implement it with one `Map<type, Map<id, { def, seq }>>`.
- [ ] **Step 4:** Run the same command. Expected: PASS. Then run `bun run check`. Expected:
  green.
- [ ] **Step 5: Commit** with `feat(core): one registry`.

### Task 3: Routes, lists, forms and actions on the registry; explicit registration

**Files:**
- Create: `mods/bakers/list/lookup.js`, `mods/bakers/ui/register.js`,
  `mods/bakers/ticket/register.js`, `mods/bakers/project/register.js`,
  `mods/bakers/shell/register.js` (empty `register()` for now)
- Modify:
  - `core/actions.js`, `ui/form/dialog.js:10-41`, `main.js`;
  - `ticket/list/*.js`, `ticket/form/create.js`, `ticket/form/confirm.js`;
  - `ticket/commands.js:40-41`, `ticket/state.js:13-15`, `project/state.js:96`;
  - `ticket/controller/list.js:30-31`;
  - `tests/harness.ts` (call `registerAll()` in `reset()`), `tests/list/run.test.ts:93-102`.
- Delete: `list/registry.js`, `form/registry.js`
- Test: `tests/main.test.ts`, `tests/ui/menu.test.ts`

**Interfaces:**
- Consumes: Task 2's `define`, `get` and `all`.
- Produces:
  - `findList(key: string): { def, args: string[], label: string } | null` in `list/lookup.js`.
    It behaves like the old `getList`, over `all("list")`.
  - `perform(action, cx)`: `copy` is still built in; any other name runs `get("action", name)?.run(...args)`.
  - `define("form", kind, { build })`; `ui/form/dialog.js` uses `get("form", kind)?.build`.
  - Each `register.js` exports `register(): void`.
  - `main.js` exports `registerAll(): void`, which calls `ui`, `project`, `ticket` and `shell`
    in that order. It also calls it once at module top. The router uses `get("route",
    props().view)`, and `ROUTES` is removed.
  - Each `register.js` defines every entry of its `routes.js` as `define("route", name, C)`.
    `ui/register.js` defines `menu` and `dialog`.
  - List and form definition files export their definitions and no longer call `define`.
    `ticket/register.js` defines them, the actions `ticket.classify`, `ticket.labels`,
    `ticket.refresh`, `ticket.view`, `ticket.toggleClosed`, `tabs.closeFinished` and
    `tabs.closeAll`, and the forms `create`, `state`, `freeze`, `unfreeze`, `move` and `cancel`.
    `project/register.js` defines `project.choose`. `ui/register.js` defines `form.open`.

- [ ] **Step 1: Failing tests.**
  - In `tests/main.test.ts`, add `registerAll fills lists, forms and actions`. After
    `_resetForTests()` and `registerAll()`, the test expects these, in this order:
    - `all("list").map(d=>d.id)` contains `needs-me`, `mine`, `open`, `state` and `closed`;
    - `get("form","create")` and `get("form","cancel")` exist;
    - `get("action","project.choose")`, `get("action","form.open")` and
      `get("action","tabs.closeAll")` exist.
  - In `tests/ui/menu.test.ts`, add the Review Focus 2 test.
  - In `tests/main.test.ts`, the existing router tests switch from `ROUTES[name]` to
    `get("route", name)` with the same expectations. Add `an unknown view draws "bakers: unknown
    view"`. `tests/architecture.test.ts` "every route … reaches the router" compares
    `get("route", name)` with `routes[name]`.
  - In `tests/list/run.test.ts`, `defineList(x)` becomes `define("list", x.id, x)` and `getList`
    becomes `findList`. The assertions stay the same.
- [ ] **Step 2:** Run `bun test tests/main.test.ts tests/ui/menu.test.ts tests/list`. Expected:
  FAIL, because `registerAll`, `findList` and `core/registry` lookups are missing.
- [ ] **Step 3:** Implement the interfaces above. Remove every top-level `register(`,
  `defineList(` and `defineForm(` call from feature files, and remove the side-effect imports in
  `ticket/routes.js:9-11` and `ticket/list/index.js:5-9`.
- [ ] **Step 4:** Run `bun run check`. Expected: green, and the golden snapshots are unchanged.
- [ ] **Step 5: Commit** with `refactor: lists, forms and actions on one registry, registered explicitly`.

### Task 4: Generic tabs

**Files:**
- Modify: `mods/bakers/core/tabs.js` (rewrite), `core/herdr.js` (remove `runTerminal`,
  `NO_TERMINAL`)
- Create:
  - `mods/bakers/ticket/tabs.js` and `mods/bakers/ticket/terminal.js`;
  - `tests/ticket/tabs.test.ts`, which receives the current `tests/core/tabs.test.ts` cases
    with every assertion unchanged.
- Modify callers:
  - `ticket/store.js:6,156` and `ticket/controller/{list,search,view,context}.js`;
  - `ticket/form/create.js` and `tests/fixtures/shop.ts:286`;
  - temporarily `shell/controller/{rail,sidebar,status,tabs}.js`. Shell may import
    `ticket/tabs.js` until Tasks 5-7 remove those imports.
- Rewrite: `tests/core/tabs.test.ts`, against a neutral kind.

**Interfaces:**
- Consumes: `get("tab", kind)` and `all("tab")`.
- Produces:
  - `core/tabs.js` exports `parseName`, `keyedTabs`, `homeTab`, `isHome`, `openHome`, `open`,
    `pin`, `preview`, `reconcile`, `syncNames`, `closeWhere`, `focusedKey` and `_resetForTests`,
    with the signatures in spec §2.
  - `ticket/tabs.js` exports `openTicket(id, name, opts)`, `pinTicket(id)`, `ensureTicketsTab()`,
    `focusedTicket()`, `openTicketIds(): string[]`, `syncTicketNames(nameOf)`, `closeFinished()`
    and `closeAll()`.
  - `ticket/terminal.js` exports `runTerminal(id, uuid)` and `NO_TERMINAL`, unchanged.
  - `ticket/register.js` defines the `tab` kind `ticket`, exactly as in spec §2.

- [ ] **Step 1: Move the ticket cases.** Copy the current `tests/core/tabs.test.ts` to
  `tests/ticket/tabs.test.ts`. Change only the calls (`tabs.openTicket` becomes
  `ticketTabs.openTicket`, and so on) and leave every `expect` byte-identical. Add the Review
  Focus 1 test.
- [ ] **Step 2: Neutral-kind tests.** In `tests/core/tabs.test.ts`, register the kind `note` with
  `route: "note.view"`, `props: k => ({ note: k })`, `match: /^(N\d+) (\S+)$/` and
  `home: { name: "Notes", route: "note.list", index: 1 }`. Add one test per behaviour:
  - `openHome creates or selects the home tab`;
  - `reconcile keeps home at its index`;
  - `open as preview, then the next preview replaces it in place`;
  - `an open key is only selected`;
  - `a double open before the tab appears opens one`;
  - `pin clears the preview`;
  - `syncNames renames only changed names`;
  - `closeWhere closes matching keyed tabs, never home`;
  - `focusedKey reads the key of the focused tab`;
  - `with no kind registered, parseName is null and nothing is keyed`.
- [ ] **Step 3:** Run `bun test tests/core/tabs.test.ts tests/ticket/tabs.test.ts`. Expected:
  FAIL.
- [ ] **Step 4:** Implement it. Keep `PENDING_MS = 3000` and the pending map keyed `kind:key`.
  `tab.new` sends `{ mod: "bakers", props: { view: route, ...props(key) }, name }`. The home tab
  sends `{ view: home.route }`. Move the callers to `ticket/tabs.js` and `ticket/terminal.js`.
- [ ] **Step 5:** Run `bun run check`. Expected: green, and the golden snapshots are unchanged.
- [ ] **Step 6: Commit** with `refactor(core): generic keyed tabs; the ticket module registers its kind`.

### Task 5: Rail and sidebar extension points

**Files:**
- Modify: `shell/controller/rail.js` and `shell/controller/sidebar.js`
- Create: `ticket/controller/rail.js` (route `ticket.rail`, the bakers button),
  `ticket/controller/sidebar.js` (route `ticket.sidebar`; `render` returns the `navRows` array)
  and `project/controller/sidebar-tool.js` (route `project.sidebar-tool`, the picker button moved
  from `shell/controller/sidebar.js:20-50`)
- Modify: `ticket/routes.js`, `project/routes.js`, `ticket/register.js`, `project/register.js`
- Test: `tests/shell/rail-and-toast.test.ts`, `tests/shell/sidebar.test.ts` (imports only)

**Interfaces:**
- Produces: the definitions `rail.item` `ticket` (`{ order: 0, route: "ticket.rail" }`),
  `sidebar.section` `ticket` (`{ order: 0, title: "Tickets", route: "ticket.sidebar" }`) and
  `sidebar.tool` `project.picker` (`{ section: "ticket", order: 0, route: "project.sidebar-tool" }`).
  The shell's contributed-controller lifecycle is in spec §1, *Contributed controllers*.

- [ ] **Step 1: Failing test.** Add `shell draws registered contributions only` to
  `tests/shell/sidebar.test.ts`. After `_resetForTests()`, register a route `test.x` whose
  controller renders one nav row, a `sidebar.section` `x` (`title: "X"`, `route: "test.x"`) and a
  `rail.item` `y` on a route `test.y`. Also assert that the contributed controller's `init` ran
  once across two renders. Expect texts `["X", <row>]` from the sidebar and
  the rail item, and no "Tickets".
- [ ] **Step 2:** Run `bun test tests/shell`. Expected: FAIL.
- [ ] **Step 3:** Implement it. The rail keeps the logo and Spaces. The sidebar card frame
  (`p(8)`, `gap(2)`, `rounded(6)`, border, surface) moves into the shell's per-section loop. The
  header is `h_flex().gap(6).mb(4).items_center()` with `heading(title)` and then the tools.
  `section.init` is awaited in the sidebar's `init` spawn.
- [ ] **Step 4:** Run `bun run check`. Expected: green, and the golden snapshots are unchanged.
- [ ] **Step 5: Commit** with `refactor(shell): rail items and sidebar sections are contributions`.

### Task 6: Status items, window tasks and commands

**Files:**
- Modify: `shell/controller/status.js`
- Create: `ticket/needs.js` (`watchNeeds`, moved unchanged), `ticket/controller/commands.js`
  (`goto`, `tickets`, `panel`, `new`, `open`, moved from `status.js:71-120`),
  `ticket/window.js` (the window task: refresh, `publishNeeds`, `syncTicketNames`, `watchNeeds`)
  and `ticket/controller/status.js` (route `ticket.status`; `render` returns the parts array and
  `click()` opens the Tickets tab)
- Modify: `ticket/routes.js`, `ticket/register.js`,
  `tests/shell/rail-and-toast.test.ts:6` (import `watchNeeds` from `ticket/needs.js`)
- Test: `tests/shell/status.test.ts`

**Interfaces:**
- Produces:
  - `status.item` `ticket`: `{ order: 0, route: "ticket.status" }`. The controller draws the
    parts from `statusParts(...)` unchanged, and its `click()` is `ensureTicketsTab`;
  - `window.task` `ticket.refresh`: `{ every: 60000, run }`;
  - `command` `goto`, `tickets`, `panel`, `new` and `open`, each `{ run(arg, { width, left }) }`.
  - Shell computes `left = 56 + (shown sidebar ? sidebar.size.px : 0)` and `width` from
    `on_size_change`, with the initial `1440 - 56`.

- [ ] **Step 1: Failing tests** in `tests/shell/status.test.ts`:
  - `a command dispatches to its registered handler with width and left`;
  - `an unknown command does nothing`;
  - `status with no items draws an empty block and a click does nothing` (Review Focus 5);
  - `goto keeps its x with the sidebar shown and hidden` (Review Focus 4; values from the Task 1
    snapshot).
- [ ] **Step 2:** Run `bun test tests/shell`. Expected: FAIL.
- [ ] **Step 3:** Implement it. Shell keeps the block's styling and `on_size_change`. It starts
  each `window.task` with `tick(cx)` and `cx.timer.every(every, tick)`. The command loop dispatches
  `name` and `arg` as today.
- [ ] **Step 4:** Run `bun run check`. Expected: green, and the golden snapshots are unchanged.
- [ ] **Step 5: Commit** with `refactor(shell): status items, window tasks and commands are contributions`.

### Task 7: Tab bar decorations and panel buttons

**Files:**
- Modify: `shell/controller/tabs.js:16, 94-178, 194-243`
- Modify: `shell/register.js` (the `tabs.panel` definitions `files`, order 0, label `Files`,
  `bordered: false`, enabled when the shared `workspace.panels` contains it, default `["files",
  "changes"]`; and `changes`, order 1, likewise)
- Modify: `ticket/register.js` (the `tabs.panel` `ticket`, order 2, `Ticket`, `bordered: true`;
  and the `tabs.decorate` `ticket`, which gives the label `Tickets <n>` on the home tab when
  `needs.count > 0` and the `dot: "blocked"` on a ticket tab in `needs.ids`)
- Test: `tests/shell/tabs.test.ts`

**Interfaces:**
- Consumes: `parseName`, `isHome`, `preview` and `reconcile` from `core/tabs.js`.
- Produces: `tabs.decorate`'s `decorate(tab, { kind, key, rest, home }) → { label?, dot? } | null`.

- [ ] **Step 1: Failing tests:**
  - `a tab no kind matches is a plain tab` (Review Focus 3): with an empty registry, the tab
    `FOO-1 x` gets the program icon, and a double-click runs `tab.rename`;
  - `panel buttons come from tabs.panel in order and honour enabled`.
- [ ] **Step 2:** Run `bun test tests/shell/tabs.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement it. The italic comes from `preview()` matching the tab's key. A
  decorated dot is drawn as `div().id(\`dot-${c.id}\`).size(6).rounded(3).flex_none().bg(t[dot])`
  and suppresses Herdr's blocked or done dot. `syncPanel` gets the enabled panel ids.
- [ ] **Step 4:** Run `bun run check`. Expected: green, and the golden snapshots are unchanged.
  Also check `git grep -nE 'from "\.\./\.\./(ticket|project)/' -- mods/bakers/shell`. Expected:
  no output.
- [ ] **Step 5: Commit** with `refactor(shell): tab decorations and panel buttons are contributions`.

### Task 8: Architecture rules

**Files:**
- Modify: `tests/architecture.test.ts`
- Modify (wording only): the framework comments that name a module, in `core/errors.js:6`,
  `ui/components/entry.js:3`, `ui/components/status-line.js:2`, `ui/components/callout.js:2`,
  `ui/components/menu.js:1-2`, `list/query.js:4`, `list/run.js:4` and `ui/theme.js:7-8`. Fix
  anything else the new test reports.

**Interfaces:**
- Consumes: the folder layout. `DOMAIN` = the top-level folders minus `FRAMEWORK`, minus
  `main.js` and `mod.json`.

- [ ] **Step 1: Add the tests** from spec §4, items 1 to 4:
  - `the framework names no module, not even in strings or comments`, which matches
    `\b(<m>s?|<m>\.)\b` case-insensitively for each `m` in `DOMAIN`;
  - `shell imports no other module`;
  - `one registry: no other define/register exports, define( only in register.js, old registries gone`;
  - in the drawing rule, `isController` also accepts `register.js`.
- [ ] **Step 2: Prove RED.** Add `// a ticket` to `core/format.js` and
  `import "../../ticket/model.js";` to `shell/controller/rail.js`. Run `bun test
  tests/architecture.test.ts`. Expected: two FAILs naming those files. Revert both.
- [ ] **Step 3:** Fix the comments the first test reports.
- [ ] **Step 4:** Run `bun run check`. Expected: green.
- [ ] **Step 5: Commit** with `test(architecture): the framework and shell know no domain module`.

### Task 9: Architecture doc

**Files:** Modify `docs/architecture.md`.

- [ ] **Step 1:** Update the tree:
  - `core/registry.js`, and `core/tabs.js` described as "keyed tabs of registered kinds";
  - `list/lookup.js`, and each module's `register.js`;
  - `ticket/tabs.js`, `terminal.js`, `needs.js` and `window.js`.

  Remove the two old registries from the tree.
- [ ] **Step 2:** Add these sections:
  - "The rule": bottom-up, the generic part never knows a domain module, and dependencies point
    from modules to the generic part;
  - "Registry and extension points": spec §1's table, plus one paragraph on `register.js` and
    `main.js`'s `registerAll`;
  - in "Reading and writing", the reason and the no-rename rule, worded as in the spec §4 *Docs*
    bullet.
- [ ] **Step 3:** Update "The rules" to match the architecture test, items 1 to 7 plus the new
  ones. Update the "How a screen comes about" step 3 for `findList`.
- [ ] **Step 4:** Run `bun run check`. Expected: green.
- [ ] **Step 5: Commit** with `docs(architecture): the rule, the registry, extension points, read/write split`.

### Task 10: Final verification

- [ ] Run `bun run check`. Expected: green.
- [ ] Run `git diff --exit-code <Task 1 commit> -- tests/__snapshots__`. Expected: no diff.
- [ ] Run `git diff <Task 0 base>..HEAD --stat -- tests` and review it. No deleted test, and no
  changed `expect(...)` line, except the move from `tests/core/tabs.test.ts` to
  `tests/ticket/tabs.test.ts` (compare with `git diff -M`).
- [ ] Record for review: a person takes the R2-4 and R2-3 screenshots at 1440 x 900 on `main` and
  on the branch, per `docs/screenshots.md`, and attaches both pairs.

---

## v3 refinement (approved 2026-11-18, ticket spec `f0ece5ad`, plan `03bb59ce`, test `0d584a97`)

Tasks 0 to 10 are done (`b987aa2` → `2818fa4`). The v3 changes: route definitions are
`{ view, open? }` and live in `register.js` (no `routes.js`); links are built from a route
through `core/router.js`; `controller/` is renamed `view/`. The Global Constraints above still
hold, and route names, props, shared keys, key commands and every Herdr call stay the same.

### Task 11: Route definitions in register.js

**Files:**
- Create: `mods/bakers/core/router.js` (`viewOf(route)`), `tests/core/router.test.ts`
- Modify: `mods/bakers/main.js` (route through `viewOf`), `mods/bakers/{ticket,project,shell}/register.js`,
  `mods/bakers/ui/register.js` (`menu`, `dialog` become `{ view }`), `tests/architecture.test.ts`,
  `tests/main.test.ts` (lookup only), and any test that reads `get("route", …)` as a class
- Delete: `mods/bakers/{ticket,project,shell}/routes.js`

**Interfaces:**
- A route definition is `{ view: ViewClass, open?: { kind, width?, height?, modal?, frame?, key?, keep? } }`.
  `open` is filled in Task 12; in this task every route is `{ view }`.
- `viewOf(route: string): ViewClass | null` = `get("route", route)?.view ?? null`.
- The shell's contributions helper creates `new (viewOf(route))(…)`.

- [ ] **Step 1: Failing tests.** `tests/core/router.test.ts`: `viewOf` returns the registered view and
  null for an unknown route. Rewrite the architecture test "every route is named after its module and
  reaches the router": for each module folder, read its `register.js` source, collect every
  `define("route", "<name>"`, expect each name to start with `<module>.`, and expect
  `viewOf(name)` to be a function after `registerAll()`. Keep the same failure strength. Remove
  `routes.js` from the assembler list.
- [ ] **Step 2:** Run `bun test tests/core/router.test.ts tests/architecture.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. Move each `routes.js` entry into `register.js` as
  `define("route", "<name>", { view: C }); // <the entry's comment>`, then delete `routes.js`.
- [ ] **Step 4: Prove RED.** Plant `define("route", "x.y", { view: class {} })` in
  `project/register.js`; the route test fails naming project; revert.
- [ ] **Step 5:** `bun run check` green; golden diff against `502e480` empty.
- [ ] **Step 6: Commit** `refactor: routes are defined in register.js with their view`.

### Task 12: Links from a route

**Files:**
- Modify: `mods/bakers/core/router.js` (`openRoute`), `tests/core/router.test.ts`, every file that calls
  `openOverlay({ mod: "bakers", … })` (about ten: ticket commands, context, detail view, project
  state and sidebar tool, shell tabs, ui menu and dialog), the `register.js` files (`open` fields),
  `tests/architecture.test.ts`

**Interfaces:**
- `openRoute(route: string, params?: Record<string, unknown>, extra?: object): string` calls
  `openOverlay({ mod: "bakers", props: { view: route, ...params }, ...def.open, ...extra })` and
  returns its id. Unknown route: returns null and opens nothing.
- Fields that are fixed per route go into `open`; fields computed per call (`at`, a measured
  `width`) go into `extra`. The resulting `openOverlay` argument must be byte-identical to today
  (the golden snapshots and the existing tests check it, key order included where a test pins it).

- [ ] **Step 1: Failing tests.** `openRoute` sends the merged spec and returns the id; an unknown
  route opens nothing. Architecture rule "only core/router.js opens a bakers overlay": no other
  file contains `openOverlay(` followed by `mod: "bakers"` in the same call.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement and migrate every bakers overlay call. Overlays of other mods
  (`new-menu`) keep their direct call.
- [ ] **Step 4: Prove RED.** Plant a direct `openOverlay({ mod: "bakers", props: { view: "x" } })`
  in a view; the rule fails naming the file; revert.
- [ ] **Step 5:** `bun run check` green; golden diff empty.
- [ ] **Step 6: Commit** `feat(core): links are built from a route`.

### Task 13: controller/ is view/

**Files:** every `mods/bakers/*/controller/` folder, its importers, `tests/architecture.test.ts`,
tests that import from `controller/`, comments.

- [ ] **Step 1:** `git mv mods/bakers/<m>/controller mods/bakers/<m>/view` for ticket, project and
  shell; `git mv mods/bakers/ticket/view/view.js mods/bakers/ticket/view/full.js`. Fix imports.
- [ ] **Step 2:** Rename "controller" to "view" in comments, test names and the layer rules of
  `tests/architecture.test.ts` (the folder check becomes `view`). Assertions and expected values
  stay the same.
- [ ] **Step 3:** `git ls-files 'mods/bakers/*/controller/*'` is empty; `git grep -niw controllers\?
  -- mods tests` shows nothing left that means these classes.
- [ ] **Step 4:** `bun run check` green; golden diff empty.
- [ ] **Step 5: Commit** `refactor: controller/ is view/`.

### Task 14: Docs and final check

- [ ] Update `docs/architecture.md` (route definitions `{ view, open }`, `core/router.js`,
  `openRoute`, links as `{ route, params }`, `view/`, no `routes.js`, the new rule), `main.js`'s
  header and the repo spec doc (a short v3 section).
- [ ] `bun run check` green; `git diff --exit-code 502e480 -- tests/__snapshots__` empty;
  `git diff -M 2818fa4..HEAD -- tests` shows no deleted test and no changed expected value.
- [ ] **Commit** `docs: route definitions, links and views`.
