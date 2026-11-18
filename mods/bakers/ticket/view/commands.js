// ticket/view/commands: the key commands the ticket module answers (keys.json:
// bakers.goto, .tickets, .panel, .new, .open:<id>). They open overlays and tabs, so they
// live with the views.
import { layout, run } from "herdr";
import { findNode } from "../../core/herdr.js";
import { openRoute } from "../../core/router.js";
import { openForm } from "../../ui/form/dialog.js";
import { tabName } from "../presenter/tab.js";
import { getStore, ready } from "../store.js";
import { ensureTicketsTab, openTicket } from "../tabs.js";

/** Go to ticket, 480 px wide, 120 px from the top, centred (Herdr gives mods no window size). */
export const goto = {
  /** @param {string} _arg @param {{ width: number, left: number }} where */
  run(_arg, { width, left }) {
    const x = Math.max(0, Math.round(left + width / 2 - 240));
    openRoute("ticket.search", {}, { at: { x, y: 120 } });
  },
};

export const tickets = { run: () => ensureTicketsTab() };

export const panel = {
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

export const create = { run: () => openForm("create") };

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
