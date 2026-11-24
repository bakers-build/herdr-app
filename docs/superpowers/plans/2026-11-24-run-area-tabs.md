# Run Area Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The run area under the ticket panel shows tabs: the agent's run plus shells opened with
Execute, in the run's worktree on the run's machine (HERDRAPP-14, AC1–AC8).

**Architecture:** A new `ticket/exec.js` finds a ticket's shells by core label and starts and ends
them through `hc run` / `terminal.kill`. `ticket/terminal.js` turns the run column's single
terminal block into the stack `run-stack` and writes `layout.set` only when its children or the
visibility change, `layout.select` when only the active tab changes. The run header view draws the
tab bar, Execute and the close controls.

**Tech Stack:** Herdr mod JavaScript (ES modules, JSDoc types), `bun test` with `tests/harness.ts`
stubs, Biome, `tsc` on `jsconfig.json`.

**Spec:** `docs/superpowers/specs/2026-11-24-run-area-tabs-design.md`

## Global Constraints

- Layout ids `run`, `run-header`, `run-terminal` keep their names; new: `run-stack`, shell blocks
  `run-x-<address with "/" as "-">`.
- Shell labels: `bakers.exec=<identifier>`, `bakers.opened=<ms since epoch>`; never a `herdr.*` label.
- `hc` args, in this order: `run --json --bg --no-parent --cwd <cwd> [--on <machine>] --label
  bakers.exec=<id> --label bakers.opened=<ms>`; no argv (the machine's own shell).
- Shared key `bakers.runTab`: `{ [identifier]: <bakers.opened of the shown shell> }`; absent = agent.
- Tab labels: `Run <bakers.run>` (else `Run`), `Shell 1`, `Shell 2`, … by position.
- Every layout write goes through `write()` in `terminal.js` (2 s memo). No `pane.focus` except Show agent.
- `bun run check` passes; README and `docs/architecture.md` updated.

## Review Focus

1. A shell whose `bakers.opened` label is missing or not a number: sorts last, still shows and closes.
2. The active shell ends on its own: the next tick shows the agent's tab in the same `layout.set`.
3. The run ends while shells live: the run area hides as today; the shells keep running and come
   back with the next run of that ticket.
4. Two tickets with shells: selecting B never shows A's shells; A's `bakers.runTab` entry survives.
5. `hc run` fails (code ≠ 0 or it rejects): one error toast with stderr, no tab, no shared write.

---

### Task 1: Shells of a ticket (`ticket/exec.js`)

**Files:**
- Create: `mods/bakers/ticket/exec.js`
- Modify: `tests/harness.ts` (stub `hc`: records `{fn: "hc", args: [argv]}`, answers from `env.hc`,
  default `{code: 0, stdout: "{}", stderr: ""}`)
- Test: `tests/ticket/exec.test.ts`

**Interfaces:**
- Produces:
  - `EXEC = "bakers.exec"`, `OPENED = "bakers.opened"`, `TAB = "bakers.runTab"`
  - `shells(id: string): any[]` — live terminals with `labels[EXEC] === id`, by `Number(OPENED)`
    ascending, non-numbers last.
  - `shownShell(id: string): any | null` — the shell `shared(TAB)[id]` names, if it is in `shells(id)`.
  - `selectTab(id: string, opened: string | null): void` — sets or deletes the entry, copying the map.
  - `shellArgs(id: string, run: any, now: number): string[] | null` — null when `run?.cwd` is empty.
  - `startShell(id: string, run: any): Promise<boolean>` — `hc(shellArgs(...))`; ok: `selectTab(id,
    String(now))`, true; failure: `notify({title: "Execute failed", body: stderr, level: "error"})`, false.
  - `closeShell(id: string, shell: any): void` — `run("terminal.kill", {terminal: shell.address})`;
    clears the entry when it names this shell.
  - `childId(address: string): string` — `"run-x-" + address.replaceAll("/", "-")`.

- [ ] **Step 1: Failing tests** in `tests/ticket/exec.test.ts`:
  `shells lists a ticket's live shells oldest first, never its run or another ticket's`,
  `shellArgs on this computer: no --on; on vps: --on vps; without cwd: null`
  (expect `["run","--json","--bg","--no-parent","--cwd","/w/shop-41","--on","vps","--label","bakers.exec=SHOP-41","--label","bakers.opened=1000"]` for run `vps/t7`),
  `startShell selects the new shell; a failed hc toasts and selects nothing`,
  `closeShell kills the shell and drops the selection only when it was shown`,
  `a shell without a numeric opened label sorts last`, `childId of vps/t9 is run-x-vps-t9`,
  `runTerminal never returns a shell, even one labelled for the ticket's UUID` (AC6).
- [ ] **Step 2:** `bun test tests/ticket/exec.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement the stub and `exec.js` as above.
- [ ] **Step 4:** `bun test tests/ticket/exec.test.ts` → PASS.
- [ ] **Step 5:** Commit `feat(ticket): shells of a ticket started through hc run`.

### Task 2: The run stack (`ticket/terminal.js`)

**Files:**
- Modify: `mods/bakers/ticket/terminal.js` (`column()`, `syncRun()`), export `STACK = "run-stack"`
- Test: `tests/ticket/terminal.test.ts` (existing shape expectations move into the stack)

**Interfaces:**
- Consumes: `shells`, `shownShell`, `childId` from Task 1.
- Produces: column `run` = [`run-header`, stack `run-stack` {size weight 1, active, children:
  [`run-terminal` {terminal: run}, `childId(s)` {terminal: s.address} per shell]}].

- [ ] **Step 1: Failing tests:**
  `the run sits in run-stack with the ticket's shells after it, the agent active`,
  `only the active tab changed: layout.select {stack: "run-stack", child}, no layout.set` (AC8),
  `a shell that ended leaves in one layout.set, the agent active again` (Review Focus 2),
  `another ticket's shells never show; its selection stays in bakers.runTab` (Review Focus 4),
  `a run column without run-stack is rebuilt once` (HERDRAPP-13 layouts),
  `the run ends while shells live: the column hides, no terminal.kill` (Review Focus 3),
  `an unchanged tick with shells writes nothing`.
- [ ] **Step 2:** `bun test tests/ticket/terminal.test.ts` → the new tests FAIL.
- [ ] **Step 3:** Compare wanted children (ids and terminals) with `findNode(col, STACK)`: differ or
  shape missing → `layout.set` with `active`; else differing `active` → `write("layout.select",
  {stack: STACK, child}, now)`. Show/hide/width logic unchanged.
- [ ] **Step 4:** `bun test tests/ticket` → PASS (all existing terminal tests updated, none dropped).
- [ ] **Step 5:** Commit `feat(ticket): the run area is a stack of the run and its shells`.

### Task 3: Tab bar, Execute and Close (`ticket/view/run.js`)

**Files:**
- Modify: `mods/bakers/ticket/view/run.js`
- Test: `tests/ticket/view/run.test.ts`

**Interfaces:**
- Consumes: Task 1 (`shells`, `shownShell`, `selectTab`, `startShell`, `closeShell`), `syncRun`,
  `selectedTicket()` from `ticket/tabs.js`, `runTerminal`.
- Produces: element ids `run-tab-agent`, `run-tab-<opened>`, `run-close-<opened>`, `run-execute`.

- [ ] **Step 1: Failing tests:**
  `the agent's tab comes first and is active; it has no close` (AC1, AC4),
  `Execute starts a shell with the run's cwd and shows it after the sync; no pane.focus` (AC2),
  `clicking a tab selects it and syncs` (AC3),
  `close kills the shell, never the run` (AC4),
  `no Execute without a live run or without its cwd` (AC7),
  `the header still names the shown terminal's address and machine; Hide still hides`.
- [ ] **Step 2:** `bun test tests/ticket/view/run.test.ts` → FAIL.
- [ ] **Step 3:** Tabs left (`button`/`chip` from `ui/components`, active one highlighted with
  `t.selected`), spacer, muted address and machine of the shown tab, `Execute`, `Hide`. Each click:
  the exec call, then `syncRun()`. Execute is async: `startShell(...).then(() => syncRun())`.
- [ ] **Step 4:** `bun test tests/ticket` → PASS.
- [ ] **Step 5:** Commit `feat(ticket): tabs, Execute and Close in the run header`.

### Task 4: Docs and the whole check

**Files:** `README.md` (Ticket panel rows and the run paragraph), `docs/architecture.md` (`exec.js`
beside `terminal.js`, the `run-stack` shape, `bakers.runTab`).

- [ ] **Step 1:** Update both; `bun run check` → exit 0 (coverage floor included).
- [ ] **Step 2:** Commit `docs: run area tabs`.

## Validation (working state)

Live in Herdr per the ticket's run-mode comment (lock, `bun run install:herdr`, `herdr-app do`,
`screencapture -x`): select a ticket with a live run, Execute twice, switch tabs, close one, select
another ticket and back, `exit` in a shell. Remote (`vps`) stays unverified.
