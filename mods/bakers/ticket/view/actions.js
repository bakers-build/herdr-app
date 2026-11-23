// ticket/view/actions: the actions palette (cmd-K, route ticket.actions, a 480 px popup placed like
// Go to ticket). props.ticket is the target the actions command resolved (frontTicket), or null.
// It lists the ticket's actions from ticket/operations, then every command that carries a label,
// with its key. Typing matches fuzzily (core/fuzzy.js), best first, and adds the matching tickets:
// the store's at once, the server search's after 200 ms. An action that cannot run stays listed
// with its reason and is skipped. Change state is a second step over the state menu's items.
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
import { searchTickets } from "../repository.js";
import { getStore, ready } from "../store.js";
import { openTicket } from "../tabs.js";
import { runReason, runTerminal } from "../terminal.js";
import { pill } from "../../ui/components/pill.js";
import { mono } from "../../ui/components/text.js";
import { tokens, UI_FONT } from "../../ui/theme.js";

const HINT = "Up and down choose, Enter runs, Esc closes.";
const DEBOUNCE_MS = 200;
const MAX_TICKETS = 8;
const WHERE = { width: 1440 - 56, left: 56 };

/**
 * @typedef {{ key: string, label: string, keys?: string, reason?: string | null, current?: boolean,
 *   ticket?: { id: string, title: string, state: string }, run?: (cx: any) => void }} Row
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
  input = InputState.new({ placeholder: "Type an action..." });
  /** @type {"actions" | "state"} */
  step = "actions";
  /** The highlighted row's key; render keeps it on a usable row. @type {string | null} */
  hot = null;
  /** @type {any} the target's detail, as a ticket tab loads it */
  detail = null;
  /** @type {string | null} */
  failure = null;
  /** The server search's tickets for the current text. @type {any[]} */
  remote = [];
  /** Counts keystrokes; a server search answers only if no newer keystroke came. */
  seq = 0;

  /** @param {unknown} _props @param {import("gpui-kit").AsyncContext} cx */
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.input.on("change", (_e, cx) => {
      this.hot = null;
      const seq = ++this.seq;
      cx.timer.after(DEBOUNCE_MS, (cx) => {
        if (seq === this.seq) this.searchRemote(seq, cx);
      });
      cx.notify();
    });
    this.input.focus();
    const id = this.id();
    this.detail = id ? getStore().cached(id) : null;
    cx.spawn(async (cx) => {
      try {
        await ready();
        if (!id) return;
        const d = await getStore().ticket(id);
        if (!d?.ticket) throw new Error(`${id} was not found`);
        this.detail = d;
      } catch (/** @type {any} */ e) {
        if (!this.detail) this.failure = classify(e)?.message ?? String(e);
      }
      cx.notify();
    });
  }

  /** The server search for the text, after a pause in typing. @param {number} seq @param {any} cx */
  searchRemote(seq, cx) {
    const q = this.input.value().trim();
    if (!q || this.step !== "actions") return;
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

  /** The matching tickets: the store's and the server's, an exact identifier first. @param {string} q @returns {Row[]} */
  matchingTickets(q) {
    if (!q) return [];
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
      .slice(0, MAX_TICKETS)
      .map(({ t }) => ({
        key: `ticket-${t.id}`,
        label: `${t.id} ${t.title ?? ""}`,
        ticket: { id: t.id, title: t.title ?? "", state: t.state ?? "" },
        run: () => {
          this.close();
          openTicket(t.id, tabName(t), { pin: true });
        },
      }));
  }

  /** @returns {string | null} */
  id() {
    return /** @type {any} */ (props())?.ticket ?? null;
  }

  close() {
    closeOverlay(/** @type {any} */ (props())?.overlay);
  }

  /** @param {any[] | undefined} action @param {any} cx */
  perform(action, cx) {
    this.close();
    if (action) void perform(action, cx);
  }

  /** Runs a key command as its key does, with the position the actions command measured. @param {string} name @param {string} arg */
  command(name, arg) {
    this.close();
    void get("command", name)?.run(arg, /** @type {any} */ (props())?.where ?? WHERE);
  }

  /** @param {string} id @returns {Row[]} */
  ticketRows(id) {
    const d = this.detail;
    if (!d)
      return [
        this.failure
          ? { key: "action-failure", label: this.failure }
          : { key: "action-loading", label: `Loading ${id}...` },
      ];
    const runs = { runs: d.runs ?? [], claim_machine: d.ticket?.claim_machine ?? null };
    const reason = runReason(runs, runTerminal(id, d.ticket?.id));
    return ticketActions(d, reason).map((a) => ({
      key: `action-${a.key}`,
      label: a.label,
      keys: a.keys,
      reason: a.reason ?? null,
      run: a.step
        ? () => {
            this.step = "state";
            this.hot = null;
            this.input.set_value("");
          }
        : (/** @type {any} */ cx) => this.perform(a.action, cx),
    }));
  }

  /** @returns {{ title: string | null, rows: Row[] }[]} */
  sections() {
    const q = this.input.value().trim();
    const id = this.id();
    if (this.step === "state" && id) {
      const items = stateItems(id, this.detail?.ticket?.state ?? "");
      const rows = items.map((s) => ({
        key: `state-${s.key}`,
        label: s.label,
        current: s.current,
        run: (/** @type {any} */ cx) => this.perform(s.action, cx),
      }));
      return [{ title: null, rows: filter(rows, q) }];
    }
    const out = [];
    if (id) {
      const rows = this.ticketRows(id);
      out.push({ title: id, rows: this.detail ? filter(rows, q) : rows });
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
          run: () => this.command(c.id, ""),
        };
      });
    out.push({ title: "Bakers", rows: filter(commands, q) });
    out.push({ title: "Tickets", rows: this.matchingTickets(q) });
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

  /** Runs the highlighted row, checked again now: a run that ended since the render runs nothing. @param {any} cx */
  choose(cx) {
    const r = this.sections()
      .flatMap((s) => s.rows)
      .find((x) => x.key === this.hot);
    if (r?.run && usable(r)) r.run(cx);
  }

  /** @param {Record<string, import("gpui-kit").Color>} t */
  header(t) {
    const id = this.id();
    const bar = h_flex()
      .id("actions-target")
      .gap(8)
      .items_center()
      .text_size(11)
      .text_color(t.muted);
    if (!id) return bar.child(div().child("No ticket in front"));
    if (this.step === "state")
      return bar.child(mono(id, 11)).child(div().text_color(t.foreground).child("› Change state"));
    const tk = this.detail?.ticket ?? getStore().byId(id);
    return bar
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
      .when(Boolean(r.current), (el) => el.child(div().child("current")))
      .when(Boolean(r.keys), (el) => el.child(mono(r.keys ?? "", 11)));
  }

  render() {
    const t = tokens();
    const sections = this.sections();
    this.hot = this.pick(sections.flatMap((s) => s.rows));
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
        if (e.key === "escape") this.close();
        else if (e.key === "down") this.move(1);
        else if (e.key === "up") this.move(-1);
        else if (e.key === "enter") this.choose(cx);
        else if (e.key === "backspace" && this.step === "state" && !this.input.value()) {
          this.step = "actions";
          this.hot = null;
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
      .child(
        div()
          .text_size(11)
          .text_color(t.muted)
          .child(this.step === "state" ? STATE_MENU_FOOTER : HINT),
      );
  }
}
