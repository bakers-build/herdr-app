# Architecture of the bakers mod

`mods/bakers` is one Herdr mod. Herdr places it in several blocks, tabs and overlays, and
gives each copy a **route name** in `props().view`. The router (`main.js`) runs that route's
**controller**. Controllers belong to **modules** (ticket, project, shell). The modules build
on a small **framework** (core, form, list, components). The structure follows Drupal: a
module brings its entity's model, its lists (Views), its view modes, its forms, its
operations, its controllers and its routes.

```
mods/bakers/
  main.js                       router: props().view → route → controller

  core/      framework          technique, knows no module
    cli.js                        the bakers CLI: tools (writes), auth token, dropsh
    api.js                        reading JSON:API with the CLI's short-lived token (fetch);
                                  bakers dropsh for an older CLI; a new token after a 401
    jsonapi.js                    a JSON:API document as plain entities (includes resolved)
    errors.js                     every failure in one kind: offline, api, invalid, denied,
                                  conflict, failed
    tabs.js                       ticket tabs by name, preview and pin
    herdr.js, actions.js, format.js, theme.js
  form/      framework          form handling, once for every form: state, submit (validate,
                                  conflict warning, steps with partial failures), keys, registry
  list/      framework          list engine (like Views): run (filters, derived filters, exposed
                                  filter, sort, group, pager), query (a server list's query),
                                  registry (lists by key, also "state:working")
  components/ framework         generic drawing, no entity: button, chip, dot, pill, text,
                                  status-line, table, pager, callout, entry, nav, markdown,
                                  menu, state; form/ (inputs, inline form, dialog frame)

  ticket/    module
    routes.js                     ticket.list, ticket.view, ticket.context, ticket.search,
                                  ticket.conductor-picker, ticket.label-picker
    model.js                      the Ticket, Run, Comment shapes (JSDoc) and the mapping from
                                  JSON:API entities
    rules.js                      what a ticket means: who needs you, since when, closed
    repository.js                 reads (JSON:API): open tickets, plans, one ticket, activity,
                                  search, conductors, a list's server query
    commands.js                   writes (bakers tools): comment, resume, edit, transition,
                                  freeze, cancel run, conductor, create, classify, labels
    store.js                      the window's open tickets in memory, refresh, derived facts
    state.js                      shared UI state: the chosen list, Show closed
    presenter/                    view modes, one ticket → props: full, teaser, context,
                                  search, notification, tab, counts; field/agent-line
    list/                         list definitions: needs-me, mine, open, state, closed;
                                  index (navigation order, counts, view menu, empty text)
    form/                         form definitions: comment, edit, confirm (state, freeze,
                                  unfreeze, move, cancel), create
    operations/                   what one can do with a ticket: the state menu, the "..." menu
    controller/                   list, view, context, search, conductor-picker, label-picker
  project/   module             routes (project.picker), model, repository, state (the window's
                                  project), presenter/picker, controller/picker
  shell/     module             the bakers part of Herdr's frame: routes (shell.rail,
                                  shell.sidebar, shell.tabs, shell.status), controller/
```

## The routes

| Route (`props.view`) | Controller | Herdr shows it as |
|---|---|---|
| `ticket.list` | `ticket/controller/list.js` | the tab "Tickets" |
| `ticket.view` | `ticket/controller/view.js` | a tab "SHOP-41 working", `props.ticket` |
| `ticket.context` | `ticket/controller/context.js` | the right panel's child `ticket` |
| `ticket.search` | `ticket/controller/search.js` | a popup (cmd-shift-O) |
| `ticket.conductor-picker`, `ticket.label-picker` | `ticket/controller/…` | popups |
| `project.picker` | `project/controller/picker.js` | a popup from the sidebar |
| `shell.rail`, `shell.sidebar`, `shell.tabs`, `shell.status` | `shell/controller/…` | layout blocks (`scripts/layout.js`) |
| `menu`, `dialog` | `components/menu.js`, `components/form/dialog.js` | popup menus, form dialogs |

## How a screen comes about

The Tickets list, from Herdr to the pixels:

