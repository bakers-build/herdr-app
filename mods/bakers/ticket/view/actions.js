// ticket/view/actions: the actions palette (cmd-K, route ticket.actions, a dialog Herdr centres),
// navigated like Raycast: a stack of pages, each with its own field. The first page lists the
// target's actions (props.ticket, from frontTicket), the commands that carry a label and, with
// text typed, the matching tickets. Change state, Move to, Go to ticket and a ticket's actions are
// pages; nothing opens a popup elsewhere, only the confirming dialogs. Typing matches fuzzily
// (core/fuzzy.js), best first. An action that cannot run stays listed with its reason and is
// skipped. props.page ("tickets", "move") and props.query open the palette on a page.
import { div } from "gpui-kit";
import { h_flex, Input, InputState, v_flex } from "gpui-base";
import { closeOverlay, keys, props } from "herdr";
import { perform } from "../../core/actions.js";
import { classify } from "../../core/errors.js";
import { fuzzyScore } from "../../core/fuzzy.js";
import { all, get } from "../../core/registry.js";
import { ticketActions } from "../operations/actions.js";
import { STATE_MENU_FOOTER, stateItems } from "../operations/state.js";
import { search } from "../presenter/search.js";
import { tabName } from "../presenter/tab.js";
import { listConductors, searchTickets } from "../repository.js";
import { getStore, ready } from "../store.js";
import { openTicket } from "../tabs.js";
import { runReason, runTerminal } from "../terminal.js";
import { openForm } from "../../ui/form/dialog.js";
import { pill } from "../../ui/components/pill.js";
import { mono } from "../../ui/components/text.js";
import { tokens, UI_FONT } from "../../ui/theme.js";

const DEBOUNCE_MS = 200;
const MAX_TICKETS = 8;
const MAX_PAGE_TICKETS = 50;
const TITLES = { state: "Change state", move: "Move to", tickets: "Go to ticket" };
const PLACEHOLDERS = {
  root: "Search actions and tickets...",
  state: "Search states...",
  move: "Search conductors...",
  tickets: "Search tickets...",
  ticket: "Search actions...",
};

/**
 * @typedef {{ page: "root" | "state" | "move" | "tickets" | "ticket", id: string | null,
 *   input?: any }} Page
 * @typedef {{ key: string, label: string, keys?: string, note?: string, reason?: string | null,
 *   current?: boolean, enter?: string, ticket?: { id: string, title: string, state: string },
 *   run?: (cx: any) => void }} Row
 */

/** @param {Row} r */
const usable = (r) => Boolean(r.run) && !r.reason && !r.current;

/** The rows whose label matches fuzzily, best first; ties keep their order. @param {Row[]} rows @param {string} q */
function filter(rows, q) {
  return rows
    .map((r) => ({ r, s: fuzzyScore(q, r.label) }))
    .filter((x) => x.s !== null)
    .sort((a, b) => (b.s ?? 0) - (a.s ?? 0))
    .map((x) => x.r);
}

/** keys.json's spelling with the last letter upper case: cmd-shift-o reads cmd-shift-O. @param {string} k */
const keyLabel = (k) => k.replace(/-([a-z])$/, (_m, c) => `-${c.toUpperCase()}`);

export default class Actions {
  /** @type {import("gpui-kit").FocusHandle} init sets it before the first render */
  handle = /** @type {any} */ (null);
  /** @type {Page[]} each page with its own field */
  stack = [{ page: "root", id: null }];
  /** The highlighted row's key; render keeps it on a usable row. @type {string | null} */
  hot = null;
  /** Loaded tickets by identifier, as a ticket tab loads them. @type {Map<string, any>} */
  details = new Map();
  /** Why a ticket did not load, by identifier. @type {Map<string, string>} */
  failures = new Map();
  /** The project's conductors for Move to; null until loaded. @type {any[] | null} */
  conductors = null;
  conductorsServed = true;
  /** The server search's tickets for the current text. @type {any[]} */
  remote = [];
  /** Counts keystrokes; a server search answers only if no newer keystroke came. */
  seq = 0;

