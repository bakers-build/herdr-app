// The Tickets tab (frame R2-4): header with the view menu, the filter, "..." and New
// ticket; the columns Ticket, Title, Why (State outside Needs me), Agent, Age; rows with
// the selection the Ticket panel follows; the empty hint and the key hint.
import { div } from "gpui-kit";
import { h_flex, Input, InputState, v_flex } from "gpui-base";
import { setShared, shared, theme } from "herdr";
import { refresh } from "../lib/actions.js";
import { error, getStore, ready } from "../lib/context.js";
import { openMenu, openNewTicket } from "../lib/overlay.js";
import { STATES } from "../lib/store.js";
import { openTicket } from "../lib/tabs.js";
import { button, chevron, dot, mono, UI_FONT } from "../lib/theme.js";

const cap = (/** @type {string} */ s) => s.charAt(0).toUpperCase() + s.slice(1);
const COLS = [76, null, 170, 150, 44];
const KEY_HINT =
  "Enter opens the preview tab, cmd-Enter a pinned tab, N a new ticket, / the filter, R refreshes. Up and down move the selection; the Ticket panel, when shown, follows it.";

/** @param {string} view */
export function viewLabel(view) {
  if (view === "needs-me") return "Needs me";
  if (view === "mine") return "Mine";
  if (view === "closed") return "Recently closed";
  if (view.startsWith("state:")) return cap(view.slice(6));
  return "Open by state";
}

/** @param {string} view @param {string} query */
function emptyHint(view, query) {
  if (query) return `Nothing else matches "${query}".`;
  if (view === "needs-me")
    return "Nothing else needs you. Switch the view for Mine or Open by state.";
  if (view === "mine") return "Mine needs the assignee from the bakers API.";
  if (view === "closed") return "No other closed tickets.";
  if (view.startsWith("state:")) return `No other tickets in ${view.slice(6)}.`;
  return "No other open tickets.";
}

export function viewItems() {
  const view = shared("bakers.view") ?? "needs-me";
  const item = (key, o = {}) => ({
    label: viewLabel(key),
    action: ["view", key],
    current: view === key,
    ...o,
  });
  return [
    item("needs-me"),
    item("mine", { disabled: true, note: "API" }),
    item("open"),
    ...STATES.map((s) => item(`state:${s}`, { sub: true })),
    item("closed", { note: "API" }),
  ];
}

