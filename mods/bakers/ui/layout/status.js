// ui/layout/status: the bakers status block, once per window: project, need-you count and
// last update (or "bakers offline"); a click opens the Tickets tab. It also owns what
// belongs to the window: the refresh every 60 s, the shared needs-you count, tab names that
// follow the state, the question toast, and the global keys from keys.json
// (bakers.goto, .tickets, .panel, .new, .open).
import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { layout, nextCommand, notify, openOverlay, run, setShared, shared, theme } from "herdr";
import { classify } from "../../core/errors.js";
import { findNode } from "../../core/herdr.js";
import { ensureTicketsTab, openTicket, syncNames } from "../../core/tabs.js";
import { UI_FONT } from "../../core/theme.js";
import { openForm } from "../../components/form/dialog.js";
import { currentProject } from "../../entity/project/data.js";
import { getStore, loadError, publishNeeds, ready } from "../../entity/ticket/data.js";
import { statusParts } from "../../entity/ticket/presenter/counts.js";
import { notification } from "../../entity/ticket/presenter/notification.js";
import { tabName } from "../../entity/ticket/presenter/tab.js";

const REFRESH_MS = 60000;
const RAIL = 56;

/**
 * Posts one toast per ticket newly asking a question and returns who asks now. The first
 * call only records, so starting Herdr posts nothing.
 * @param {string[] | null} prev @param {any} store
 */
export function watchNeeds(prev, store) {
  const asking = store
    .view("needs-me")
    .filter((/** @type {any} */ r) => r.why === "Asked a question")
    .map((/** @type {any} */ r) => r.id);
  if (prev === null) return asking;
  for (const id of asking) {
    if (prev.includes(id)) continue;
    setShared("bakers.toast", id);
    notify(notification(id, store.cached?.(id)?.comments ?? []));
  }
  return asking;
}

export default class Status {
  init(_props, cx) {
    this.width = 1440 - RAIL;
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
    syncNames((id) => {
      const r = store.byId(id);
      return r ? tabName(r) : null;
    });
    this.asked = watchNeeds(this.asked, store);
  }

  /** @param {string} c */
  async command(c) {
    const [name, arg] = String(c).split(":");
    if (name === "goto") this.goto();
    else if (name === "tickets") ensureTicketsTab();
    else if (name === "panel") this.togglePanel();
    else if (name === "new") openForm("create");
    else if (name === "open")
      await this.open(arg ?? /** @type {string} */ (shared("bakers.toast")));
  }

  /** Go to ticket, 480 px wide, 120 px from the top, centred (Herdr gives mods no window size). */
  goto() {
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
    let t = store.byId(id);
    if (!t) {
      const d = await store.ticket(id).catch(() => null);
      t = d ? { id: d.ticket.identifier, state: d.ticket.state, closed: d.ticket.closed } : null;
    }
    if (t) openTicket(t.id, tabName(t), { pin: true });
  }

  render() {
    const t = theme();
    const store = getStore();
    const parts = statusParts({
      project: currentProject()?.name ?? null,
      count: store.needs().count,
      updated: store.updated,
      failure: classify(loadError()),
      now: Date.now(),
    });
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
      .children(
        parts.map((p) =>
          div()
            .truncate()
            .when(Boolean(p.tone), (el) => el.text_color(t[p.tone]))
            .when(Boolean(p.strong), (el) => el.font_semibold())
            .child(p.text),
        ),
      );
  }
}
