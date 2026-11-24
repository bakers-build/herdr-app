## Design: the panel is the ticket work area

Base: `origin/next` d8f304c (HERDRAPP-8 run column, cmd-K palette). Scope: AC1–AC12 of the qualification.

### Intent
One place per ticket: the right panel (`panel`) shows the selected ticket's full detail and its live run. No ticket tabs, no `run` column in `work-body`.

### Selection is the one source
- `bakers.selected` (shared) is "the ticket". New `selectTicket(id)` in `ticket/tabs.js`: sets it, `layout.select {stack: panel-body, child: ticket}`, `layout.show {id: panel}`.
- Callers that opened a tab now call `selectTicket`: list Enter, cmd-Enter, double-click (AC1); palette "Go to ticket" rows; create form `after`; `bakers.open:<id>` (toast click). `openTicket`, `pinTicket`, `focusedTicket` go.
- Arrows/click keep only setting `bakers.selected` (AC2). The list's `syncSelection` keeps a selection that is not among its rows (set by goto or create) and picks the first row only when nothing is selected; the list reads an outside change of `bakers.selected` into `this.selected`.
- `frontTicket()` = `bakers.selected` when the Tickets tab is focused or the panel is shown on `ticket`, else null (cmd-K keeps reaching the ticket after Show agent focused its run).
- Store: `tabs: () => openTicketIds()` becomes the selected id, so a ticket outside the list stays loaded.
- Leftover ticket tabs from older layouts: the tab kind `ticket` stays defined (home tab "Tickets"); its `ticket.view` route is removed and the window task closes keyed ticket tabs once per window (`closeAll`). The list menu loses "Close finished/all ticket tabs" and the actions `tabs.closeFinished/closeAll`.

### Panel view (route `ticket.context`, layout child `ticket`; ids never renamed)
`ticket/view/context.js` follows `bakers.selected` only and draws, top to bottom: header (ID, state pill with its menu, Frozen, agent line, Edit, Actions, ...), title, Needs-you card, Agent and conductor, Description, Properties, Comments (acceptance, summary, plan... as today, folded types folded), Activity, Runs; the composer pinned at the bottom (AC3). The document part moves out of `view/full.js` into a reusable `view/document.js` (class with `id`, load, editor, composer, keys A/E/G/R, card); `full.js` and the `ticket.view` route are deleted. The panel never calls `focus()` on load or on a selection change; keys work once the user clicks into it (AC6).

### Run inside the panel
- Tree: `panel` (column) = [`panel-body` (stack, weight 1), `run` (column, weight 1, hidden)], `run` = [`run-header` 32 px, `run-terminal`]. Herdr's divider between them is the drag handle (AC4); 1:1 weights give 50/50.
- `scripts/layout.js` adds `run` (hidden, header only) after `panel-body` and removes a `run` found in `work-body` (AC4).
- `syncRun()` (1 s task): needs `panel` and `panel-body`, else nothing. `want` = live run of `bakers.selected` unless `bakers.runHidden` or `panel-body.active !== "ticket"` (AC6; Herdr's files/changes children get no run below them). A `run` whose parent is not `panel` is moved there in the same write (migration). Writes:
  - `layout.set` only when the run's terminal address changes, the column is missing or misplaced, or the width rule below changes `panel.size` (AC10);
  - else `layout.show/hide {id: run}` when its visibility differs (AC5).
  It never shows or hides `panel` itself and never focuses, except for a focus request (below).
- New `core/herdr.js` helper `withoutNode(root, id)`; `withNode` gets the panel as parent and `panel-body` as `after`.

### Width (AC8)
Constants in `ticket/terminal.js`: `PANEL_PX = 368` (installed), `RUN_PX = 480`; a test pins `PANEL_PX` to `scripts/layout.js`. With a run shown and `panel.size.px === PANEL_PX`, the write sets 480; when the run goes and `panel.size.px === RUN_PX`, it sets 368. Any other width is the user's and is never touched.

### Show agent and Hide (AC7)
- `showAgent(id)`: `selectTicket(id)`, clear `bakers.runHidden`, set `bakers.runFocus {id, at}`, forget the last write, `syncRun()`. The sync focuses the run (`pane.focus {terminal}`) once `want` for `ask.id` is shown, then clears the request; older than 5 s it is dropped. No more waiting for a ticket tab.
- Hide: `bakers.runHidden = true`, `layout.hide {id: run}` through `write()`, so the 2 s memo knows it. F1 was the memo skipping the `layout.show` that followed an unrecorded hide.

### Remote (AC9)
`vps/tN` addresses need no special case (`runTerminal` already matches them). Checked live in working.

### Docs and checks
README and `docs/architecture.md` describe the panel as the ticket work area, without detail tabs or the `run` column (AC11); `bun run check` green with tests for AC1–AC8, AC10 (AC12).

### Decisions (run's calls, auto)
- Arrows move the run and the width with the selection, row by row: AC2, AC6 and AC8 ask for exactly that.
- The run shows only while the panel is on its `ticket` child.
- Section order and the composer at the bottom: chosen for a 368–480 px column; shown at acceptance.
- Leftover ticket tabs are closed rather than kept as dead views.
- Width ownership by comparing with 368/480, no stored state: a drag to exactly 368 counts as default.
- The sync never unhides a hidden panel; only Enter, goto, create, toast and Show agent do.

### Risks / check live
- Whether `layout()` reports a user-dragged `panel` width (AC8 depends on it). If not, the rule above still never shrinks a width it did not write, but may widen over a drag; record what is observed.
- `layout.set` moving `run` from `work-body` into `panel` on an existing install.
