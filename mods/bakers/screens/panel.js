// screens/panel: the right panel's ticket child (frame R2-3, 368 px, cmd-shift-T). It
// follows the focused ticket tab, else the selected list row, and composes Agent and
// conductor (features/run), Properties (features/properties) and Activity and Runs
// (features/history). Nothing here repeats the document; the panel never takes focus.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { shared, theme } from "herdr";
import { mono, UI_FONT } from "../core/kit.js";
import { getStore, ready } from "../core/session.js";
import { focusedTicket } from "../core/tabs.js";
import { History } from "../features/history/history.js";
import { properties } from "../features/properties/properties.js";
import { agentSection } from "../features/run/run.js";

const CHECK_MS = 300;

export default class Panel {
  init(_props, cx) {
    this.key = null;
    this.id = null;
    this.detail = null;
    this.error = null;
    this.history = new History();
    this.check(cx);
    cx.timer.every(CHECK_MS, (cx) => this.check(cx));
  }

  following() {
    return focusedTicket() ?? /** @type {string | null} */ (shared("bakers.selected")) ?? null;
  }

  /** Reloads when the followed ticket or the last refresh changed (a cheap check, no CLI call otherwise). @param {any} cx */
  check(cx) {
    const id = this.following();
    const key = `${id}|${/** @type {any} */ (shared("bakers.needs"))?.updated ?? null}`;
    if (key === this.key) return;
    this.key = key;
    this.id = id;
    if (!id) {
      this.detail = null;
      cx.notify();
      return;
    }
    cx.spawn(async (cx) => {
      try {
        await ready();
        const detail = await getStore().ticket(id);
        if (this.id !== id) return;
        this.detail = detail;
        this.error = null;
        await this.history.load(id);
      } catch (/** @type {any} */ e) {
        this.error = e?.message ?? String(e);
      }
      cx.notify();
    });
  }

  async reload() {
    if (this.id) this.detail = await getStore().ticket(this.id);
  }

  render() {
    const t = theme();
    const root = v_flex()
      .id("ticket-panel")
      .size_full()
      .min_h(0)
      .bg(t.surface)
      .font_family(UI_FONT)
      .text_size(12)
      .text_color(t.foreground);
    if (!this.id) return root.child(div().p(12).text_color(t.muted).child("No ticket selected"));
    if (!this.detail || this.detail.ticket?.identifier !== this.id)
      return root.child(
        div()
          .p(12)
          .text_color(this.error ? t.blocked : t.muted)
          .child(this.error ?? `Loading ${this.id}...`),
      );
    const tk = this.detail.ticket;
    return root
      .child(
        h_flex()
          .id("panel-header")
          .flex_none()
          .h(40)
          .px(12)
          .gap(8)
          .items_center()
          .bg(t.canvas)
          .border_b(1)
          .border_color(t.border)
          .child(mono(tk.identifier, 12).font_semibold())
          .child(
            div()
              .text_size(12)
              .text_color(t.muted)
              .child(tk.frozen ? `${tk.state}, frozen` : tk.state),
          ),
      )
      .child(
        v_flex()
          .id("panel-body")
          .flex_1()
          .min_h(0)
          .overflow_y_scrollbar()
          .p(12)
          .gap(14)
          .child(agentSection(this.detail))
          .child(properties(tk, () => this.reload()))
          .child(this.history.activitySection())
          .child(this.history.runsSection(this.detail.runs ?? [])),
      );
  }
}
