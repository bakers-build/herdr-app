// ticket/view/commands: the key commands the ticket module answers (keys.json:
// bakers.goto, .tickets, .panel, .new, .open:<id>, .actions). They open overlays, the Tickets tab
// and the panel, so they live with the views. A command with a label is listed in the actions
// palette.
import { run } from "herdr";
import { openRoute } from "../../core/router.js";
import { openForm } from "../../ui/form/dialog.js";
import { getStore, ready } from "../store.js";
import { ensureTicketsTab, frontTicket, panelShowsTicket, selectTicket } from "../tabs.js";

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
    if (panelShowsTicket()) run("layout.hide", { id: "panel" });
    else {
      run("layout.select", { stack: "panel-body", child: "ticket" });
      run("layout.show", { id: "panel" });
    }
  },
};

export const create = { label: "New ticket", run: () => openForm("create") };

/** Shows a ticket in the panel (a toast click, open:<id>). A ticket outside the list that was read
 *  before is selected at once; the panel shows its cached detail and refreshes it. */
export const open = {
  /** @param {string} id */
  async run(id) {
    if (!id) return;
    await ready();
    const store = getStore();
    let t = store.byId(id);
    const known = t ? null : store.cached(id)?.ticket?.identifier;
    if (known) t = { id: known };
    if (!t) {
      const d = await store.ticket(id).catch(() => null);
      t = d ? { id: d.ticket.identifier } : null;
    }
    if (t) selectTicket(t.id);
  },
};
