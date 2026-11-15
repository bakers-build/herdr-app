// The bakers item in the status bar (R2-4, R2-3): project, need-you count and last
// update; a click opens the Tickets tab. It exists once per window, so it also owns the
// refresh every 60 s, the shared needs-you count, tab names that follow the state, the
// question toast, and the global keys (bakers.goto, .tickets, .panel, .new, .open).
import { h_flex } from "gpui-base";
import { div } from "gpui-kit";
import { layout, nextCommand, openOverlay, run, setShared, shared, theme } from "herdr";
import { age } from "../lib/format.js";
import { currentProject, error, getStore, ready } from "../lib/context.js";
import { findNode } from "../lib/layoutTree.js";
import { watchNeeds } from "../lib/notify.js";
import { ensureTicketsTab, openTicket, syncNames } from "../lib/tabs.js";
import { UI_FONT } from "../lib/theme.js";

const REFRESH_MS = 60000;
const RAIL = 56;

export default class Status {
  init(_props, cx) {
    this.width = 1440 - RAIL;
    this.asked = null;
    cx.spawn(async (cx) => {
      await this.refresh();
      cx.notify();
    });
    cx.timer.every(REFRESH_MS, (cx) => {
      cx.spawn(async (cx) => {
        await this.refresh();
        cx.notify();
      });
    });
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        await this.command(c);
        cx.notify();
      }
    });
  }

  async refresh() {
    const p = await ready();
    if (!p) return;
    const store = getStore();
    if (store.updated && Date.now() - store.updated > 1000) await store.refresh();
    this.publish();
  }

  publish() {
    const store = getStore();
    const needs = store.needs();
    setShared("bakers.needs", { count: needs.count, ids: needs.ids, updated: store.updated });
    syncNames((id) => store.byId(id));
    this.asked = watchNeeds(this.asked, store);
  }

  /** @param {string} c */
  async command(c) {
    const [name, arg] = String(c).split(":");
    if (name === "goto") this.openGoto();
    else if (name === "tickets") ensureTicketsTab();
    else if (name === "panel") this.togglePanel();
    else if (name === "new")
      openOverlay({
        mod: "bakers",
        props: { view: "new-ticket" },
        kind: "dialog",
        width: 460,
        modal: true,
      });
    else if (name === "open")
      await this.open(arg ?? /** @type {string} */ (shared("bakers.toast")));
  }

  openGoto() {
    const sidebar = findNode(layout(), "sidebar");
    const left = RAIL + (sidebar && !sidebar.hidden ? (sidebar.size?.px ?? 0) : 0);
    const x = Math.max(0, Math.round(left + this.width / 2 - 240));
    openOverlay({
      mod: "bakers",
      props: { view: "goto" },
      kind: "popup",
      width: 480,
      at: { x, y: 120 },
    });
  }

  togglePanel() {
    const root = layout();
    const panel = findNode(root, "panel");
    const body = findNode(root, "panel-body");
    if (panel && !panel.hidden && body?.active === "ticket") run("layout.hide", { id: "panel" });
    else {
      run("layout.select", { stack: "panel-body", child: "ticket" });
      run("layout.show", { id: "panel" });
    }
  }

  /** Opens a ticket's tab, pinned (a toast click, Go to ticket from a key). @param {string} id */
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
    const t = theme();
    const store = getStore();
    const err = error();
    const needs = store.needs();
    const offline = Boolean(err?.offline);
    return h_flex()
      .id("bakers-status")
      .size_full()
      .px(12)
      .gap(10)
      .items_center()
      .justify_end()
      .font_family(UI_FONT)
      .text_size(11)
      .text_color(t.muted)
      .bg(t.chrome)
      .border_t(1)
      .border_color(t.border)
      .cursor_pointer()
      .on_size_change((size, cx) => {
        this.width = size.width;
        cx.notify();
      })
      .on_click(() => ensureTicketsTab())
      .when(offline, (el) => el.child(div().child("bakers offline")))
      .when(!offline && Boolean(currentProject()), (el) =>
        el
          .child(div().child(currentProject().name))
          .when(needs.count > 0, (e) =>
            e.child(div().text_color(t.blocked).font_semibold().child(`${needs.count} need you`)),
          )
          .when(Boolean(store.updated), (e) =>
            e.child(div().child(`updated ${age(Date.now() - store.updated)} ago`)),
          ),
      )
      .when(!offline && !currentProject() && Boolean(err), (el) =>
        el.child(div().truncate().child(err.message)),
      );
  }
}