  /** @param {unknown} _props @param {import("gpui-kit").AsyncContext} cx */
  init(_props, cx) {
    this.handle = cx.focus_handle();
    const p = /** @type {any} */ (props()) ?? {};
    const id = p.ticket ?? null;
    this.stack = [{ page: "root", id, input: this.field("root") }];
    if (p.page === "tickets" || (p.page === "move" && id))
      this.stack.push({ page: p.page, id, input: this.field(p.page) });
    this.input.focus();
    if (p.query) {
      this.input.set_value(p.query);
      this.schedule(cx);
    }
    if (id) this.load(id, cx);
    if (this.top().page === "move") this.loadConductors(cx);
    cx.spawn(async (cx) => {
      await ready().catch(() => null);
      cx.notify();
    });
  }

  /** A page's field: typing re-filters and, after a pause, searches the server.
   *  @param {Page["page"]} page */
  field(page) {
    const input = InputState.new({ placeholder: PLACEHOLDERS[page] });
    input.on("change", (_e, cx) => {
      this.hot = null;
      this.schedule(cx);
      cx.notify();
    });
    return input;
  }

  /** The field of the page in front. */
  get input() {
    return this.top().input;
  }

  /** @returns {Page} */
  top() {
    return this.stack[this.stack.length - 1];
  }

  /** Loads a ticket's detail once. @param {string} id @param {any} cx */
  load(id, cx) {
    if (this.details.has(id)) return;
    const cached = getStore().cached(id);
    if (cached) this.details.set(id, cached);
    cx.spawn(async (/** @type {any} */ cx) => {
      try {
        await ready();
        const d = await getStore().ticket(id);
        if (!d?.ticket) throw new Error(`${id} was not found`);
        this.details.set(id, d);
      } catch (/** @type {any} */ e) {
        if (!this.details.has(id)) this.failures.set(id, classify(e)?.message ?? String(e));
      }
      cx.notify();
    });
  }

  /** @param {any} cx */
  loadConductors(cx) {
    if (this.conductors) return;
    cx.spawn(async (/** @type {any} */ cx) => {
      try {
        const project = await ready();
        this.conductors = await listConductors(project?.uuid ?? getStore().project);
      } catch (e) {
        this.conductors = [];
        this.conductorsServed = classify(e)?.kind !== "api";
      }
      cx.notify();
    });
  }

  /** The server search runs after a pause in typing. @param {any} cx */
  schedule(cx) {
    const seq = ++this.seq;
    cx.timer.after(DEBOUNCE_MS, (/** @type {any} */ cx) => {
      if (seq === this.seq) this.searchRemote(seq, cx);
    });
  }

  /** @param {number} seq @param {any} cx */
  searchRemote(seq, cx) {
    const q = this.input.value().trim();
    const page = this.top().page;
    if (!q || (page !== "root" && page !== "tickets")) return;
    cx.spawn(async (/** @type {any} */ cx) => {
      try {
        const p = await ready();
        const found = (await searchTickets(q, p?.uuid ?? getStore().project)).map(search);
        if (seq !== this.seq) return;
        this.remote = found;
        cx.notify();
      } catch {
        // The store's matches stay; the server search only adds closed and older tickets.
      }
    });
  }

  /** Opens a page over this one, with its own field; this page keeps its text for the way back.
   *  @param {Page} page @param {any} cx */
  push(page, cx) {
    this.stack.push({ ...page, input: this.field(page.page) });
    this.input.focus();
    this.hot = null;
    this.remote = [];
    if (page.page === "ticket" && page.id) this.load(page.id, cx);
    if (page.page === "move") this.loadConductors(cx);
  }