1. **Herdr** shows the tab with `props.view = "ticket.list"`.
2. **`main.js`** runs `ticket/controller/list.js`.
3. **The controller** looks up the chosen list (`ticket/state.js` → `"state:working"`) in the
   list registry: the definition `ticket/list/state.js` with the argument `working`.
4. **The data:**
   - A local list takes the store's open tickets (`ticket/store.js`, loaded by
     `ticket/repository.js` through `core/api.js`).
   - A server list (Recently closed) loads its pages through `repository.query`, built from
     its definition by `list/query.js`.
5. **`list/run.js`** applies the definition's filters, derived filters, the exposed filter
   (the filter field), sort, group and pager.
6. **`ticket/presenter/teaser.js`** turns each record into row props.
7. **`components/table.js`** and `components/pager.js` draw them.
8. **The controller** wires Up and Down, Enter, cmd-Enter, N, R and the menus. These go to
   `core/tabs` (preview, pin), to forms (`components/form/dialog.js` with
   `ticket/form/create.js`) and to registered actions.

A ticket tab goes the same way:
- `ticket/controller/view.js` loads one ticket (`store.ticket` → `repository.readTicket`, one
  request with `include`).
- It maps the ticket with the view mode `presenter/full.js` and draws it.
- It holds two inline forms, `form/comment.js` (the composer) and `form/edit.js`.
- Its menus come from `operations/`.

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
| Drawing | `components/form/` | fields, the inline form, the dialog frame |

## Reading and writing

**Reads** happen only in `repository.js`. They go to the server's JSON:API with the
developer's own sign-in:
- `bakers auth token` (CLI ≥ 0.10.1-next.11, BAKERS-264) hands out a short-lived token;
- the mod keeps it in memory only;
- with an older CLI the same queries run through `bakers dropsh`.

**Writes** happen only in `commands.js`, through `bakers tools`. Changing state, freezing,
moving or cancelling a run and classifying are operations with workflow rules, not field
updates.

## The rules

`tests/architecture.test.ts` checks:

1. **The mod's top level** is `main.js`, the framework and the modules.
2. **The framework never imports a module.** Inside it, layers point down: core ← form, list ←
   components.
3. **Module logic draws nothing.** Model, rules, repository, commands, store, state,
   presenter, list, form and operations import no gpui, no components and no controllers.
   Only `controller/` and `routes.js` draw.
4. **Modules meet only through public parts.** A module uses another one only through its
   `model.js`, `state.js`, `store.js`, `presenter/` and `list/`, never its repository,
   commands, forms or controllers. Controllers reach other controllers only through route
   names.
5. **Reads only in `repository.js`, writes only in `commands.js`.**
6. **Every route** is named after its module and reaches the router.
7. **There is one mod.**

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
  (`bakers.project`, `bakers.view`, `bakers.selected`, `bakers.preview`, `bakers.needs`,
  `bakers.showClosed`, `bakers.toast`). No ticket content.
- **Per copy:** a controller's own state, such as the selection, the page, a form's values and
  the open comment folds.

## Tests

The tests mirror the structure:

| folder | what it proves |
|---|---|
| `tests/core/` | the CLI call, the JSON:API transport (token, 401, dropsh fallback), the normalizer against a real `bb_ticket` read, error kinds, the tab model |
| `tests/form/` | the form handling |
| `tests/list/` | the list engine: filters, derived filters, exposed filter, sort, group, pager, server query, registry |
| `tests/components/` | generic drawing |
| `tests/ticket/` | store, presenters (pure), list definitions, form definitions; `controller/` drives each route over stubbed Herdr and a JSON:API test server (`tests/fixtures/jsonapi-server.ts`), pins the frames' copy and px, and ties clicks and keys to Herdr commands and bakers calls |
| `tests/project/`, `tests/shell/` | the same for those modules |
| `tests/architecture.test.ts`, `main.test.ts`, `install.test.ts` | the rules, the router, the layout transform and installer |

## Outside the mod

`scripts/install.ts` copies the mod into the Herdr home, writes `layouts/bakers.json` with
the pure transform `scripts/layout.js` (the blocks carry the shell routes), and merges the
keys.
