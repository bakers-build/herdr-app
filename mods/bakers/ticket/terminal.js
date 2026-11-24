// ticket/terminal: a ticket's live run terminal and the run area in the panel. The herdr-core
// conductor addon labels run terminals bakers.ticket=<identifier> (and bakers.run); labels match
// case-sensitively, by identifier or UUID. Only a live terminal counts, on this computer (t12) or
// on a machine Herdr is connected to (vps/t7). The run area (column "run" below the panel's stack
// "panel-body") shows the selected ticket's terminal as a layout block, so Herdr never takes it
// over and nothing ends or relabels the run.
import { layout, machines, run, setShared, shared, terminals } from "herdr";
import { findNode, withNode, withoutNode } from "../core/herdr.js";
import { activeRun } from "./rules.js";
import { getStore } from "./store.js";
import { selectTicket, selectedTicket } from "./tabs.js";

// The layout ids, stored in layout files: never rename them.
export const PANEL = "panel";
export const PANEL_BODY = "panel-body";
export const RUN = "run";
const HEADER = "run-header";
export const TERMINAL = "run-terminal";
/** The panel's installed width (scripts/layout.js) and its width while a run shows. */
export const PANEL_PX = 368;
export const RUN_PX = 480;

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

/** The live run of the selected ticket, or null. */
function selectedRun() {
  const id = selectedTicket();
  return id ? (runTerminal(id, getStore().byId(id)?.uuid) ?? null) : null;
}

/**
 * The run area (column "run") showing `address`, or hidden without one: `col` with only hidden and its
 * terminal changed, else a new one (in place of a `run` that is no column).
 * @param {any} col @param {string | null} address
 */
function column(col, address) {
  const base =
    col?.type === "column"
      ? col
      : {
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
          ],
        };
  if (!address) return { ...base, hidden: true };
  const content = { terminal: address };
  const children = findNode(base, TERMINAL)
    ? base.children.map((/** @type {any} */ c) => (c.id === TERMINAL ? { ...c, content } : c))
    : [...base.children, { id: TERMINAL, type: "block", content }];
  return { ...base, hidden: false, children };
}

/**
 * The panel's size for a shown or gone run: the installed width widens while a run shows and
 * comes back without one; any other width is the user's. Null when it stays.
 * @param {any} panel @param {boolean} showing
 */
function panelSize(panel, showing) {
  const px = panel.size?.px;
  if (showing && px === PANEL_PX) return { ...panel.size, px: RUN_PX };
  if (!showing && px === RUN_PX) return { ...panel.size, px: PANEL_PX };
  return null;
}

/**
 * The window task's tick: the run area below the panel body shows the selected ticket's live
 * run, or hides. Synchronous, and it writes the layout only on a real change (layout.set
 * rewrites the layout file): another terminal, a misplaced column or a width; else layout.show
 * or layout.hide. It never shows or hides the panel and never focuses, but for Show agent.
 * @param {number} [now]
 */
export function syncRun(now = Date.now()) {
  const root = layout();
  const panel = findNode(root, PANEL);
  const body = findNode(panel, PANEL_BODY);
  if (!panel || !body) return;
  // A selection shown in the panel this moment (selectTicket) may not be in layout() yet: the
  // write keeps the panel shown on its ticket child instead of copying the stale tree back.
  const fresh = now - Number(shared("bakers.panelAt") ?? 0) < 2000;
  const onTicket = body.active === "ticket" || fresh;
  const want = shared("bakers.runHidden") || !onTicket ? null : selectedRun();
  const col = findNode(root, RUN);
  if (!col && !want) return settleFocus(want, now);
  const placed = (panel.children ?? []).some((/** @type {any} */ c) => c.id === RUN);
  const size = panelSize(panel, Boolean(want));
  const moved = want && findNode(col, TERMINAL)?.content?.terminal !== want.address;
  if (!placed || moved || size) {
    const base = placed ? root : withoutNode(root, RUN);
    const next = withNode(
      base,
      column(placed ? col : null, want?.address ?? null),
      PANEL,
      PANEL_BODY,
    );
    if (next) {
      const p = findNode(next, PANEL);
      if (size) p.size = size;
      const b = findNode(p, PANEL_BODY);
      if (!b.size) b.size = { weight: 1 };
      if (fresh) {
        p.hidden = false;
        b.active = "ticket";
      }
      write("layout.set", { layout: next }, now);
    }
  } else if (want && col.hidden) write("layout.show", { id: RUN }, now);
  else if (!want && !col.hidden) write("layout.hide", { id: RUN }, now);
  settleFocus(want, now);
}

/**
 * A focus request from Show agent: the run is focused once it shows for the selected ticket the
 * request names. A selection moved elsewhere drops it, and so do 5 s without a run.
 * @param {any} want @param {number} now
 */
function settleFocus(want, now) {
  const ask = /** @type {{ id: string, at: number } | null} */ (shared("bakers.runFocus"));
  if (!ask) return;
  const fresh = now - ask.at <= 5000 && ask.id === selectedTicket();
  if (fresh && !want) return;
  if (fresh) run("pane.focus", { terminal: want.address });
  setShared("bakers.runFocus", null);
}

/** The header's Hide: the run area stays hidden until Show agent; the run is untouched. It goes
 *  through the write memo, so a Show agent right after is never taken for a repeat. */
export function hideRun() {
  setShared("bakers.runHidden", true);
  write("layout.hide", { id: RUN }, Date.now());
}

/** Show agent from anywhere: selects the ticket, shows the panel and its run, even after Hide,
 *  and focuses the run once it shows. @param {string} id */
export function showAgent(id) {
  selectTicket(id);
  setShared("bakers.runHidden", false);
  setShared("bakers.runFocus", { id, at: Date.now() });
  syncRun();
}
