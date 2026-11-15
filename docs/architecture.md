# Architecture of the bakers mod

One Herdr mod, `mods/bakers`, placed in several blocks and overlays and routed by
`props().view`, as Herdr's own `win98` mod routes its roles (herdr-app v0.1.15,
`defaults/mods/win98/main.js`). Inside, the code is cut **vertically**: one folder per
function, each with its own drawing, its own bakers calls and its own menu actions and
dialogs. A thin kernel underneath holds what every function needs, and screens on top only
put functions together.

```
mods/bakers/
  main.js            router: view name -> class; importing every feature registers its actions
  core/              the kernel, knows no function
    cli.js           bakers tools <tool> --data <json> through exec; BakersError; kernel reads
    session.js       the window's project (shared uuid, else .bakers/project.config.js) and store
    store.js         tickets and derived facts: needs-you, agent line, views, counts
    views.js         names and labels of the Tickets tab's views (Needs me, Mine, ...)
    tabs.js          ticket tabs by name, preview and pin, names that follow the state
    actions.js       menu actions as data, registered by the features
    menu.js          the popup menu and the popup list the pickers extend
    dialog.js        the confirm dialog frame (frames 4, R3-2) the features fill
    kit.js           theme mapping, buttons, chips, pills, dots, fonts
    agent.js         the run's terminal (label bakers.ticket) and its machine
    format.js        ages, first lines, agent names
  features/          one folder per function
    list/            the Tickets tab (R2-4): rows, filter, keys, the "..." menu
    views/           the views section of the sidebar
    project/         the project picker
    goto/            Go to ticket (cmd-shift-O)
    needs/           rail button, status item, question toast, Needs-you card
    document/        agent line, title, Markdown description, comments
    answer/          the composer: comment, Send answer (comment, unfreeze, toast)
    edit/            edit title and description, save with the changed-meanwhile warning
    state/           state pill, state menu, change-state dialog, Approve plan...
    freeze/          Freeze... and Unfreeze... dialogs
    run/             Show agent, Move to... (conductor picker, dialog), Cancel run...
    properties/      Type, Recipe, Labels (label picker), Frozen, Branch, Parent, Links
    history/         Activity and Runs
    new-ticket/      the New ticket dialog
    tabs-bar/        the tab bar (a copy of Herdr's tabs mod, view "tabs")
  screens/           placements that compose features, no logic or calls of their own
    ticket-tab.js    a ticket as a tab (R2-3): document + answer + edit + state + freeze + run
    panel.js         the right panel: run + properties + history, following focus or selection
    sidebar.js       the bakers section: project + views
    status.js        the status block, once per window: refresh, toast, global keys
```

## The rules

Checked by `tests/architecture.test.ts`:

1. **Imports point down only**: `screens -> features -> core`.
2. **A feature never imports another feature.** When a screen needs two functions together
   (the Needs-you card's buttons come from `answer`, `run` and `state`), the screen wires
   them: the card takes its buttons as arguments.
3. **Core imports nothing above it.** It refers to a feature's overlay only by its view name.
4. **Screens make no bakers calls.** Every tool call lives in the feature that owns it, so
   "what sends `bakers_ticket_transition`?" has one answer: `features/state`.
5. **One mod.** The tab bar is the view `tabs` of `bakers`, not a second mod.

## How an overlay reaches a feature

A menu, a picker or a dialog is its own mod copy (Herdr's `openOverlay`), so it cannot call
back into the copy that opened it. Two registries bridge that, both filled when `main.js`
imports the features:

- **Actions** (`core/actions.js`): a menu item carries `[name, ...args]`, for example
  `["properties.classify", "SHOP-41", { type: "bug" }]`. The menu runs it with `perform`.
  Names are prefixed by their feature.
- **Dialogs** (`core/dialog.js`): a feature calls `defineDialog(kind, { copy, write })`,
  and `openDialog(kind, props)` shows the frame. `copy` returns the frame's text,
  `write` does the bakers calls after the primary button. The non-writing button is the
  default; Esc and Enter write nothing.

## Where state lives

- **Per window, in memory**: `core/session.js` creates one store lazily on first use.
  It does not create it at module top level, which follows Herdr's `AGENTS.md`.
- **Shared between copies** (`setShared`): only identifiers, counts and flags:
  `bakers.project`, `bakers.view`, `bakers.selected`, `bakers.preview`, `bakers.needs`,
  `bakers.showClosed`, `bakers.toast`. No ticket content.
- **Per copy**: a screen's own state, such as the open comment folds, the editor and the
  composer text.

## Tests

The tests mirror the folders: `tests/core/`, `tests/features/`, `tests/screens/`, plus
`tests/main.test.ts` (router), `tests/install.test.ts` (layout transform and installer)
and `tests/architecture.test.ts` (the rules). Each one evaluates the real mod source over
stubbed `gpui-kit`, `gpui-base` and `herdr` modules (`tests/harness.ts`). It drives clicks
and keys, and asserts on the drawn copy and px and on the exact Herdr commands and bakers
tool calls.

## Outside the mod

`scripts/install.ts` copies the mod into the Herdr home, writes `layouts/bakers.json` with
the pure transform `scripts/layout.js`, and merges the keys. It is installer code, so it is
not part of the mod.
