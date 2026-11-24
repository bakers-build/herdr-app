# Architecture of the bakers mod

`mods/bakers` is one Herdr mod. Herdr places it in several blocks, tabs and overlays, and
gives each copy a **route name** in `props().view`. The router (`main.js`) runs that route's
**view**. Views belong to **modules** (ticket, project, shell). The modules build
on a small **framework**: logic (core, form, list) and drawing (ui). The structure follows Drupal: a
module brings its entity's model, its lists (Views), its view modes, its forms, its
operations, its views and its routes, and registers them in the framework's registry.

## The rule

**Bottom-up: the generic part never knows a domain module.** The generic part is `core/`,
`form/`, `list/`, `ui/` and the `shell` frame with its regions. The domain modules are
`ticket/`, `project/` and any later one. Dependencies point only from a domain module to the
generic part. The generic part offers extension points, and the modules register into them, as
Drupal modules fill plugin types, hooks and theme regions.

`tests/architecture.test.ts` keeps the rule: the framework names no module (not even in
strings or comments), and the shell imports none.

```
mods/bakers/
  main.js                       router: props().view → route (registry) → view;
                                registerAll() calls every register()

  core/      framework logic    technique, knows no module
    cli.js                        the bakers CLI: tools (writes), auth token, dropsh
    api.js                        reading JSON:API with the CLI's short-lived token (fetch);
                                  bakers dropsh for an older CLI; a new token after a 401
    jsonapi.js                    a JSON:API document as plain entities (includes resolved)
    errors.js                     every failure in one kind: offline, api, invalid, denied,
                                  conflict, failed
    router.js                     viewOf(route) and openRoute(route, params, extra): the view
                                  a route names, and a route opened as an overlay
    registry.js                   the one registry: define(type, id, def), get, all (by order)
    tabs.js                       keyed tabs of registered kinds: by name, preview and pin
    herdr.js                      a terminal's machine, the layout tree (find a node, put a node)
    actions.js, format.js
  form/      framework logic    form handling, once for every form: state, submit (validate,
                                  conflict warning, steps with partial failures), keys
  list/      framework logic    list engine (like Views): run (filters, derived filters, exposed
                                  filter, sort, group, pager), query (a server list's query),
                                  lookup (findList: a list by key, also "state:working")
  ui/        framework drawing  generic drawing, knows no entity
    components/                   button, chip, dot, pill, text, status-line, table, pager,
                                  callout, entry, nav, markdown, menu, state
    form/                         drawing forms: inputs, the inline form, the dialog frame
    register.js                   the routes menu and dialog, the action form.open
    theme.js                      the wireframe's grays mapped onto Herdr's theme tokens, fonts
    icons/                        the mod's SVGs

  ticket/    module
    register.js                   what the module puts in the registry (see below), among it
                                  the routes ticket.list, ticket.context,
                                  ticket.run, ticket.rail, ticket.sidebar, ticket.status,
                                  ticket.actions, ticket.label-picker
    model.js                      the Ticket, Run, Comment shapes (JSDoc) and the mapping from
                                  JSON:API entities
    rules.js                      what a ticket means: who needs you, since when, closed
    repository.js                 reads (JSON:API): open tickets, plans, one ticket, activity,
                                  search, conductors, a list's server query
    commands.js                   writes (bakers tools): comment, resume, edit, transition,
                                  freeze, cancel run, conductor, create, classify, labels
    store.js                      the window's open tickets in memory, refresh, derived facts
    state.js                      shared UI state: the chosen list, Show closed
    tabs.js                       the selection (bakers.selected): select a ticket into the
                                  panel, the ticket in front, the Tickets tab, leftover tabs
    terminal.js                   a ticket's live run terminal and the run area in the panel
    needs.js                      the toast for a ticket that newly asks a question
    window.js                     the window task: refresh, needs count, toasts; closes leftover
                                  ticket tabs once
    presenter/                    view modes, one ticket → props: full, teaser, context,
                                  search, notification, counts; field/agent-line
    list/                         list definitions: needs-me, mine, open, state, closed;
                                  index (navigation order, counts, view menu, empty text)
    form/                         form definitions: comment, edit, confirm (state, freeze,
                                  unfreeze, move, cancel), create, section (a panel section
                                  edited in a popup)
    operations/                   what one can do with a ticket: its actions (one list for the
                                  "..." menu, the keys G and R and the actions palette), the
                                  state menu, the "..." menu
    view/                         list, context (the panel: the selected ticket's work area),
                                  document (its document part and keys), run (the run
                                  area's header), rail, sidebar, status,
                                  actions (the cmd-K palette, also cmd-shift-O and Move to),
                                  label-picker;
                                  commands (key commands)
  project/   module             register.js (routes project.picker, project.sidebar-tool),
                                  model, repository, state (the window's project),
                                  presenter/picker, view/ (picker, sidebar-tool)
  shell/     module             the bakers part of Herdr's frame: register.js (routes
                                  shell.rail, shell.sidebar, shell.tabs, shell.status),
                                  view/ (the four regions and contributions.js, which
                                  draws what modules contribute); knows no other module
```

