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

/** cmd-shift-O: the actions palette on its tickets page; a text (goto:<text>) fills its field. */
export const goto = {
  label: "Go to ticket...",
  /** @param {string} arg */
  run(arg) {
    openRoute("ticket.actions", {
      ticket: frontTicket(),
      page: "tickets",
      ...(arg ? { query: arg } : {}),
    });
  },
};

/** cmd-K: the actions palette of the ticket in front (frontTicket); Herdr centres it. */
export const actions = {
  run() {
    openRoute("ticket.actions", { ticket: frontTicket() });
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
