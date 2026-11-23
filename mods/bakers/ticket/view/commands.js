// ticket/view/commands: the key commands the ticket module answers (keys.json:
// bakers.goto, .tickets, .panel, .new, .open:<id>, .actions). They open overlays and tabs, so they
// live with the views. A command with a label is listed in the actions palette.
import { layout, run } from "herdr";
import { findNode } from "../../core/herdr.js";
import { openRoute } from "../../core/router.js";
import { openForm } from "../../ui/form/dialog.js";
import { tabName } from "../presenter/tab.js";
import { getStore, ready } from "../store.js";
import { ensureTicketsTab, frontTicket, openTicket } from "../tabs.js";

/**
 * A 480 px popup 120 px from the top, centred over the status bar (Herdr gives mods no window size).
 * @param {{ width: number, left: number }} where
 */
export function atTop({ width, left }) {
  return { x: Math.max(0, Math.round(left + width / 2 - 240)), y: 120 };
}

/** Go to ticket; a text (goto:<text>, from the palette) fills its field. */
export const goto = {
  label: "Go to ticket...",
  /** @param {string} arg @param {{ width: number, left: number }} where */
  run(arg, where) {
    openRoute("ticket.search", arg ? { query: arg } : {}, { at: atTop(where) });
  },
};

/** cmd-K: the palette of the ticket in front (frontTicket), placed like Go to ticket. */
export const actions = {
  /** @param {string} _arg @param {{ width: number, left: number }} where */
  run(_arg, where) {
    openRoute("ticket.actions", { ticket: frontTicket(), where }, { at: atTop(where) });
  },
};

export const tickets = { label: "Tickets", run: () => ensureTicketsTab() };

export const panel = {
  label: "Ticket panel",
  run() {
    const root = layout();
    const p = findNode(root, "panel");
    if (p && !p.hidden && findNode(root, "panel-body")?.active === "ticket")
      run("layout.hide", { id: "panel" });
    else {
      run("layout.select", { stack: "panel-body", child: "ticket" });
      run("layout.show", { id: "panel" });
    }
  },
};

export const create = { label: "New ticket", run: () => openForm("create") };

/** Opens a ticket's tab, pinned (a toast click, open:<id>). */
export const open = {
  /** @param {string} id */
  async run(id) {
    if (!id) return;
    await ready();
    const store = getStore();
    let t = store.byId(id);
    if (!t) {
      const d = await store.ticket(id).catch(() => null);
      t = d ? { id: d.ticket.identifier, state: d.ticket.state, closed: d.ticket.closed } : null;
    }
    if (t) openTicket(t.id, tabName(t), { pin: true });
  },
};