## Registry and extension points

`core/registry.js` is the one place where features register what they contribute, by type and
id:

```js
define(type, id, def)   // adds or replaces; def.order (a number, default 0) sorts all()
get(type, id)           // the definition, or null
all(type)               // [{ ...def, id }] sorted by order, then by first definition
```

A type is any string. The registry knows none of them. The types the mod uses:

| type | id | definition | registered by |
|---|---|---|---|
| `route` | route name (`ticket.list`, `menu`, …) | `{ view, open? }`: the view class and the route's fixed overlay fields | every module, `ui` (`menu`, `dialog`) |
| `list` | list id (`needs-me`, `state`, …) | the list definition | `ticket` |
| `form` | form kind (`create`, `state`, …) | `{ build(props) }` | `ticket` |
| `action` | action name (`ticket.refresh`, `form.open`, …) | `{ run(...args) }` | `ticket`, `project`, `ui` |
| `tab` | kind (`ticket`) | `{ route, props(key), match, home? }`: a keyed tab of the kind; `match` reads the key (group 1) and the rest of the name (group 2), must accept `<key> <word>` (the key alone is tried as `<key> x`), and the kinds must not overlap; `home` is `{ name, route, index }` | `ticket` |
| `rail.item` | e.g. `ticket` | `{ order, route }` | `ticket` |
| `sidebar.section` | e.g. `ticket` | `{ order, title, route }` | `ticket` |
| `sidebar.tool` | e.g. `project.picker` | `{ section, order, route }`: a button in the section's card | `project` |
| `status.item` | e.g. `ticket` | `{ order, route }` | `ticket` |
| `window.task` | `ticket.refresh`, `ticket.run` | `{ every, run() }` | `ticket` |
| `command` | a key command's name (`goto`, `new`, `tickets`, `panel`, `open`, `actions`) | `{ label?, run(arg, ctx) }`: `arg` is the text after the name, `ctx = { width, left }` (the status bar width, the x of its left edge); a command with a `label` is listed in the actions palette, in registry order | `ticket` |
| `tabs.decorate` | e.g. `ticket` | `{ decorate(tab, info) → { label?, dot? } \| null }`: `info = { kind, key, rest, home }` (`kind`, `key` and `rest` are null on a plain tab); `dot` is a theme token | `ticket` |
| `tabs.panel` | panel child id (`files`, `changes`, `ticket`) | `{ order, label, bordered, enabled?() }` | `shell` (Files, Changes), `ticket` (Ticket) |

**Who reads what.**
- The router (`main.js`) reads `route` through `viewOf`. `core/actions.js` (`perform`) reads `action`;
  `copy` alone is built in, because it needs the chooser's context. `list/lookup.js`
  (`findList`) reads `list`. `ui/form/dialog.js` reads `form`. `core/tabs.js` reads `tab`.
- The shell reads the rest. `shell.rail`, `shell.sidebar` and `shell.status` draw `rail.item`,
  `sidebar.section` (with its `sidebar.tool` buttons) and `status.item`, in order. Each
  contribution names a route. `shell/view/contributions.js` finds the view with `viewOf`,
  makes it once from that route, starts it with `init`, draws it with `render` (an element or
  an array of them) and stops it with `close`. A click on the status block runs the first item
  whose view has `click()`.
- `shell.status` also starts every `window.task` (now and every `every` ms) and runs the key
  commands through `command`.
