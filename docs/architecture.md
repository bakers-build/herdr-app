# Architecture of the bakers mod

One Herdr mod, `mods/bakers`, placed in several blocks and overlays and routed by
`props().view`, as Herdr's own `win98` mod routes its roles (herdr-app v0.1.15,
`defaults/mods/win98/main.js`). Inside it has five layers. Each one may only use the
layers below it.

```
ui/          the Herdr placements: fetch, map, draw, wire
entity/      the ticket and the project: data, rules, actions, presenters, form definitions
components/  generic drawing, no entity
form/        form handling, once for every form
core/        technique
```

```
mods/bakers/
  main.js                 router: view name -> class; importing the forms registers them
  core/
    cli.js                bakers tools <tool> --data <json> through exec; BakersError
    errors.js             every failure sorted into one kind: offline, api, invalid, denied,
                          conflict, failed
    tabs.js               ticket tabs by name, preview and pin (the names come from presenters)
    herdr.js              the run's terminal (label bakers.ticket), the layout tree
    actions.js            menu actions as data, registered by the layers above
    theme.js, format.js   theme tokens, fonts, icons; ages and first lines
  form/
    state.js              values, field errors, message, busy
    submit.js             validate, conflict check (warn once), steps in order; a failing step
                          names what was done and what failed
    keys.js               cmd-Enter sends and Esc cancels inline; a dialog never writes from a key
    registry.js           dialogs find their form definition by kind
  components/
    button, chip, dot, pill, text, icon, status-line, table, callout, entry, nav, markdown,
    menu, state (loading, failure with Retry)
    form/inputs.js        the retained inputs of a form and the drawing of each field
    form/inline.js        a form in place (the composer, the editor)
    form/dialog.js        the dialog frame of frames 4 and R3-2, for any registered form
  entity/
    ticket/
      data.js             loading: list, ticket, runs, activity, search, conductors; the store
      rules.js            what a ticket means: who needs you, since when, closed
      actions.js          every write (comment, resume, edit, transition, freeze, classify,
                          labels, cancel run, conductor, create), the only place that sends one
      presenter/          view modes: raw data -> props for components, pure
        full.js           the whole ticket (its tab)
        teaser.js         a row of the Tickets tab, the columns and the hints
        context.js        the right panel
        search.js         a Go to ticket result
        notification.js   the question toast
        tab.js            the tab name "<ID> <state>" / "<ID> closed"
        counts.js         sidebar rows, rail label, status item
        states.js         the state menu
        views.js          the names of the views
        agent.js          the agent line the others share
      form/               form definitions: fields, texts, steps; no drawing, no handling
        comment.js        the composer (comment or answer)
        edit.js           title and description
        confirm.js        change state, freeze, unfreeze, move, cancel run
        create.js         New ticket
    project/
      data.js             the window's project (shared uuid, else .bakers/project.config.js)
      presenter/picker.js the project picker's items
  ui/
    layout/               rail, sidebar, tabs-bar (a copy of Herdr's tabs mod), status
    tickets-tab.js        data -> presenter/teaser -> table; keys -> actions
    ticket-tab.js         data -> presenter/full -> components; form/comment, form/edit inline
    panel.js              data -> presenter/context -> components
    goto.js, pickers.js   Go to ticket; project, conductor and label pickers
```

## The rules

Checked by `tests/architecture.test.ts`:

1. **Imports point down**: `core <- form <- components <- entity <- ui`.
2. **An entity uses another entity only through its `data.js`.** For example, the ticket
   needs the project's uuid.
3. **`ui/` files do not import each other.** They meet through shared state, overlays by
   view name, and the registries.
4. **The form handling, presenters, form definitions and entity logic draw nothing**: no
   gpui import.
5. **Only `entity/*/data.js` and `actions.js` talk to bakers.** "What sends
   `bakers_ticket_transition`?" has one answer.
6. **One mod.**

## The flow

```
entity/ticket/data  ->  presenter/<view mode>  ->  components  ->  ui wires clicks and keys
   (raw data)            (mapping, pure)            (drawing)        to entity/ticket/actions
```

A form goes through three parts, each existing once:

```
entity/ticket/form/<form>   the definition: fields, texts, steps (each step one action)
form/                       the handling: values, validation, steps, partial failures, keys
components/form/            the drawing: fields, footer, dialog frame
```

For example, Send answer is the comment form with two steps: post the comment (`done:
"Comment posted"`), then, when checked, resume the run (`failed: "unfreezing failed"`). When
the second step fails, the handling says "Comment posted; unfreezing failed: <why>" and keeps
the text. The definition contains no error handling of its own.

## Errors

`core/errors.js` sorts every failure into one kind, and every layer reacts the same way:

| kind | what the user sees |
|---|---|
| `offline` | "bakers offline" in the status item, the message inline with Retry |
| `api` | the API chip in place of a section the CLI cannot serve |
| `invalid` | the error at the field; the form stays open |
| `denied` | the server's words in the form |
| `conflict` | a warning once; sending again goes ahead |
| `failed` | the CLI's words, with Retry where it makes sense |

## How an overlay reaches the rest

A menu, a picker or a dialog is its own mod copy (Herdr's `openOverlay`), so it cannot call
back into the copy that opened it. Two registries bridge that, both filled when `main.js`
imports the entities:

- **Actions** (`core/actions.js`): a menu item carries `[name, ...args]`, for example
  `["ticket.classify", "SHOP-41", { type: "bug" }]`.
- **Forms** (`form/registry.js`): `openForm("state", { ticket, from, to })` opens the
  dialog frame. The frame builds the definition registered as `state`, and `form/submit`
  sends it.

## Where state lives

- **Per window, in memory**: the ticket store and the project. Both are created lazily on
  first use, never at module top level (Herdr's `AGENTS.md`).
- **Shared between copies** (`setShared`): only identifiers, counts and flags:
  `bakers.project`, `bakers.view`, `bakers.selected`, `bakers.preview`, `bakers.needs`,
  `bakers.showClosed`, `bakers.toast`. No ticket content.
- **Per copy**: a placement's own state, such as the open comment folds, a form's values
  and the filter text.

## Tests

The tests mirror the layers:

| folder | what it proves |
|---|---|
| `tests/core/` | the CLI call, error kinds, the tab model |
| `tests/form/` | the form handling: steps, partial failures, conflict, busy, keys |
| `tests/entity/` | data and store, presenters (pure functions: data in, props out), form definitions (texts and which actions in which order) |
| `tests/components/` | generic drawing |
| `tests/ui/` | each placement over stubbed Herdr: the drawn copy and px of the frames, and which click or key sends which Herdr command or bakers call |
| `tests/architecture.test.ts` | the rules above |

`tests/harness.ts` evaluates the real mod source over stubbed `gpui-kit`, `gpui-base` and
`herdr` modules.

## Outside the mod

`scripts/install.ts` copies the mod into the Herdr home, writes `layouts/bakers.json` with
the pure transform `scripts/layout.js`, and merges the keys.
