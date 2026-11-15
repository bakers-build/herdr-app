// screens/status: the bakers status block, once per window. It shows the status item
// (features/needs) and owns what belongs to the window: the refresh every 60 s, the shared
// needs-you count, tab names that follow the state, the question toast, and the global keys
// (bakers.goto, .tickets, .panel, .new, .open from keys.json).
import { layout, nextCommand, run, shared } from "herdr";
import { findNode } from "../core/kit.js";
import { getStore, publishNeeds, ready } from "../core/session.js";
import { ensureTicketsTab, openTicket, syncNames } from "../core/tabs.js";
import { openGoto } from "../features/goto/goto.js";
import { statusItem } from "../features/needs/status-item.js";
import { watchNeeds } from "../features/needs/toast.js";
import { openNewTicket } from "../features/new-ticket/new-ticket.js";

const REFRESH_MS = 60000;

export default class Status {
  init(_props, cx) {
    this.width = 1440 - 56;
    this.asked = null;
    const tick = (/** @type {any} */ cx) =>
      cx.spawn(async (cx) => {
        await this.refresh();
        cx.notify();
      });
    tick(cx);
    cx.timer.every(REFRESH_MS, tick);
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        await this.command(c);
        cx.notify();
      }
    });
  }

  async refresh() {
    if (!(await ready())) return;
    const store = getStore();
    if (store.updated && Date.now() - store.updated > 1000) await store.refresh();
    publishNeeds();
    syncNames((id) => store.byId(id));
    this.asked = watchNeeds(this.asked, store);
  }

  /** @param {string} c */
  async command(c) {
    const [name, arg] = String(c).split(":");
    if (name === "goto") openGoto(this.width);
    else if (name === "tickets") ensureTicketsTab();
    else if (name === "panel") this.togglePanel();
    else if (name === "new") openNewTicket();
    else if (name === "open")
      await this.open(arg ?? /** @type {string} */ (shared("bakers.toast")));
  }

  togglePanel() {
    const root = layout();
    const panel = findNode(root, "panel");
    if (panel && !panel.hidden && findNode(root, "panel-body")?.active === "ticket")
      run("layout.hide", { id: "panel" });
    else {
      run("layout.select", { stack: "panel-body", child: "ticket" });
      run("layout.show", { id: "panel" });
    }
  }

  /** Opens a ticket's tab, pinned (a toast click). @param {string} id */
  async open(id) {
    if (!id) return;
    await ready();
    const store = getStore();
    let row = store.byId(id);
    if (!row) {
      const d = await store.ticket(id).catch(() => null);
      row = d ? { id: d.ticket.identifier, state: d.ticket.state, closed: d.ticket.closed } : null;
    }
    if (row) openTicket(row, { pin: true });
  }

  render() {
    return statusItem((w) => {
      this.width = w;
    });
  }
}