  /** Back to the page below, with its text; false on the first page. */
  pop() {
    if (this.stack.length < 2) return false;
    this.stack.pop();
    this.input.focus();
    this.hot = null;
    this.remote = [];
    return true;
  }

  close() {
    closeOverlay(/** @type {any} */ (props())?.overlay);
  }

  /** @param {any[] | undefined} action @param {any} cx */
  perform(action, cx) {
    this.close();
    if (action) void perform(action, cx);
  }

  /** Runs a key command as its key does. @param {string} name */
  command(name) {
    this.close();
    void get("command", name)?.run("", { width: 0, left: 0 });
  }

  /** A ticket's actions; Change state and Move to open their pages. @param {string} id @returns {Row[]} */
  actionRows(id) {
    const d = this.details.get(id);
    if (!d) {
      const failure = this.failures.get(id);
      return [
        failure
          ? { key: "action-failure", label: failure }
          : { key: "action-loading", label: `Loading ${id}...` },
      ];
    }
    const runs = { runs: d.runs ?? [], claim_machine: d.ticket?.claim_machine ?? null };
    const reason = runReason(runs, runTerminal(id, d.ticket?.id));
    return ticketActions(d, reason).map((a) => ({
      key: `action-${a.key}`,
      label: a.label,
      keys: a.keys,
      reason: a.reason ?? null,
      enter: a.step || a.key === "move" ? "Open" : "Run",
      run:
        a.step || a.key === "move"
          ? (/** @type {any} */ cx) => this.push({ page: a.step ?? "move", id }, cx)
          : (/** @type {any} */ cx) => this.perform(a.action, cx),
    }));
  }

  /** The matching tickets, the store's and the server's, an exact identifier first; on the tickets
   *  page an empty field lists the store's. @param {string} q @param {number} max @returns {Row[]} */
  ticketRows(q, max) {
    const byId = new Map();
    for (const t of [...getStore().records(), ...this.remote])
      if (!byId.has(t.id)) byId.set(t.id, t);
    const exact = q.toLowerCase();
    return [...byId.values()]
      .map((t) => ({
        t,
        s:
          t.id.toLowerCase() === exact
            ? Number.POSITIVE_INFINITY
            : fuzzyScore(q, `${t.id} ${t.title ?? ""}`),
      }))
      .filter((x) => x.s !== null)
      .sort((a, b) => (b.s ?? 0) - (a.s ?? 0))
      .slice(0, max)
      .map(({ t }) => ({
        key: `ticket-${t.id}`,
        label: `${t.id} ${t.title ?? ""}`,
        enter: "Open ticket",
        ticket: { id: t.id, title: t.title ?? "", state: t.state ?? "" },
        run: () => {
          this.close();
          openTicket(t.id, tabName(t), { pin: true });
        },
      }));
  }

  /** @param {string} id @returns {Row[]} */
  conductorRows(id) {
    if (!this.conductors) return [{ key: "conductor-loading", label: "Loading conductors..." }];
    if (!this.conductorsServed)
      return [{ key: "conductor-none", label: "The conductor list needs the bakers API." }];
    if (!this.conductors.length)
      return [{ key: "conductor-none", label: "No conductor in this project." }];
    return this.conductors.map((c) => {
      const uuid = c.uuid ?? c.id;
      const name = c.name ?? uuid;
      return {
        key: `conductor-${uuid}`,
        label: name,
        note: [c.machine, c.online === false ? "offline" : null].filter(Boolean).join(", "),
        enter: "Move",
        run: () => {
          this.close();
          openForm("move", { ticket: id, conductor: uuid, name });
        },
      };
    });
  }

