// ticket/controller/list (route ticket.list): the Tickets list (frame R2-4). It runs the chosen
// list definition (ticket/list) with the list engine over the store's open tickets, or over
// the pages a server list loads, maps each row with the teaser view mode and draws the header,
// the table, the pager and the hints. Keys: Up and Down select (the panel follows),
// Enter opens the preview tab, cmd-Enter or a double click a pinned tab, / the filter,
// N a new ticket, R refreshes.
import { div } from "gpui-kit";
import { h_flex, Input, InputState, v_flex } from "gpui-base";
import { setShared, shared, theme } from "herdr";
import { register } from "../../core/actions.js";
import { classify } from "../../core/errors.js";
import { closeAll, closeFinished, openTicket } from "../../core/tabs.js";
import { UI_FONT } from "../../core/theme.js";
import { button } from "../../components/button.js";
import { pager } from "../../components/pager.js";
import { openForm } from "../../components/form/dialog.js";
import { chevron } from "../../components/icon.js";
import { openMenu } from "../../components/menu.js";
import { failureView } from "../../components/state.js";
import { tableHeader, tableRow } from "../../components/table.js";
import { getStore, loadError, ready, refresh } from "../store.js";
import { currentView, showClosed } from "../state.js";
import { tabName } from "../presenter/tab.js";
import { columns, KEY_HINT, teaser } from "../presenter/teaser.js";
import { emptyText, listFor, menuItems } from "../list/index.js";
import { toQuery } from "../../list/query.js";
import { runList } from "../../list/run.js";
import { currentProject } from "../../project/state.js";

register("tabs.closeFinished", () => closeFinished());
register("tabs.closeAll", () => closeAll());

const CHECK_MS = 300;