- `shell.tabs` asks every `tabs.decorate` about every tab. The merged result takes the first
  label and the first dot, in registry order. Its panel buttons are the `tabs.panel`
  definitions that are enabled, in order. `syncPanel` gets the ids stored in
  `workspace.panels`, followed by the other enabled panels.

**`register.js`.** Each module, and `ui` for its generic parts, has a `register.js` that
exports `register()`. It defines the module's contributions, among them its routes, one per
line, each with a comment saying where Herdr shows it:

```js
define("route", "ticket.list", { view: List }); // tab "Tickets"
define("route", "ticket.label-picker", { view: LabelPicker, open: { kind: "popup", width: 220 } }); // popup, props.ticket
```

`view` is the view class (gpui-kit's `View` contract: `init`, `render`, `close`). `open` is
optional and holds the overlay fields the route always has when it is opened as one: `kind`,
`width`, `height`, `modal`, `frame`, `key`, `keep`. There is no `routes.js`.

Nothing registers as a side effect of an import. `main.js` exports
`registerAll()`, which calls `ui`, `project`, `ticket` and `shell` in this order, and calls it
once when it loads, so every copy of the mod has a full registry. The tests call it after a
registry reset.

## Links

`core/router.js` is the one place that opens a bakers overlay:

```js
viewOf(route)                      // the view class, or null for an unknown route
openRoute(route, params = {}, extra = {})
  // → openOverlay({ mod: "bakers", props: { view: route, ...params }, ...def.open, ...extra })
  // returns the overlay id, or null for an unknown route
```

A link is data: `{ route, params }`. `params` join the view's props. `open` (in the route's
definition) holds the fixed fields of the route; `extra` holds the fields computed per call,
such as `at`, and wins over `open`. Herdr's own `menu` mod (the tab context menu) and the
`new-menu` mod keep their own `openOverlay` call.

## The routes

| Route (`props.view`) | View | Herdr shows it as |
|---|---|---|
| `ticket.list` | `ticket/view/list.js` | the tab "Tickets" |
| `ticket.context` | `ticket/view/context.js` | the right panel's child `ticket`: the selected ticket, whole |
| `ticket.run` | `ticket/view/run.js` | the header block `run-header` of the run area `run` in the panel, below `panel-body` (installed hidden; `ticket/terminal.js` adds the terminal) |
| `ticket.actions` | `ticket/view/actions.js` | a window Herdr centres (Esc reaches the mod): cmd-K, cmd-shift-O (`page: "tickets"`), Move to (`page: "move"`) |
| `ticket.rail`, `ticket.sidebar`, `ticket.status` | `ticket/view/…` | what the ticket module contributes to the shell's rail, sidebar and status |
| `ticket.label-picker` | `ticket/view/label-picker.js` | a popup |
| `project.picker` | `project/view/picker.js` | a popup from the sidebar |
| `project.sidebar-tool` | `project/view/sidebar-tool.js` | the project button in the Tickets card |
| `shell.rail`, `shell.sidebar`, `shell.tabs`, `shell.status` | `shell/view/…` | layout blocks (`scripts/layout.js`) |
| `menu`, `dialog` | `ui/components/menu.js`, `ui/form/dialog.js` | popup menus, form dialogs |

Herdr stores route names in its open tabs and layouts, so a route is never renamed. A route
that goes (the old detail tab's) is removed, never reused: the window task closes the tabs left
with it.

## The panel and the run

The right panel (`panel`, a column) holds the stack `panel-body` (Herdr's Files and Changes and
the child `ticket`) and below it the run area `run` (a column: `run-header` and the run's
terminal block `run-terminal`), 1:1, so Herdr's divider between them is the drag handle.

- **The selection** (`bakers.selected`) is the one source. `ticket/tabs.js` `selectTicket`
  sets it and shows the panel on `ticket`; the list's Enter, cmd-Enter and double click, Go to
  ticket, a new ticket and a toast click use it. Arrows only move the selection.
- **The run follows the selection.** The window task `ticket.run` (every second,
  `ticket/terminal.js` `syncRun`) shows the selected ticket's live run (local `t7` or remote
  `vps/t7`) while the panel is on `ticket`, else hides the run area. It calls `layout.set` only
  when the terminal, the column's place or the panel's width changes, otherwise `layout.show`
  or `layout.hide`, and never focuses, ends or relabels a run.
