# Run area tabs: more terminals next to the agent (HERDRAPP-14)

## Intent

The run area under the ticket panel (HERDRAPP-13) shows one terminal: the agent's run. A developer
who follows a run often wants a shell in the same worktree on the same machine, to look at files,
run the tests or start a dev server, without opening a Herdr tab elsewhere and finding the folder.
The run area becomes a set of tabs: the agent's run first, then shells opened with **Execute**,
all belonging to the selected ticket.

Acceptance criteria: AC1–AC8 of the ticket's qualification comment
`19e106c6-1178-4858-8a9c-9a9d59d4de09` (handoff_version 1); this design adds none.

## Goals

- A tab bar in the run header: the agent's tab (first, active by default) and one tab per Execute
  shell of the selected ticket.
- Execute opens an interactive shell through `hc run` on the run's machine, in the run's worktree,
  as a new active tab; Herdr's focus stays where it was.
- Clicking a tab shows its terminal; the others keep running. Execute tabs close (ending the
  shell); the agent's tab never closes and nothing in the bar ends the run.
- Tabs belong to their ticket and survive selecting another ticket and coming back; a shell that
  ends on its own leaves at the next window tick (1 s).

## Non-goals

Other Execute commands (tests, dev server, a picker); reordering or renaming tabs; restoring tabs
after a Herdr restart; shells for tickets without a live run; changes to Herdr, the bakers CLI or
herdr-core.

## Anti-goals

- An Execute shell taken for the agent's run (run detection, Show agent, Answer in the run).
- A `layout.set` on every tick: Herdr rewrites the layout file on each one.
- Herdr adopting the shell as a pane or tab (`herdr.*` labels), or stealing the keyboard focus.

## Decisions

1. **The mod draws the tab bar in its own run header; the terminals sit in a layout stack switched
   with `layout.select`.** Herdr's stack offers a `"header"` (`"tabs"` or a mod), but its built-in
   strip has no documented names, close control or "this tab cannot close", and the Execute button
   must sit beside the tabs anyway. The header block `run-header` is already the mod's
   (`ticket.run`). A stack keeps every terminal block mounted, so switching costs no `layout.set`
   (AC8) and the hidden terminals keep their view.
2. **Layout shape.** Column `run` = `run-header` (32 px block) + stack `run-stack` (weight 1,
   `active` = shown child). Children: `run-terminal` (the agent; id kept, it is stored in layout
   files) and one block per shell, id `run-x-<address>` with `/` turned into `-`
   (`run-x-vps-t9`). A `run` column without `run-stack` (layouts from HERDRAPP-13) is rebuilt once.
3. **Execute starts** `hc run --json --bg --no-parent --cwd <cwd> [--on <machine>] --label
   bakers.exec=<identifier> --label bakers.opened=<ms>` with no argv: that machine's own shell.
   `<cwd>` is the run terminal's `cwd` (from `terminals()`), `<machine>` the run's address prefix
   (`vps/t7` → `vps`, none for this computer). No `herdr.*` label, no `pane.focus`.
4. **Shells are found, not stored.** A ticket's tabs are the live terminals labelled
   `bakers.exec=<identifier>`, ordered by `bakers.opened`. This survives ticket switches and drops
   ended shells by itself. `runTerminal` keeps matching only `bakers.ticket`, so a shell is never
   the run (AC6).
5. **The active tab per ticket** lives in `shared("bakers.runTab")`: `{ [identifier]: <opened> }`,
   the shown shell's `bakers.opened` value. The mod sets that value itself, so nothing parses
   `hc run` output and no address needs a machine prefix. Missing, or a shell that is gone: the
   agent's tab. Execute sets it to the new shell's stamp; a click sets it; Close clears it when it
   named the closed shell.
6. **Writes.** `syncRun` computes the wanted children and active child. Children changed (tab added
   or gone, agent terminal moved, shape migrated) or width or visibility changed as today: one
   `layout.set` with the new `active`. Only the active child changed: `layout.select {stack:
   "run-stack", child}`. Nothing changed: no write. All writes go through the existing 2 s memo.
7. **Close** runs `terminal.kill {terminal}` for the shell, clears its active entry and syncs at once.
   The agent's tab has no close control.
8. **Execute is offered** only when the run header shows a live run with a known `cwd`; otherwise the
   button is absent (AC7). A failed `hc run` (non-zero code, unparsable output) shows a toast with
   its stderr and adds no tab.
9. **When the run ends, its shells keep running unseen** (our call, non-destructive: a shell may
   hold a dev server or unsaved work). The run area hides as today; the shells come back as tabs
   with the ticket's next live run. Nothing kills them but Close or the shell's own exit. Listed
   for the user's acceptance at working.
10. **Tab labels.** Agent tab: `Run <n>` (from `bakers.run`), else `Run`. Shells: `Shell 1`,
   `Shell 2`, … by position. The header keeps the active terminal's address and machine in muted
   text, then Execute and Hide.

## Constraints

- Herdr 0.1.16 API (`types/herdr.d.ts`): `hc(args)`, `run("layout.select" | "layout.set" |
  "terminal.kill")`, `terminals()`, `shared`/`setShared`.
- `terminal.open` with place right/down fails while a layout block has the focus, hence `hc run`.
- `bun run check` passes; README and `docs/architecture.md` describe the tabs.

## Left to the builder

File split inside `mods/bakers/ticket/` (a new `exec.js` for start/close/list beside `terminal.js`
is the suggestion), tab bar styling with the existing `ui` components, and the test harness stub for
`hc`.

## Unverified

- The `cwd` field and `bakers.*` labels of a terminal on another machine (`vps`) in `terminals()`;
  the local check covers this computer only.
- Whether a hidden stack child's terminal view keeps its scroll position: checked live in working.
