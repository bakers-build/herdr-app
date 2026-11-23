// ticket/terminal: a ticket's live run terminal and the run column beside the tabs. The herdr-core
// conductor addon labels run terminals bakers.ticket=<identifier> (and bakers.run); labels match
// case-sensitively, by identifier or UUID. Only a live terminal counts, on this computer (t12) or
// on a machine Herdr is connected to (vps/t7). The column shows the terminal as a layout block, so
// Herdr never takes it over and no tab close ends the run.
import { layout, machines, run, setShared, shared, terminals } from "herdr";
import { findNode, withNode } from "../core/herdr.js";
import { activeRun } from "./rules.js";
import { getStore } from "./store.js";
import { focusedTicket } from "./tabs.js";

// The layout ids, stored in layout files: never rename them.
const BODY = "work-body";
const MAIN = "main";
export const RUN = "run";
const HEADER = "run-header";
export const TERMINAL = "run-terminal";

/** @param {string} id identifier @param {string} [uuid] */
export function runTerminal(id, uuid) {
  return terminals().find((t) => {
    const v = t?.labels?.["bakers.ticket"];
    return t.state === "live" && v != null && (v === id || (uuid && v === uuid));
  });
}

export const NO_TERMINAL = "No live run terminal";

/**
 * Why "Show agent" cannot show the run, or null when it can.
 * @param {{ runs: any[], claim_machine: string | null }} ticket @param {any} terminal
 */
export function runReason(ticket, terminal) {
  if (terminal) return null;
  const m = ticket.claim_machine;
  if (activeRun(ticket.runs) && m && !machines().some((x) => x.name === m))
    return `The run is on ${m}, which Herdr is not connected to`;
  return NO_TERMINAL;
}

/** The last layout write, so a layout() that shows it late does not get it twice. */
/** @type {{ key: string, at: number } | null} */
let last = null;

export function _resetForTests() {
  last = null;
}

/** @param {string} cmd @param {any} args @param {number} now */
function write(cmd, args, now) {
  const key = JSON.stringify([cmd, args]);
  if (last && last.key === key && now - last.at < 2000) return;
  last = { key, at: now };
  run(cmd, args);
}

/** The live run of the ticket tab in front, or null. */
function frontRun() {
  const id = focusedTicket();
  return id ? (runTerminal(id, getStore().byId(id)?.uuid) ?? null) : null;
}

/** The run column showing `address`: a new one, or `col` with only hidden and its terminal changed. */
/** @param {any} col @param {string} address */
function column(col, address) {
  const term = { id: TERMINAL, type: "block", content: { terminal: address } };
  if (!col)
    return {
      id: RUN,
      type: "column",
      size: { weight: 1 },
      children: [
        {
          id: HEADER,
          type: "block",
          size: { px: 32 },
          resizable: false,
          content: { mod: "bakers", props: { view: "ticket.run" } },
        },
        term,
      ],
    };
  const old = findNode(col, TERMINAL);
  const children = old
    ? col.children.map((/** @type {any} */ c) =>
        c.id === TERMINAL ? { ...c, content: term.content } : c,
      )
    : [...(col.children ?? []), term];
  return { ...col, hidden: false, children };
}

/**
 * The window task's tick: the run column shows the front ticket's live run, or hides. Synchronous,
 * and it writes the layout only on a real change (layout.set rewrites the layout file).
 * @param {number} [now]
 */
export function syncRun(now = Date.now()) {
  const root = layout();
  if (!findNode(findNode(root, BODY), MAIN)) return;
  const want = shared("bakers.runHidden") ? null : frontRun();
  const col = findNode(root, RUN);
  if (want) {
    if (findNode(col, TERMINAL)?.content?.terminal !== want.address) {
      const next = withNode(root, column(col, want.address), BODY, MAIN);
      if (next) write("layout.set", { layout: next }, now);
    } else if (col.hidden) write("layout.show", { id: RUN }, now);
  } else if (col && !col.hidden) write("layout.hide", { id: RUN }, now);
  settleFocus(want, now);
}

/**
 * A focus request from showRun, settled once a ticket tab is in front: its run is focused when
 * the request names that ticket. It waits on any other tab, and is dropped after 5 s.
 * @param {any} want @param {number} now
 */
function settleFocus(want, now) {
  const ask = /** @type {{ id: string, at: number } | null} */ (shared("bakers.runFocus"));
  if (!ask) return;
  const id = focusedTicket();
  if (now - ask.at <= 5000 && !id) return;
  if (now - ask.at <= 5000 && want && ask.id === id) run("pane.focus", { terminal: want.address });
  setShared("bakers.runFocus", null);
}

/** The header's Hide: the column stays hidden until showRun; the run is untouched. */
export function hideRun() {
  setShared("bakers.runHidden", true);
  run("layout.hide", { id: RUN });
}

/** "Show agent" and "Answer in the run": show the column, even after Hide, and focus the run. */
/** @param {string} id */
export function showRun(id) {
  setShared("bakers.runHidden", false);
  setShared("bakers.runFocus", { id, at: Date.now() });
  syncRun();
}
