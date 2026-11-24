// ticket/view/list (route ticket.list): the Tickets list (frame R2-4). It runs the list the
// Tickets filter (ticket/filter) picks with the list engine over the store's open tickets, or
// over the pages a server list loads, keeps what the filter lets through, maps each row with the
// card view mode and draws the header (the header.tool contributions, such as the project
// button, the / text field, ... and New ticket), the filter bar, the cards, the pager and the
// hints. Keys: Up and Down select (the panel follows), Enter opens the preview tab, cmd-Enter or
// a double click a pinned tab, / the filter, N a new ticket, R refreshes.
import { div, svg } from "gpui-kit";
import { h_flex, Input, InputState, v_flex } from "gpui-base";
import { setShared, shared } from "herdr";
import { perform } from "../../core/actions.js";
import { classify } from "../../core/errors.js";
import { all } from "../../core/registry.js";
import { viewOf } from "../../core/router.js";
import { openTicket } from "../tabs.js";
import { icons, tokens, UI_FONT } from "../../ui/theme.js";
import { button } from "../../ui/components/button.js";
import { ticketCard } from "../../ui/components/card.js";
import { chip } from "../../ui/components/chip.js";
import { pager } from "../../ui/components/pager.js";
import { openForm } from "../../ui/form/dialog.js";
import { openMenu } from "../../ui/components/menu.js";
import { failureView } from "../../ui/components/state.js";
import { getStore, loadError, ready, refresh } from "../store.js";
import {
  applyFilter,
  choices,
  clearFilter,
  counts,
  currentFilter,
  isActive,
  listForFilter,
} from "../filter.js";
import { STATES } from "../rules.js";
import { tabName } from "../presenter/tab.js";
import { card, KEY_HINT } from "../presenter/card.js";
import { emptyText } from "../list/index.js";
import { toQuery } from "../../list/query.js";
import { runList } from "../../list/run.js";
import { currentProject } from "../../project/state.js";

const CHECK_MS = 300;
/** Stands in where a branch only runs with a failure; never shown. */
const NO_FAILURE = { kind: "failed", message: "", retry: false };
const cap = (/** @type {string} */ s) => s.charAt(0).toUpperCase() + s.slice(1);
/** @param {string} state the filter's state */
const stateLabel = (state) => (state === "closed" ? "Recently closed" : cap(state));
/** @param {any} patch the filter fields to change */
const filterBy = (patch) => ["ticket.filter", patch];

/**
 * The views of the header.tool contributions, made once from their routes and started; a route
 * that is not registered is skipped. The shell draws its contributions the same way.
 * @param {import("gpui-kit").AsyncContext} cx
 */
function launchTools(cx) {
  /** @type {any[]} */
  const views = [];
  /** @type {unknown[]} */
  const pending = [];
  for (const tool of all("header.tool")) {
    const C = viewOf(tool.route);
    if (!C) continue;
    const c = new C({ view: tool.route });
    views.push(c);
    pending.push(c.init?.({ view: tool.route }, cx));
  }
  cx.spawn(async (cx) => {
    await Promise.all(pending);
    cx.notify();
  });
  return views;
}

export default class TicketList {
  /** @type {import("gpui-kit").FocusHandle} init sets it before the first render */
  handle = /** @type {any} */ (null);
  filter = InputState.new({ placeholder: "Filter, / focuses" });
  filterFocused = false;
  /** @type {string | null} */
  selected = null;
  page = 0;
  /** @type {string | null} the view the page belongs to */
  key = null;
  /**
   * Pages a server list loaded: rows, whether there is more, the page reached.
   * @type {{ key: string | null, rows: any[], more: boolean, page: number, loading?: boolean, failure?: import("../../core/errors.js").Failure | null }}
   */
  server = { key: null, rows: [], more: false, page: -1 };
  /** @type {any[]} the header.tool views */
  tools = [];