- **Width.** While a run shows, the installed width (368 px) becomes 480 px and back without a
  run; any other width is the user's and stays.
- **Show agent** (G, the buttons) selects the ticket, shows the panel and the run, even after
  Hide, and focuses the run's terminal once it shows. Hide goes through the same write memo, so a
  Show agent right after it is never taken for a repeat.

## How a screen comes about

The Tickets list, from Herdr to the pixels:

1. **Herdr** shows the tab with `props.view = "ticket.list"`.
2. **`main.js`** looks the route's view up with `viewOf` (the `route` type of the registry) and
   runs `ticket/view/list.js`.
3. **The view** looks up the chosen list (`ticket/state.js` → `"state:working"`) with
   `findList` (`list/lookup.js`), which reads the `list` type of the registry: the definition `ticket/list/state.js` with the argument `working`.
4. **The data:**
   - A local list takes the store's open tickets (`ticket/store.js`, loaded by
     `ticket/repository.js` through `core/api.js`).
   - A server list (Recently closed) loads its pages through `repository.query`, built from
     its definition by `list/query.js`.
5. **`list/run.js`** applies the definition's filters, derived filters, the exposed filter
   (the filter field), sort, group and pager.
6. **`ticket/presenter/teaser.js`** turns each record into row props.
7. **`ui/components/table.js`** and `ui/components/pager.js` draw them.
8. **The view** wires Up and Down, Enter, cmd-Enter, N, R and the menus. These go to the
   selection (`ticket/tabs.js`, the panel follows), to forms (`ui/form/dialog.js` with
   `ticket/form/create.js`) and to registered actions.

The panel goes the same way:
- `ticket/view/context.js` follows `bakers.selected` and makes one `TicketDocument`
  (`ticket/view/document.js`) per ticket, which loads it (`store.ticket` →
  `repository.readTicket`, one request with `include`); the panel adds its activity.
- It maps the ticket with the view modes `presenter/full.js` (the document) and
  `presenter/context.js` (agent, properties, activity, runs) and draws them.
- The document holds two inline forms, `form/comment.js` (the composer) and `form/edit.js`.
- Its menus and its keys G and R come from `operations/`.

## A list definition

```js
// ticket/list/closed.js
defineList({
  id: "closed",
  label: "Recently closed",
  query: { filters: [{ field: "project_id.id", op: "=", value: (ctx) => ctx.project },
                     { field: "closed", op: "=", value: true }],
           sort: "-closed_date" },        // a server list: the server filters, sorts, pages
  load: query,                            // ticket/repository.js
  exposed: { fields: ["id", "title"] },   // the filter field of the screen
  pager: { type: "more", limit: 50 },     // "Show 50 more"
  row: { mode: "teaser" },
  empty: "No other closed tickets.",
  count: false,
});
```

The other parts a definition may have:
- `filters`: local conditions;
- `derived`: conditions on derived facts, such as who needs you;
- `sort` and `group`;
- `args`: through the key, `state:working`;
- `sub`, `api`, `disabled`, `dim`: for the navigation.

The open lists filter the store's open tickets locally, because the sidebar, the rail and the
status need their counts anyway. Only closed tickets are loaded page by page from the server.

## A form

A form has three parts, each existing once:

| Part | Where | What |
|---|---|---|
| Definition | `ticket/form/*.js` | fields, texts, buttons; steps, each one command with its `done`/`failed` words |
| Handling | `form/` | values, validation, a conflict warning given once, steps in order, partial failures ("Comment posted; unfreezing failed: …"), keys |
| Drawing | `ui/form/` | fields, the inline form, the dialog frame (a definition with `keys: "inline"` saves on cmd-Enter, Esc cancels, Enter types) |

## Reading and writing

**Reads use JSON:API; writes use `bakers tools`.** The reason for the split: one tool call
does several things atomically, such as creating a label and linking it, where JSON:API needs
several requests that are not committed together. From bakers 1.0 beta on, server entity and
field names are not renamed, so the JSON:API coupling is a stable contract.

**Reads** happen only in `repository.js`. They go to the server's JSON:API with the
developer's own sign-in:
- `bakers auth token` (CLI ≥ 0.10.1-next.11, BAKERS-264) hands out a short-lived token;
- the mod keeps it in memory only;
- with an older CLI the same queries run through `bakers dropsh`.

