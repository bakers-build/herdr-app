// ticket/register: what the ticket module contributes to the registry: its routes, lists,
// forms and the actions its menus run.
import { define } from "../core/registry.js";
import Actions from "./view/actions.js";
import Context from "./view/context.js";
import LabelPicker from "./view/label-picker.js";
import List from "./view/list.js";
import Rail from "./view/rail.js";
import Sidebar from "./view/sidebar.js";
import Status from "./view/status.js";
import Full from "./view/full.js";
import RunHeader from "./view/run.js";
import * as commands from "./view/commands.js";
import { windowTask } from "./window.js";
import { showAgent, syncRun } from "./terminal.js";
import { openRoute } from "../core/router.js";
import { classify, labels } from "./commands.js";
import { cancelForm, freezeForm, moveForm, stateForm, unfreezeForm } from "./form/confirm.js";
import { createForm } from "./form/create.js";
import closed from "./list/closed.js";
import mine from "./list/mine.js";
import needsMe from "./list/needs-me.js";
import open from "./list/open.js";
import state from "./list/state.js";
import { setView, showClosed } from "./state.js";
import { refresh } from "./store.js";
import { setShared, shared } from "herdr";

/**
 * The ticket tab bar decoration: "Tickets <n>" on the home tab while tickets need you.
 * @param {any} _tab @param {{ kind: string | null, home: string | null }} info
 * @returns {{ label?: string } | null}
 */
function decorate(_tab, { kind, home }) {
  if (kind !== "ticket" || !home) return null;
  const needs = /** @type {any} */ (shared("bakers.needs")) ?? { count: 0 };
  return needs.count ? { label: `Tickets ${needs.count}` } : null;
}

export function register() {
  // A ticket opens in the panel, never as a tab: the kind keeps the home tab "Tickets" and
  // recognises leftover "<ID> <state>" tabs, which the window task closes; it has no route.
  define("tab", "ticket", {
    match: /^([A-Z][A-Z0-9_]*-\d+) (\S+)$/, // group 1 = key, group 2 = the name's state part
    home: { name: "Tickets", route: "ticket.list", index: 1 },
  });
  define("route", "ticket.list", { view: List }); // tab "Tickets"
  define("route", "ticket.view", { view: Full }); // the old detail tab; goes with Task 4
  define("route", "ticket.context", { view: Context }); // the right panel's child "ticket"
  define("route", "ticket.run", { view: RunHeader }); // the run header block "run-header" in the panel
  define("route", "ticket.rail", { view: Rail }); // the rail button
  define("route", "ticket.sidebar", { view: Sidebar }); // the Tickets card in the sidebar
  define("route", "ticket.status", { view: Status }); // the status block's item
  // window, cmd-K: centred by Herdr (mods get no window size), and Esc reaches the palette, which
  // goes back a page (Herdr closes a dialog or popup on Esc itself); the key keeps it one window
  define("route", "ticket.actions", {
    view: Actions,
    open: { kind: "window", key: "bakers.actions", width: 480, height: 490 },
  });
  define("route", "ticket.label-picker", {
    view: LabelPicker,
    open: { kind: "popup", width: 220 },
  }); // popup, props.ticket
  define("rail.item", "ticket", { order: 0, route: "ticket.rail" });
  define("sidebar.section", "ticket", { order: 0, title: "Tickets", route: "ticket.sidebar" });
  define("status.item", "ticket", { order: 0, route: "ticket.status" });
  define("tabs.panel", "ticket", { order: 2, label: "Ticket", bordered: true });
  define("tabs.decorate", "ticket", { decorate });
  define("window.task", "ticket.refresh", windowTask());
  define("window.task", "ticket.run", { every: 1000, run: () => syncRun() }); // the run follows the selected ticket
  // In this order in the actions palette.
  define("command", "goto", commands.goto);
  define("command", "new", commands.create);
  define("command", "tickets", commands.tickets);
  define("command", "panel", commands.panel);
  define("command", "open", commands.open);
  define("command", "actions", commands.actions);
  for (const list of [needsMe, mine, open, state, closed]) define("list", list.id, list);
  define("form", "create", { build: createForm });
  define("form", "state", { build: stateForm });
  define("form", "freeze", { build: freezeForm });
  define("form", "unfreeze", { build: unfreezeForm });
  define("form", "move", { build: moveForm });
  define("form", "cancel", { build: cancelForm });
  define("action", "ticket.classify", { run: classify });
  define("action", "ticket.labels", { run: labels });
  define("action", "ticket.refresh", { run: () => refresh() });
  define("action", "ticket.showAgent", { run: (/** @type {string} */ id) => showAgent(id) });
  define("action", "ticket.move", {
    run: (/** @type {string} */ id) => openRoute("ticket.actions", { ticket: id, page: "move" }),
  });
  define("action", "ticket.view", { run: (/** @type {string} */ view) => setView(view) });
  define("action", "ticket.toggleClosed", {
    run: () => setShared("bakers.showClosed", !showClosed()),
  });
}