  /** @param {unknown} _props @param {import("gpui-kit").AsyncContext} cx */
  init(_props, cx) {
    this.tools = launchTools(cx);
    this.handle = cx.focus_handle();
    this.handle.focus();
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
      this.check(cx);
      cx.notify();
    });
    cx.timer.every(CHECK_MS, (cx) => this.check(cx));
  }

  /** The list the filter runs, and the same list when it is a server list that needs loading. */
  wanted() {
    const list = listForFilter(currentFilter());
    return { list, server: list.def.load ? list : null };
  }

  /** A new list starts at page 0; a server list loads what is missing. @param {import("gpui-kit").Context} cx */
  check(cx) {
    const { list, server } = this.wanted();
    const key = JSON.stringify(currentFilter());
    if (key !== this.key) {
      this.key = key;
      this.page = 0;
      cx.notify();
    }
    // The rows belong to a project: a switch starts over, and nothing loads before there is one.
    const project = currentProject()?.uuid;
    if (!server || !project) return;
    const skey = `${project}:${server.def.id}:${server.args.join(":")}`;
    if (this.server.key !== skey) this.server = { key: skey, rows: [], more: false, page: -1 };
    const page = list === server ? this.page : 0;
    if (this.server.page >= page || this.server.loading) return;
    this.server.loading = true;
    const at = this.server;
    cx.spawn(async (cx) => {
      try {
        await ready();
        const def = server.def;
        const q = toQuery(def, { project, args: server.args }, at.page + 1);
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
    const filter = currentFilter();
    const base = applyFilter(isServer ? this.server.rows : getStore().records(), filter, {
      user: getStore().user,
    });
    return {
      list,
      ...runList(list.def, base, {
        args: list.args,
        exposed: this.filter.value(),
        page: this.page,
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
      { label: "Close finished ticket tabs", action: ["tabs.closeFinished"], separator: true },
      { label: "Close all ticket tabs", action: ["tabs.closeAll"] },
    ]);
  }

  /** @param {import("gpui-kit").Context} cx */
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

  /** @param {import("gpui-kit").Context} cx */
  header(cx) {
    const t = tokens();
    const row = h_flex().id("list-tools").items_center().gap(8);
    for (const c of this.tools) {
      const out = c.render(cx);
      row.children(Array.isArray(out) ? out : [out]);
    }
    return v_flex()
      .id("list-header")
      .gap(8)
      .px(12)
      .py(10)
      .border_b(1)
      .border_color(t.border)
      .child(
        row
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
          .child(button("new-ticket", "New ticket", () => openForm("create"), { primary: true })),
      )
      .child(this.filterBar());
  }

  /** Needs me, Mine, State, Label, Type and Clear, with the counts of the open tickets. */
  filterBar() {
    const t = tokens();
    const f = currentFilter();
    const store = getStore();
    const records = store.records();
    const n = counts(records, store.user);
    const values = choices(records);
    /** @param {string} id @param {boolean} on */
    const control = (id, on) =>
      h_flex()
        .id(id)
        .flex_none()
        .h(24)
        .px(8)
        .gap(6)
        .items_center()
        .rounded(6)
        .border(1)
        .border_color(on ? t.accent : t.border)
        .bg(on ? t.selected : t.surface)
        .text_size(12);
    /** @param {string} id @param {boolean} on @param {string} label @param {() => void} onClick */
    const clickable = (id, on, label, onClick) =>
      control(id, on)
        .cursor_pointer()
        .hover((s) => (on ? s : s.bg(t.hover))) // an active control keeps its fill
        .on_click((_e, cx) => {
          onClick();
          cx.notify();
        })
        .child(label);
    /** @param {string} id @param {boolean} on @param {string} label @param {number} count @param {any} patch */
    const toggle = (id, on, label, count, patch) =>
      clickable(id, on, label, () => void perform(filterBy(patch))).child(
        div().text_color(t.muted).child(String(count)),
      );
    /** @param {string} id @param {string} label @param {boolean} on @param {import("../../ui/components/menu.js").MenuItem[]} items */
    const menu = (id, label, on, items) =>
      clickable(id, on, label, () => openMenu(items)).child(svg(icons.down).size(10));
    /** @param {"label" | "type"} field @param {string[]} options */
    const anyOf = (field, options) => [
      { label: "Any", action: filterBy({ [field]: null }), current: f[field] === null },
      ...options.map((v) => ({
        label: v,
        action: filterBy({ [field]: v }),
        current: f[field] === v,
      })),
    ];
    const mine =
      n.mine === null
        ? control("filter-mine", false).opacity(0.5).child("Mine").child(chip())
        : toggle("filter-mine", f.mine, "Mine", n.mine, { mine: !f.mine });
    const active = isActive(f, store.user) || Boolean(this.filter.value());
    return h_flex()
      .id("filter-bar")
      .flex_wrap()
      .gap(6)
      .items_center()
      .child(toggle("filter-needs-me", f.needsMe, "Needs me", n.needsMe, { needsMe: !f.needsMe }))
      .child(mine)
      .child(
        menu("filter-state", `State: ${stateLabel(f.state)}`, f.state !== "open", [
          {
            label: "Open",
            hint: String(n.open),
            action: filterBy({ state: "open" }),
            current: f.state === "open",
          },
          ...STATES.map((s) => ({
            label: cap(s),
            hint: String(n.states[s]),
            action: filterBy({ state: s }),
            current: f.state === s,
          })),
          {
            label: "Recently closed",
            action: filterBy({ state: "closed" }),
            current: f.state === "closed",
            separator: true,
          },
        ]),
      )
      .child(
        menu(
          "filter-label",
          `Label: ${f.label ?? "any"}`,
          f.label !== null,
          anyOf("label", values.labels),
        ),
      )
      .child(
        menu(
          "filter-type",
          `Type: ${f.type ?? "any"}`,
          f.type !== null,
          anyOf("type", values.types),
        ),
      )
      .when(active, (el) =>
        el.child(
          clickable("filter-clear", false, "Clear", () => {
            clearFilter();
            this.filter.set_value("");
          }),
        ),
      );
  }

  /** @param {import("gpui-kit").Context} cx */
  render(cx) {
    const t = tokens();
    const { list, rows: records, more } = this.result();
    this.syncSelection(records);
    const now = Date.now();
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
      .child(this.header(cx))
      .child(
        v_flex()
          .id("rows")
          .flex_1()
          .min_h(0)
          .gap(8)
          .p(12)
          .overflow_y_scrollbar()
          .children(
            records.map((r) =>
              ticketCard(card(r, { selected: r.id === this.selected, now }), (e, cx) => {
                this.selected = r.id;
                setShared("bakers.selected", r.id);
                if (e.click_count === 2) this.open(r, true);
                cx.notify();
              }),
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
            el.child(failureView(failure ?? NO_FAILURE, (_e, cx) => this.refresh(cx))),
          )
          .child(
            v_flex()
              .py(4)
              .gap(4)
              .text_size(12)
              .text_color(t.muted)
              .when(!failure, (el) =>
                el.child(
                  div().child(
                    emptyText(
                      list,
                      this.filter.value(),
                      !records.length && isActive(currentFilter(), getStore().user),
                    ),
                  ),
                ),
              )
              .child(div().text_size(11).child(KEY_HINT)),
          ),
      );
  }

  /** Stops the header.tool views. @param {import("gpui-kit").AsyncContext} cx */
  async close(cx) {
    for (const c of this.tools) await c.close?.(cx);
  }
}