export default class List {
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
    cx.spawn(async (cx) => {
      await ready();
      cx.notify();
    });
  }

  view() {
    return /** @type {string} */ (shared("bakers.view")) ?? "needs-me";
  }

  rows() {
    return getStore().view(this.view(), {
      filter: this.filter.value(),
      showClosed: Boolean(shared("bakers.showClosed")),
    });
  }

  /** @param {any[]} rows */
  syncSelection(rows) {
    const keep = rows.find((r) => r.id === this.selected);
    const next = keep ? keep.id : (rows[0]?.id ?? null);
    if (next !== this.selected || shared("bakers.selected") !== next) {
      this.selected = next;
      if (shared("bakers.selected") !== next) setShared("bakers.selected", next);
    }
  }

  /** @param {number} delta */
  move(delta) {
    const rows = this.rows();
    if (!rows.length) return;
    const i = Math.max(
      0,
      rows.findIndex((r) => r.id === this.selected),
    );
    const next = rows[Math.min(rows.length - 1, Math.max(0, i + delta))];
    this.selected = next.id;
    setShared("bakers.selected", next.id);
  }

  /** @param {boolean} pin */
  open(pin) {
    const row = this.rows().find((r) => r.id === this.selected);
    if (row) openTicket(row, { pin });
  }

  menu() {
    openMenu([
      { label: "Refresh", action: ["refresh"] },
      {
        label: "Show closed tickets",
        action: ["toggleClosed"],
        current: Boolean(shared("bakers.showClosed")),
      },
      { label: "Close finished ticket tabs", action: ["closeFinished"], separator: true },
      { label: "Close all ticket tabs", action: ["closeAll"] },
    ]);
  }

  /** @param {any} e @param {any} cx */
  onKey(e, cx) {
    const k = e.keystroke;
    if (this.filterFocused) {
      if (k === "escape") {
        this.filter.set_value("");
        this.filterFocused = false;
        this.handle.focus();
        cx.stop_propagation();
        cx.notify();
      } else if (k === "down" || k === "up") {
        this.move(k === "down" ? 1 : -1);
        cx.notify();
      } else if (k === "enter" || k === "cmd-enter") this.open(k === "cmd-enter");
      return;
    }
    if (k === "down" || k === "up") this.move(k === "down" ? 1 : -1);
    else if (k === "enter") this.open(false);
    else if (k === "cmd-enter") this.open(true);
    else if (k === "/") this.filter.focus();
    else if (k === "n") openNewTicket();
    else if (k === "r")
      cx.spawn(async (cx) => {
        await refresh();
        cx.notify();
      });
    else return;
    cx.stop_propagation();
    cx.notify();
  }

  /** @param {any[]} cells */
  grid(cells) {
    return cells.map((c, i) => (COLS[i] == null ? c.flex_1().min_w(0) : c.w(COLS[i]).flex_none()));
  }

  render() {
    const t = theme();
    const view = this.view();
    const err = error();
    const store = getStore();
    const rows = this.rows();
    this.syncSelection(rows);
    const needsMe = view === "needs-me";
    const header = h_flex()
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
          .on_click(() => openMenu(viewItems()))
          .child(viewLabel(view))
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
      .child(button("new-ticket", "New ticket", () => openNewTicket(), { primary: true }));
    const columns = h_flex()
      .id("columns")
      .gap(12)
      .px(12)
      .py(6)
      .border_b(1)
      .border_color(t.border)
      .text_size(11)
      .font_semibold()
      .text_color(t.muted)
      .children(
        this.grid(
          ["TICKET", "TITLE", needsMe ? "WHY" : "STATE", "AGENT", "AGE"].map((h) => div().child(h)),
        ),
      );
    const row = (r, i) => {
      const on = r.id === this.selected;
      const toneColor = r.agent.tone === "blocked" ? t.blocked : t.muted;
      return h_flex()
        .id(`row-${r.id}`)
        .gap(12)
        .items_center()
        .px(12)
        .py(10)
        .min_h(28)
        .when(i > 0 && !on, (el) => el.border_t(1).border_color(t.border))
        .when(on, (el) => el.border(2).border_color(t.accent).bg(t.selected))
        .selected(on)
        .cursor_pointer()
        .hover((s) => s.bg(t.hover))
        .on_click((e, cx) => {
          this.selected = r.id;
          setShared("bakers.selected", r.id);
          if (e.click_count === 2) openTicket(r, { pin: true });
          cx.notify();
        })
        .children(
          this.grid([
            mono(r.id, 12),
            div()
              .truncate()
              .child(r.title ?? ""),
            needsMe
              ? div()
                  .text_color(t.blocked)
                  .font_semibold()
                  .child(r.why ?? "")
              : div().text_color(t.muted).child(r.state),
            h_flex()
              .gap(6)
              .items_center()
              .text_size(12)
              .text_color(toneColor)
              .child(
                dot(
                  r.agent.tone === "blocked"
                    ? "blocked"
                    : r.agent.tone === "working"
                      ? "working"
                      : "muted",
                  !r.agent.run,
                ),
              )
              .child(div().truncate().child(r.agent.text)),
            div().text_size(12).text_color(t.muted).child(r.age),
          ]),
        );
    };
    const offline = err && !store.tickets.length;
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
      .child(header)
      .child(columns)
      .child(
        v_flex()
          .id("rows")
          .flex_1()
          .min_h(0)
          .overflow_y_scrollbar()
          .children(rows.map(row))
          .when(Boolean(offline), (el) =>
            el.child(
              h_flex()
                .gap(8)
                .items_center()
                .px(12)
                .py(16)
                .text_size(12)
                .text_color(t.blocked)
                .child(div().child(err.message))
                .child(
                  button(
                    "retry",
                    "Retry",
                    (_e, cx) =>
                      cx.spawn(async (cx) => {
                        await refresh();
                        cx.notify();
                      }),
                    { h: 24, size: 12 },
                  ),
                ),
            ),
          )
          .child(
            v_flex()
              .px(12)
              .py(16)
              .gap(4)
              .text_size(12)
              .text_color(t.muted)
              .when(!offline, (el) =>
                el.child(div().child(emptyHint(view, this.filter.value().trim()))),
              )
              .child(div().text_size(11).child(KEY_HINT)),
          ),
      );
  }
}