export default class TicketList {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.filter = InputState.new({ placeholder: "Filter, / focuses" });
    this.filterFocused = false;
    this.selected = null;
    this.filter.on("change", (_e, cx) => cx.notify());
    this.filter.on("focus", (_e, cx) => {
      this.filterFocused = true;
      cx?.notify?.();
    });
    this.filter.on("blur", (_e, cx) => {
      this.filterFocused = false;
      cx?.notify?.();
    });
    this.page = 0;
    this.key = null;
    /** Pages a server list loaded: rows, whether there is more, the page reached. */
    this.server = { key: null, rows: [], more: false, page: -1 };
    cx.spawn(async (cx) => {
      await ready();
      this.check(cx);
      cx.notify();
    });
    cx.timer.every(CHECK_MS, (cx) => this.check(cx));
  }

  /** The list on screen and the server list it needs loaded (the closed list also feeds Show closed). */
  wanted() {
    const list = listFor(currentView());
    if (list.def.load) return { list, server: list };
    if (list.def.id === "open" && showClosed()) return { list, server: listFor("closed") };
    return { list, server: null };
  }

  /** A new list starts at page 0; a server list loads what is missing. @param {any} cx */
  check(cx) {
    const { list, server } = this.wanted();
    const key = currentView();
    if (key !== this.key) {
      this.key = key;
      this.page = 0;
      cx.notify();
    }
    if (!server) return;
    const skey = `${server.def.id}:${server.args.join(":")}`;
    if (this.server.key !== skey) this.server = { key: skey, rows: [], more: false, page: -1 };
    const page = list === server ? this.page : 0;
    if (this.server.page >= page || this.server.loading) return;
    this.server.loading = true;
    const at = this.server;
    cx.spawn(async (cx) => {
      try {
        const p = await ready();
        const def = server.def;
        const q = toQuery(
          def,
          { project: p?.uuid ?? currentProject()?.uuid, args: server.args },
          at.page + 1,
        );
        const rows = (await def.load(q)).map((/** @type {any} */ t) => getStore().row(t));
        at.rows = [...at.rows, ...rows];
        at.more = rows.length === def.pager?.limit;
        at.page += 1;
      } catch (e) {
        at.failure = classify(e);
      } finally {
        at.loading = false;
      }
      cx.notify();
    });
  }

  result() {
    const { list, server } = this.wanted();
    const isServer = list === server;
    const base = isServer
      ? this.server.rows
      : [...getStore().records(), ...(server ? this.server.rows : [])];
    return {
      list,
      ...runList(list.def, base, {
        args: list.args,
        exposed: this.filter.value(),
        page: this.page,
        showClosed: showClosed(),
        server: isServer,
        more: this.server.more,
      }),
    };
  }

  records() {
    return this.result().rows;
  }

  /** Keeps a selection that still shows, else the first row; the panel follows it. @param {any[]} records */
  syncSelection(records) {
    const next = records.find((r) => r.id === this.selected)?.id ?? records[0]?.id ?? null;
    this.selected = next;
    if (shared("bakers.selected") !== next) setShared("bakers.selected", next);
  }

  /** @param {number} delta */
  move(delta) {
    const records = this.records();
    if (!records.length) return;
    const i = Math.max(
      0,
      records.findIndex((r) => r.id === this.selected),
    );
    this.selected = records[Math.min(records.length - 1, Math.max(0, i + delta))].id;
    setShared("bakers.selected", this.selected);
  }

  /** @param {any} record @param {boolean} pin */
  open(record, pin) {
    if (record) openTicket(record.id, tabName(record), { pin });
  }

  selectedRecord() {
    return this.records().find((r) => r.id === this.selected);
  }

  menu() {
    openMenu([
      { label: "Refresh", action: ["ticket.refresh"] },
      { label: "Show closed tickets", action: ["ticket.toggleClosed"], current: showClosed() },
      { label: "Close finished ticket tabs", action: ["tabs.closeFinished"], separator: true },
      { label: "Close all ticket tabs", action: ["tabs.closeAll"] },
    ]);
  }

  /** @param {any} cx */
  refresh(cx) {
    cx.spawn(async (cx) => {
      await refresh();
      cx.notify();
    });
  }

  /** @param {any} e @param {any} cx */
  onKey(e, cx) {
    const k = e.keystroke;
    if (k === "down" || k === "up") this.move(k === "down" ? 1 : -1);
    else if (k === "enter" || k === "cmd-enter")
      this.open(this.selectedRecord(), k === "cmd-enter");
    else if (this.filterFocused && k === "escape") {
      this.filter.set_value("");
      this.filterFocused = false;
      this.handle.focus();
    } else if (this.filterFocused) return;
    else if (k === "/") this.filter.focus();
    else if (k === "n") openForm("create");
    else if (k === "r") this.refresh(cx);
    else return;
    cx.stop_propagation();
    cx.notify();
  }

  header() {
    const t = theme();
    return h_flex()
      .id("list-header")
      .items_center()
      .gap(8)
      .px(12)
      .py(10)
      .border_b(1)
      .border_color(t.border)
      .child(
        h_flex()
          .id("view-menu")
          .h(28)
          .px(10)
          .gap(6)
          .items_center()
          .rounded(6)
          .border(1)
          .border_color(t.border)
          .bg(t.surface)
          .font_semibold()
          .cursor_pointer()
          .on_click(() => openMenu(menuItems(currentView())))
          .child(listFor(currentView()).label)
          .child(chevron(12)),
      )
      .child(
        h_flex()
          .id("filter")
          .w(220)
          .h(28)
          .px(8)
          .items_center()
          .rounded(6)
          .border(1)
          .border_color(this.filterFocused ? t.accent : t.border)
          .bg(t.surface)
          .text_color(t.foreground)
          .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .child(Input.new(this.filter).w_full()),
      )
      .child(div().flex_1())
      .child(button("list-menu", "...", () => this.menu()))
      .child(button("new-ticket", "New ticket", () => openForm("create"), { primary: true }));
  }

  render() {
    const t = theme();
    const { list, rows: records, more } = this.result();
    this.syncSelection(records);
    const now = Date.now();
    const reason = Boolean(list.def.row?.reason);
    const cols = columns(reason);
    const failure = list.def.load
      ? (this.server.failure ?? null)
      : getStore().tickets.length
        ? null
        : classify(loadError());
    return v_flex()
      .id("tickets")
      .size_full()
      .min_h(0)
      .bg(t.surface)
      .font_family(UI_FONT)
      .text_size(13)
      .text_color(t.foreground)
      .track_focus(this.handle)
      .on_key_down((e, cx) => this.onKey(e, cx))
      .child(this.header())
      .child(tableHeader(cols))
      .child(
        v_flex()
          .id("rows")
          .flex_1()
          .min_h(0)
          .overflow_y_scrollbar()
          .children(
            records.map((r, i) =>
              tableRow(
                teaser(r, { reason, selected: r.id === this.selected, now }),
                cols,
                i,
                (e, cx) => {
                  this.selected = r.id;
                  setShared("bakers.selected", r.id);
                  if (e.click_count === 2) this.open(r, true);
                  cx.notify();
                },
              ),
            ),
          )
          .when(more, (el) =>
            el.child(
              pager(`Show ${list.def.pager?.limit ?? 50} more`, (_e, cx) => {
                this.page += 1;
                this.check(cx);
                cx.notify();
              }),
            ),
          )
          .when(Boolean(failure), (el) =>
            el.child(failureView(failure, (_e, cx) => this.refresh(cx))),
          )
          .child(
            v_flex()
              .px(12)
              .py(16)
              .gap(4)
              .text_size(12)
              .text_color(t.muted)
              .when(!failure, (el) => el.child(div().child(emptyText(list, this.filter.value()))))
              .child(div().text_size(11).child(KEY_HINT)),
          ),
      );
  }
}