  /** @returns {{ title: string | null, rows: Row[] }[]} */
  sections() {
    const q = this.input.value().trim();
    const { page, id } = this.top();
    if (page === "state" && id) {
      const rows = stateItems(id, this.details.get(id)?.ticket?.state ?? "").map((s) => ({
        key: `state-${s.key}`,
        label: s.label,
        current: s.current,
        enter: "Change state",
        run: (/** @type {any} */ cx) => this.perform(s.action, cx),
      }));
      return [{ title: null, rows: filter(rows, q) }];
    }
    if (page === "move" && id) return [{ title: null, rows: filter(this.conductorRows(id), q) }];
    if (page === "tickets") return [{ title: null, rows: this.ticketRows(q, MAX_PAGE_TICKETS) }];
    if (page === "ticket" && id) {
      const rows = this.actionRows(id);
      return [{ title: id, rows: this.details.has(id) ? filter(rows, q) : rows }];
    }
    const out = [];
    if (id) {
      const rows = this.actionRows(id);
      out.push({ title: id, rows: this.details.has(id) ? filter(rows, q) : rows });
    }
    const bound = keys();
    const commands = all("command")
      .filter((c) => c.label)
      .map((c) => {
        const k = bound.find((b) => b.action === `bakers.${c.id}`)?.keys;
        return {
          key: `cmd-${c.id}`,
          label: c.label,
          keys: k ? keyLabel(k) : undefined,
          enter: c.id === "goto" ? "Open" : "Run",
          run:
            c.id === "goto"
              ? (/** @type {any} */ cx) => this.push({ page: "tickets", id }, cx)
              : () => this.command(c.id),
        };
      });
    out.push({ title: "Bakers", rows: filter(commands, q) });
    if (q) out.push({ title: "Tickets", rows: this.ticketRows(q, MAX_TICKETS) });
    return out.filter((s) => s.rows.length);
  }

  /** The highlight: kept while its row is usable, else the first usable row. @param {Row[]} rows */
  pick(rows) {
    const kept = rows.find((r) => r.key === this.hot);
    return kept && usable(kept) ? kept.key : (rows.find(usable)?.key ?? null);
  }

  /** @param {number} dir */
  move(dir) {
    const rows = this.sections()
      .flatMap((s) => s.rows)
      .filter(usable);
    const n = rows.length;
    if (!n) return;
    const i = rows.findIndex((r) => r.key === this.hot);
    this.hot = rows[i < 0 ? (dir > 0 ? 0 : n - 1) : (i + dir + n) % n].key;
  }

  /** @returns {Row | undefined} the highlighted row, built afresh */
  hotRow() {
    return this.sections()
      .flatMap((s) => s.rows)
      .find((x) => x.key === this.hot);
  }

  /** Runs the highlighted row, checked again now: a run that ended since the render runs nothing. @param {any} cx */
  choose(cx) {
    const r = this.hotRow();
    if (r?.run && usable(r)) r.run(cx);
  }

  /** @param {Record<string, import("gpui-kit").Color>} t */
  header(t) {
    const { page, id } = this.top();
    const bar = h_flex()
      .id("actions-target")
      .gap(8)
      .items_center()
      .text_size(11)
      .text_color(t.muted);
    const back =
      this.stack.length > 1 ? (/** @type {any} */ el) => el.child(div().child("‹")) : null;
    if (page === "state" || page === "move")
      return bar
        .when(Boolean(back), back ?? ((el) => el))
        .child(mono(id ?? "", 11))
        .child(div().text_color(t.foreground).child(`› ${TITLES[page]}`));
    if (page === "tickets")
      return bar
        .when(Boolean(back), back ?? ((el) => el))
        .child(div().text_color(t.foreground).child(TITLES.tickets));
    if (!id) return bar.child(div().child("No ticket in front"));
    const tk = this.details.get(id)?.ticket ?? getStore().byId(id);
    return bar
      .when(Boolean(back), back ?? ((el) => el))
      .child(mono(id, 11))
      .child(
        div()
          .flex_1()
          .min_w(0)
          .truncate()
          .text_color(t.foreground)
          .child(tk?.title ?? ""),
      )
      .child(pill(tk?.state ?? "", { size: 11 }));
  }

