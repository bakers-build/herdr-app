# Core and shell know no domain module: design

Ticket: HERDRAPP-7 (chore, recipe superpowers). Base: `main` at `c2bfbfd`. Build waits until
HERDRAPP-4 (PR #4) is merged into `main`. The plan's first task merges that `main` and checks the
tables in §1 and §2 against it. Any route, list, form, action or shell behaviour that PR #4 adds goes into the
same tables before the golden snapshots are taken.

## Intent

The product owner set one rule for the bakers mod (pg, 2026-11-18): **bottom-up, the generic part
never knows a domain module.** The generic part is `core/`, `form/`, `list/`, `ui/` and the `shell`
frame with its regions. The domain modules are `ticket/`, `project/` and later ones. Dependencies
point only from a domain module to the generic part. The generic part offers extension points, and
domain modules register into them, as Drupal modules fill plugin types, hooks and theme regions.

Why now: `core/tabs.js` encodes tickets, `shell` imports `ticket/` and `project/`, and there are
three registries in three shapes. Each new module would add more cross-knowledge. The owner also
wants the tab bar extensible through extension points.

This is a pure refactor: **nothing a user sees or does changes.**

## Goals

- G1. One registry, `core/registry.js`, for routes, lists, forms, actions, tab kinds and shell
  contributions. The three old registries are removed.
- G1a. **Everything that draws starts with a route** (owner, 2026-11-18). Routes are entries in
  the registry. A drawing contribution to a shell region names only a route, and the shell creates
  that route's controller, as the router does for a tab or an overlay.
- G2. Registration is explicit: each module exports `register()`, and `main.js` calls them. No file
  registers anything as a side effect of being imported.
- G3. `core/tabs.js` manages keyed tabs of registered kinds and knows nothing about tickets.
- G4. `shell` imports no domain module. The rail, sidebar, status block and tab bar draw the
  contributions that modules register.
- G5. Domain work that runs from `shell` today moves into its module: the 60 s refresh, publishing
  the needs-you count, renaming tabs, the question toast, and the `bakers.*` key commands.
- G6. `tests/architecture.test.ts` enforces the rule, and `docs/architecture.md` states it.

## Non-goals

These are out of scope, from the ticket:

- other Herdr mods contributing to bakers extension points;
- upstream Herdr changes (props on `TabInfo`, slots in Herdr's `tabs` mod);
- replacing `ui/components` with gpui-base;
- splitting big controllers such as `ticket/controller/context.js`;
- any visible change.

## Anti-goals

The work fails, even if the tests pass, when any of these happens:

- a pixel, text, key, click or Herdr command differs from `main`;
- a test is weakened or deleted to make the refactor pass (AC6);
- the generic part still knows a module through a back door: a string route name, a `"Tickets"`
  literal, a `bakers.ticket` label, or a comment that names a module;
- an extension point exists for one caller and has no clear shape, so a second module could not use
  it.

## Constraints

- **Mod copies.** Every tab, block and overlay is its own copy of the mod with its own module
  instances. The registry is therefore per copy. `main.js` fills it once per copy, at load, before
  any route runs. Values that copies share still go through `setShared`.
- **Tab identity.** Herdr's `TabInfo` has no props, and `run()` returns no tab id (herdr.d.ts
  v0.1.15). A keyed tab is therefore still recognised by its name. The kind's `match` pattern turns
  a name into a key.
- **Layer rules stay.** Module logic draws nothing. Contributions that draw live in a module's
  `controller/`. A module's `register.js` may import its own controllers, as `routes.js` does
  today.
- **Herdr types.** The code stays plain JavaScript with JSDoc, type-checked by `tsc -p
  jsconfig.json`.

## Design

### 1. The registry: `core/registry.js`

```js
define(type, id, def)   // adds or replaces; def.order (number, default 0) sorts all()
get(type, id)           // the definition or null
all(type)               // [{ ...def, id }] sorted by order, then by definition order
_resetForTests()
```

The registry holds these types:

| type | id | def | registered by |
|---|---|---|---|
| `route` | route name (`ticket.list`, `menu`, …) | the controller class | every module, `ui` (`menu`, `dialog`) |
| `list` | list id (`needs-me`, `state`, …) | the list definition, unchanged | `ticket` |
| `form` | form kind (`create`, `state`, …) | `{ build(props) }` | `ticket` |
| `action` | action name (`ticket.refresh`, `form.open`, …) | `{ run(...args) }` | `ticket`, `project`, `ui` |
| `tab` | kind (`ticket`) | see §2 | `ticket` |
| `rail.item` | e.g. `ticket` | `{ order, route }` (`ticket.rail`) | `ticket` |
| `sidebar.section` | e.g. `ticket` | `{ order, title, route }` (`ticket.sidebar`) | `ticket` |
| `sidebar.tool` | e.g. `project.picker` | `{ section, order, route }` (`project.sidebar-tool`) | `project` |
| `status.item` | e.g. `ticket` | `{ order, route }` (`ticket.status`) | `ticket` |
| `window.task` | e.g. `ticket.refresh` | `{ every, run() }` | `ticket` |
| `command` | the key command's name, e.g. `goto` | `{ run(arg, ctx) }` | `ticket` |
| `tabs.decorate` | e.g. `ticket` | `{ decorate(tab, info) → { label?, dot? } }` | `ticket` |
| `tabs.panel` | panel child id (`files`, `changes`, `ticket`) | `{ order, label, bordered, enabled?() }` | `shell` (Files, Changes), `ticket` (Ticket) |

Lookups by list key move from `list/registry.js` into `list/lookup.js` as `findList(key)`. A key
is still an id, or an id and arguments, for example `state:working`. `form/registry.js` and
`list/registry.js` are deleted. `core/actions.js` keeps only `perform(action, cx)`. It looks up the
action under the `action` type. `copy` stays built into `perform`, because it alone needs the
chooser's `cx`.

**Contributed controllers.** A region creates each contribution's controller once, in its own
`init`, as `new C({ view: route })`, and then calls `init(props, cx)`. In `render(cx)` it calls
the controller's `render(cx)`, and in `close(cx)` it calls `close?.(cx)`. A contribution's
`render` may return an element or an array of elements. The region spreads an array into its own
`children`, so the drawn tree stays identical to today's. A status controller may also have
`click()`; see §3. Contributed routes follow the same naming rule as every route
(`<module>.<name>`).

The non-drawing hooks (`window.task`, `command`, `tabs.decorate`, `tabs.panel`) are behaviour or
data, not regions, so they stay functions and plain definitions.

**The router.** `main.js` looks the route up with `get("route", props().view)`. Each
`routes.js` keeps its map of route names to controllers, and `register.js` defines every entry as
a `route`. `ROUTES` disappears from `main.js`.

Registration: each module, and `ui` for its generic `form.open` action, gets a `register.js`
that exports `register()`. `main.js` calls them in a fixed order (`ui`, `project`, `ticket`,
`shell`) at the top of its module and also exports the function as `registerAll()`. The test
harness calls `registerAll()` after a registry reset, so tests that import a module directly keep
working.

### 2. Generic tabs: `core/tabs.js`

A tab kind is registered as:

```js
define("tab", "ticket", {
  route: "ticket.view",
  props: (key) => ({ ticket: key }),
  match: /^([A-Z][A-Z0-9_]*-\d+) (\S+)$/,   // group 1 = key, group 2 = the name's state part
  home: { name: "Tickets", route: "ticket.list", index: 1 },
});
```

The API is as follows; `kind` is the registered id:

| function | replaces |
|---|---|
| `parseName(name) → { kind, key, rest } \| null` | `parseName` |
| `keyedTabs(kind) → [{ tab, key, rest }]` | `openTickets()` |
| `homeTab(kind)`, `isHome(name) → kind \| null` | `ticketsTab()`, `name === "Tickets"` |
| `openHome(kind)` | `ensureTicketsTab()` |
| `open(kind, key, name, { pin })` | `openTicket(id, name, opts)` |
| `pin(kind, key)` | `pin(id)` |
| `preview() → { kind, key, index } \| null` | `preview()`; the shared `bakers.preview` keeps its shape `{ id, index }`, and the kind is found by matching the preview tab's name against the registered kinds |
| `reconcile()` | the same, for every kind with a `home` |
| `syncNames(kind, nameOf)` | `syncNames(nameOf)` |
| `closeWhere(kind, pred)` | `closeFinished()` (`pred: (t) => t.rest === "closed"`) and `closeAll()` (`pred: () => true`) |
| `focusedKey(kind)` | `focusedTicket()` |
| `_resetForTests()` | the same |

The pending map and the preview-in-place logic stay as they are, keyed by `kind:key`.
`run("tab.new", …)` sends exactly the props it sends today, `{ view: route, ...props(key) }`, so
Herdr's commands are unchanged.

The ticket module keeps its vocabulary in thin helpers in `ticket/tabs.js`. This is module logic
and draws nothing: `openTicket(id, name, opts)`, `pinTicket(id)`, `ensureTicketsTab()`,
`focusedTicket()`, `openTicketIds()`, `syncTicketNames(nameOf)`, `closeFinished()` and
`closeAll()`. Each helper delegates to `core/tabs.js` with
the kind `"ticket"`. Callers inside `ticket/` switch their import from `core/tabs.js` to
`ticket/tabs.js`, so the change stays small.

`runTerminal`, `NO_TERMINAL` and the `bakers.ticket` terminal label move from `core/herdr.js` to
`ticket/terminal.js`. `findNode` and `machineOf` stay in `core/herdr.js`.

### 3. Shell extension points

`shell/` imports only `core/`, `ui/` and `form/`. Each region draws its frame and then its
contributions:

- **Rail.** Shell draws the logo and the Spaces button. Below them come the `rail.item`
  controllers in order. Ticket registers the route `ticket.rail`
  (`ticket/controller/rail.js`): the bakers button with the needs-you count. It reads the shared
  `bakers.needs` and opens the Tickets tab on Needs me.
- **Sidebar.** Shell draws one card per `sidebar.section`. Each card's header holds the section's
  `title` and then its `sidebar.tool` renders, which sit at `ml_auto` as the picker does today. Its
  body is the section controller's render, an array of `navRows`. Ticket registers the section
  `ticket` (title "Tickets", route `ticket.sidebar`, `ticket/controller/sidebar.js`): rows from
  `navItems`, a click sets the view and opens the Tickets tab, and its `init` awaits `ready()` and
  then notifies. Project registers the tool `project.picker` with `section: "ticket"` and the route
  `project.sidebar-tool` (`project/controller/sidebar-tool.js`), the picker button. A module may
  name another module's section id, just as it may name a route.
- **Status.** Shell draws the block: its size, padding, colours, border and pointer. Each
  `status.item` controller (ticket: route `ticket.status`, `ticket/controller/status.js`) renders
  the same text runs as today, as an array. A click on the block runs `click()` on the first item
  controller that has one, so a click anywhere on the block still opens the Tickets tab. The status block remains the once-per-window host. It starts each `window.task` at once and
  then every `every` ms (ticket: refresh, `publishNeeds`, `syncNames`, `watchNeeds`). It
  dispatches each `nextCommand()` to the `command` with that name, passing `{ width, left }`.
  `width` is the block's measured width. `left` is the rail width (56) plus the shown sidebar's
  width, so `goto` centres its popup without knowing the shell's sizes. Ticket registers `goto`,
  `tickets`, `panel`, `new` and `open`. `watchNeeds` moves from `shell/controller/status.js` to
  `ticket/needs.js`. The ticket status item reads `currentProject()` from `project/state.js`,
  which is a public part. The command names stay `bakers.goto` and so on, so the keys
  and the toast do not change.
- **Tab bar.** Shell asks `core/tabs.js` whether a tab is keyed (`parseName`) or a home tab
  (`isHome`). Neither kind gets the program icon or rename on double-click. A keyed tab that is the
  preview is italic, which is generic, because the preview is a core concept. For each tab, every
  `tabs.decorate` may return a `label` ("Tickets 2") and a `dot` (a theme token, `blocked`). Shell draws the dot
  with the id `dot-<tab id>`. A decorated dot replaces Herdr's blocked or done dot, as the needs-you
  dot does today. Panel
  buttons are the `tabs.panel` definitions in order, filtered by `enabled()`. Shell registers
  Files and Changes, enabled by the shared `workspace.panels`. Ticket registers Ticket, which is
  bordered and always enabled. `syncPanel` uses the enabled panel ids.

### 4. Tests

- **Characterisation first.** Before any change, a new `tests/golden.test.ts`
  renders `shell.rail`, `shell.sidebar`, `shell.status` and `shell.tabs`, plus `ticket.list` and
  `ticket.view` for the frames R2-4 and R2-3, on the shop fixture. The tree is serialised with
  each node's calls and texts, and every function is replaced by `"[fn]"`. Each tree is pinned
  with `toMatchSnapshot()` and committed on unchanged `main` code. During the refactor, every
  snapshot must stay byte-identical, and snapshots are never updated (AC5).
- **`tests/core/tabs.test.ts`** is rewritten against a registered test kind with no ticket
  vocabulary. It covers every behaviour: preview replaced in place, pin, home at its index, rename,
  close by predicate and the focused key. A new `tests/ticket/tabs.test.ts` keeps every current
  ticket assertion, with the same expected `run()` calls, through `ticket/tabs.js` (AC4).
- **Router.** "Every route is named after its module and reaches the router" now checks
  `get("route", name)`. A new test in `tests/main.test.ts` checks that an unknown view still draws
  "bakers: unknown view".
- **`tests/core/registry.test.ts`**: define, replace, get, and all in order. The `getList` test in
  `tests/list/run.test.ts` moves to `findList` with the same assertions.
- **`tests/architecture.test.ts`** gains these rules:
  1. In `core/`, `form/`, `list/` and `ui/`, no source text names a module. The module names come
     from the mod's top-level folders minus the framework (`ticket`, `project` today, and `shell`
     too). The test matches the word, its plural and the route prefix `<module>.`, case-insensitive,
     comments included (AC1).
  2. No file under `shell/` imports from another module (AC2).
  3. One registry (AC3):
     - `list/registry.js` and `form/registry.js` do not exist;
     - no file other than `core/registry.js` exports a function named `define…` or `register…`,
       apart from each `register.js`'s own `register`;
     - only `register.js` files call `define(`.
     Maps used inside one file, such as the pending tabs or the store, are not registries.
  4. A module's `register.js` counts as a controller for the "module logic draws nothing" rule.

  The existing rule "the framework never imports a module" stays.
