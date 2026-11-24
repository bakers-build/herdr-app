# Run beside the ticket - design

Ticket: HERDRAPP-8 (bakers.build), acceptance AC1-AC11 in its qualification handoff. Short design:
the ticket's description and its second spike comment decide the shape (variant D); this records
the approach and the calls made on top of them.

## Intent

A ticket's agent run sits beside the ticket in Herdr, so the developer watches and answers it
without searching for it, on this computer or on a connected machine. Today the run terminal
lives in no Herdr tab and "Show agent" (`agent.focus`) does nothing for it.

- **Goals:** the front ticket tab's live run shows in a `run` column right of `main`, header over
  terminal; it follows the front tab; "Show agent" and "Answer in the run" show and focus it;
  "Hide" hides it until one of them.
- **Non-goals:** several runs at once; following the Tickets tab's selected row; changes to Herdr,
  the bakers CLI or herdr-core; the Herdr 0.1.17 pin.
- **Anti-goals:** Herdr taking the terminal over (a `herdr.*` label, a tab, parking), so that a tab
  close ends a run; a layout write on a tick where nothing changed (`layout.set` rewrites the
  layout file).

## Approaches

1. **A second, fast window task (picked).** `ticket.run`, every 1 s, synchronous. It reads
   `focusedTicket()`, `terminals()` and `layout()` and writes only on a real change. Follows a
   tab switch within a second; reads are in memory.
2. Fold it into the 60 s `ticket.refresh` task: up to a minute of lag on every tab switch.
3. React while the tab bar renders: instant, but a side effect in `render`, and the tab bar is the
   shell, which must not know the ticket module.

## Decided

**Ids, chosen for good.** Route names and node ids are stored in layout files (and Herdr keeps
sizes per node id in `layouts/.state/`), so they never change:

| What | Id |
|---|---|
| the run column in `work-body`, right of `main` | `run` |
| its header block | `run-header` |
| its terminal block | `run-terminal` |
| the header's route | `ticket.run` |
| the window task | `ticket.run` |
| Hide, shared between copies | `bakers.runHidden` (boolean) |
| a focus request from the Tickets tab | `bakers.runFocus` (`{ id, at }`) |

The layout ids `work-body`, `main`, `run`, `run-header` and `run-terminal` are named once, at the
top of `ticket/terminal.js`, as `ticket/view/commands.js` names `panel` and `panel-body`.

**The column.** Added after `main` when missing:

```json
{ "id": "run", "type": "column", "size": { "weight": 1 }, "children": [
  { "id": "run-header", "type": "block", "size": { "px": 32 }, "resizable": false,
    "content": { "mod": "bakers", "props": { "view": "ticket.run" } } },
  { "id": "run-terminal", "type": "block", "content": { "terminal": "<address>" } } ] }
```

An existing column keeps its size and every other field; a write changes only its `hidden` and its
`run-terminal` block (AC10).

**Which run.** A terminal of `terminals()` with `state` "live" and label `bakers.ticket` equal to
the ticket's identifier or UUID (the UUID from the store's row when loaded, else the identifier
alone); the first such one. Local (`t12`) and remote (`vps/t7`) addresses are the same to the mod.
`runTerminal` gets the live filter, so a finished run no longer enables "Show agent".

**Why it cannot show** (the disabled reason of "Show agent" and "Answer in the run"; AC6):
`runReason(ticket, terminal)` in `ticket/terminal.js`, null when the live terminal is there.
With an active run (`activeRun(ticket.runs)`) whose `claim_machine` (the machine the list already
shows) is not among Herdr's connected machines (`machines()` names): "The run is on
<claim_machine>, which Herdr is not connected to", so the person knows to add that machine in
Herdr. Otherwise `NO_TERMINAL`, now "No live run terminal". The view computes it and hands it to
the context presenter, which stays pure. The bakers machine name is assumed to equal Herdr's
machine name (`hc machine ls`); a run on this computer without a live terminal also reads "not
connected", since the mod cannot tell this computer's bakers name.

**The sync** (`syncRun()` in `ticket/terminal.js`, the `ticket.run` task's `run`; synchronous, no
`await ready()`, because `shell.status` spawns every tick without waiting for the last):

1. No `work-body` or no `main` in `layout()` (a layout installed with `--from`): do nothing.
2. `want` = null when `bakers.runHidden`, else the live run of `focusedTicket()` (null on the
   Tickets tab, a plain tab, or a ticket without a live run).
3. With `want`: when the column is missing, or `run-terminal` is missing or shows another
   address, one `layout.set` with the column visible and `run-terminal` = `want.address`; else,
   when the column is hidden, `layout.show {id: "run"}`.
4. Without `want`: when the column is there and shown, `layout.hide {id: "run"}`.
5. A focus request (`bakers.runFocus`, at most 5 s old) is settled once a ticket tab is in front:
   when it names that ticket and `want` is shown, `pane.focus {terminal: want.address}`; either
   way the request is cleared. On the Tickets tab or a plain tab it waits; older than 5 s it is
   ignored and cleared.
6. The last write is remembered for 2 s, and the same write is not repeated in that time (in case
   `layout()` shows a write a moment late).

When a run ends, Herdr removes `run-terminal` and leaves the header alone in the column. Step 3
treats that as "no terminal shown": a live run rebuilds the block, and without one step 4 hides
the column.

**Show and focus** (`showRun(id)`): clear `bakers.runHidden`, set `bakers.runFocus` to
`{ id, at: now }`, call `syncRun()`. On a ticket tab that shows and focuses at once. "Show agent"
(G and the panel) and "Answer in the run" call it. On the Tickets tab, the panel first opens the
row's ticket as the preview tab; the next tick after that tab is in front shows and focuses the run.

**Hide.** The header's "Hide" sets `bakers.runHidden` and calls `layout.hide {id: "run"}`; the run
is untouched.

**Header** (`ticket/view/run.js`, route `ticket.run`): reads `run-terminal`'s address from
`layout()` and that terminal from `terminals()`. It shows "Run <bakers.run>", the program's
name, the address, the machine (`machineOf`), and "Hide". It only reads in `render`.

**Generic part.** `core/herdr.js` gets one helper that returns a copy of a layout tree with a
node replaced by id, or inserted after a sibling. It names no module (rule 10).

**Herdr does the rest.** The terminal is in no tab and has no `herdr.*` label, so no tab close ends
it (AC5). `pane.close` is refused while the block has focus, and `focused()` keeps reporting the
front tab, so the column does not flip when the run is clicked.

## Left to the builder

The header's look within the existing ui components; the exact test file names.

## To check live (review, or the run if `herdr-app` and `hc` are reachable)

- A mod's `terminals()` lists remote terminals (AC2 depends on it).
- A ticket's `claim_machine` matches the name Herdr gives that machine.
- `layout.set` works on the installed `bakers` layout from inside the mod.
- Herdr keeps the column's width when the mod puts the terminal block back.