  /** What Enter, Tab and Esc do now. @param {Row | undefined} hot */
  footer(hot) {
    return [
      hot && usable(hot) ? `↵ ${hot.enter ?? "Run"}` : null,
      hot?.ticket ? "Tab Actions" : null,
      this.stack.length > 1 ? "Esc Back" : "Esc Close",
    ]
      .filter(Boolean)
      .join(" · ");
  }

  /** @param {Record<string, import("gpui-kit").Color>} t @param {Row} r */
  row(t, r) {
    const ok = usable(r);
    const tk = r.ticket;
    const el = h_flex()
      .id(r.key)
      .gap(8)
      .px(8)
      .py(6)
      .rounded(4)
      .items_center()
      .when(r.key === this.hot, (el) => el.bg(t.selected))
      .when(!ok, (el) => el.text_color(t.muted))
      .when(ok, (el) =>
        el
          .cursor_pointer()
          .hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => {
            this.hot = r.key;
            this.choose(cx);
            cx.notify();
          }),
      );
    if (tk)
      return el
        .child(mono(tk.id, 11))
        .child(div().flex_1().min_w(0).truncate().child(tk.title))
        .child(div().text_size(11).text_color(t.muted).child(tk.state));
    return el
      .child(div().child(r.label))
      .child(
        div()
          .flex_1()
          .min_w(0)
          .truncate()
          .text_size(11)
          .when(Boolean(r.reason), (el) => el.child(r.reason ?? "")),
      )
      .when(Boolean(r.note), (el) =>
        el.child(
          div()
            .text_size(11)
            .child(r.note ?? ""),
        ),
      )
      .when(Boolean(r.current), (el) => el.child(div().child("current")))
      .when(Boolean(r.keys), (el) => el.child(mono(r.keys ?? "", 11)));
  }

  render() {
    const t = tokens();
    const sections = this.sections();
    const rows = sections.flatMap((s) => s.rows);
    this.hot = this.pick(rows);
    const hot = rows.find((r) => r.key === this.hot);
    return v_flex()
      .id("actions")
      .w(480)
      .h_full()
      .p(10)
      .gap(6)
      .bg(t.popover)
      .font_family(UI_FONT)
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key === "escape") {
          if (!this.pop()) this.close();
        } else if (e.key === "down") this.move(1);
        else if (e.key === "up") this.move(-1);
        else if (e.key === "enter") this.choose(cx);
        else if (e.key === "tab" || e.key === "right") {
          const r = this.hotRow();
          if (!r?.ticket) return;
          this.push({ page: "ticket", id: r.ticket.id }, cx);
        } else if (e.key === "backspace" && !this.input.value() && this.pop()) {
          // went back a page
        } else return;
        cx.stop_propagation();
        cx.notify();
      })
      .child(this.header(t))
      .child(
        h_flex()
          .id("actions-field")
          .h(32)
          .px(8)
          .items_center()
          .rounded(6)
          .border(2)
          .border_color(t.accent)
          .bg(t.surface)
          .text_size(14)
          .text_color(t.foreground)
          .child(Input.new(this.input).w_full()),
      )
      .child(
        v_flex()
          .id("actions-rows")
          .flex_1()
          .min_h(0)
          .overflow_y_scrollbar()
          .text_size(12)
          .text_color(t.foreground)
          .children(
            sections.flatMap((s) => [
              ...(s.title
                ? [
                    div()
                      .id(`actions-section-${s.title}`)
                      .px(8)
                      .pt(6)
                      .text_size(10)
                      .text_color(t.muted)
                      .child(s.title),
                  ]
                : []),
              ...s.rows.map((r) => this.row(t, r)),
            ]),
          ),
      )
      .when(this.top().page === "state", (el) =>
        el.child(div().text_size(11).text_color(t.muted).child(STATE_MENU_FOOTER)),
      )
      .child(div().text_size(11).text_color(t.muted).child(this.footer(hot)));
  }
}