- **Docs**, `docs/architecture.md`: the rule; the registry types table; the extension points;
  `register.js`; and the read/write split. Reads use JSON:API. Writes use `bakers tools`, because
  one call does several things atomically, such as creating a label and linking it, where JSON:API
  would need several uncommitted requests. From bakers 1.0 beta on, server entity and field names
  are not renamed, so the JSON:API coupling is a stable contract (AC7). The tree, routes table and
  rules list are updated.

- **Allowed test edits (AC6).** Moving code may change a test's imports and setup, for example
  `watchNeeds` from `ticket/needs.js`, `findList` in place of `getList`, or calling `registerAll()`.
  Every assertion and every expected value stays as it is. The one exception is
  `tests/core/tabs.test.ts`. Its ticket assertions move unchanged to `tests/ticket/tabs.test.ts`,
  and it then tests a neutral kind.

## What is left to the builder

- the internal names in `core/tabs.js` and the order of a section's parts, as long as the table
  above holds;
- whether `status.item.parts` takes `now` or reads the time itself;
- the copy of the doc's new sections.

## Calls made in this design (not discussed with the owner)

0. Routes move into the registry, and drawing contributions name a route (the owner's answer,
   2026-11-18). The non-drawing hooks stay functions.
1. `copy` stays built into `perform`, not a registry entry, because it needs the chooser's `cx`.
2. The preview's italic is drawn by shell from `core/tabs.preview()`, not through `tabs.decorate`.
3. The project picker is a `sidebar.tool` aimed at the ticket section by id, so the card looks the
   same as today.
4. A click on the status block runs the first item's `click`.
5. Added extension points that the ticket's list does not name, because status needs them today:
   `window.task` and `command`.
6. Each module's `register.js` is called from `main.js`. `main.js` registers once at load, and that
   is the composition root's job, not a feature file's side effect.
7. The shared `bakers.preview` keeps its shape `{ id, index }`. A preview open during an upgrade
   stays italic, and no assertion changes.
8. The `command` context carries `left` as well as `width`, so `ticket` does not hard-code the
   rail width.
9. Golden render snapshots back AC5 automatically. The 1440 x 900 screenshots of R2-4 and R2-3
   are still taken by a person in Herdr Desktop at review (`docs/screenshots.md`). This sandbox has
   no Herdr Desktop.