**Writes** happen only in `commands.js`, through `bakers tools`. Changing state, freezing,
moving or cancelling a run and classifying are operations with workflow rules, not field
updates.

## The rules

`tests/architecture.test.ts` checks, one test each:

1. **The mod is `main.js`, the framework and the modules.** The top level is `core`, `form`,
   `list`, `main.js`, `mod.json`, `project`, `shell`, `ticket`, `ui`.
2. **The framework never imports a module, and its layers point down.** core ← form, list ←
   ui. The logic (core, form, list) never imports ui.
3. **Module logic draws nothing: no gpui, no ui, no views.** Model, rules, repository,
   commands, store, state, presenter, list, form and operations import no gpui, nothing from
   `ui/` and no views. Only `view/` and `register.js` draw or assemble views.
4. **A module uses another module only through its public parts, never its views.** The
   public parts are `model.js`, `state.js`, `store.js`, `presenter/` and `list/`. A view
   reaches another module's view only through route names.
5. **Reads only in `repository.js` (JSON:API), writes only in `commands.js` (bakers tools).**
6. **Every route is named after its module and reaches the router.** Each module's
   `register.js` defines routes with its own prefix (`ticket.`, `project.`, `shell.`), and
   `viewOf` finds a view class for each.
7. **Every route is `menu`, `dialog` or named after a domain module.**
8. **Only `core/router.js` opens a bakers overlay.** No other file calls `openOverlay` with
   `mod: "bakers"`; they call `openRoute`.
9. **No `routes.js` exists.** Routes are defined in `register.js`.
10. **The framework names no module,** not even in strings or comments.
11. **The shell imports no other module.** It draws what they contribute through the registry.
12. **One registry.** No file other than `core/registry.js` exports `define…` or `register…`,
    except each `register.js` (`register`) and `main.js` (`registerAll`). `define(` is called
    only in `register.js`. `list/registry.js` and `form/registry.js` are gone.
13. **There is one mod.**

## Errors

`core/errors.js` sorts every failure into one kind, and every layer reacts the same way:

| kind | what the user sees |
|---|---|
| `offline` | "bakers offline" in the status item, the message inline with Retry |
| `api` | the API chip in place of a section the CLI cannot serve |
| `invalid` | the error at the field; the form stays open |
| `denied` | the server's words in the form |
| `conflict` | a warning once; sending again goes ahead |
| `failed` | the CLI's or the server's words, with Retry where it makes sense |

## Where state lives

- **Per window, in memory:** the project (`project/state.js`), the open tickets
  (`ticket/store.js`) and the token (`core/api.js`). All are created on first use, never at
  module top level (Herdr's `AGENTS.md`).
- **Shared between copies (`setShared`):** identifiers, counts and flags only
  (`bakers.project`, `bakers.view`, `bakers.selected`, `bakers.needs`, `bakers.showClosed`,
  `bakers.runHidden`, `bakers.runFocus`, and core's `bakers.preview` for keyed tabs). No ticket
  content.
- **Per copy:** a view's own state, such as the selection, the page, a form's values and
  the open comment folds.

## Tests

The tests mirror the structure:

| folder | what it proves |
|---|---|
| `tests/core/` | the CLI call, the JSON:API transport (token, 401, dropsh fallback), the normalizer against a real `bb_ticket` read, error kinds, the registry, the tab model |
| `tests/form/` | the form handling |
| `tests/list/` | the list engine: filters, derived filters, exposed filter, sort, group, pager, server query |
| `tests/ui/` | generic drawing |
| `tests/ticket/` | store, presenters (pure), list definitions, form definitions; `view/` drives each route over stubbed Herdr and a JSON:API test server (`tests/fixtures/jsonapi-server.ts`), pins the frames' copy and px, and ties clicks and keys to Herdr commands and bakers calls |
| `tests/project/`, `tests/shell/` | the same for those modules |
| `tests/architecture.test.ts`, `main.test.ts`, `install.test.ts` | the rules, the router, the layout transform and installer |

## Outside the mod

`scripts/install.ts` copies the mod into the Herdr home, writes `layouts/bakers.json` with
the pure transform `scripts/layout.js` (the blocks carry the shell routes), and merges the
keys.
