// ui/goto: Go to ticket (cmd-shift-O, frame R2-4): a 480 px popup that searches identifier or
// title words with bakers_ticket_search as the person types (200 ms debounce). Enter
// opens the ticket as a tab, or selects its tab when it is open; Esc closes.
import { div } from "gpui-kit";
import { h_flex, Input, InputState, v_flex } from "gpui-base";
import { closeOverlay, props, theme } from "herdr";
import { classify } from "../../core/errors.js";
import { openTicket } from "../../core/tabs.js";
import { UI_FONT } from "../../ui/theme.js";
import { mono } from "../../ui/components/text.js";
import { getStore, ready } from "../store.js";
import { searchTickets } from "../repository.js";
import { search } from "../presenter/search.js";
import { tabName } from "../presenter/tab.js";

const DEBOUNCE_MS = 200;
const HINT =
  "Identifier or words of the title. Enter opens it as a tab, or selects its tab if it is open.";

export default class Goto {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.input = InputState.new({ placeholder: "" });
    this.results = [];
    this.at = 0;
    this.seq = 0;
    this.error = null;
    this.input.on("change", (_e, cx) => {
      const seq = ++this.seq;
      cx.timer.after(DEBOUNCE_MS, (cx) => {
        if (seq === this.seq) this.search(seq, cx);
      });
    });
    this.input.on("submit", () => this.choose());
    this.input.focus();
    cx.spawn(async () => {
      await ready();
    });
  }

  /** @param {number} seq @param {any} cx */
  search(seq, cx) {
    const query = this.input.value().trim();
    if (!query) {
      this.results = [];
      cx.notify();
      return;
    }
    cx.spawn(async (cx) => {
      try {
        const p = await ready();
        const found = (await searchTickets(query, p?.uuid ?? getStore().project)).map(search);
        if (seq !== this.seq) return;
        this.results = found;
        this.error = null;
        this.at = 0;
      } catch (/** @type {any} */ e) {
        this.error = classify(e)?.message ?? String(e);
      }
      cx.notify();
    });
  }

  choose() {
    const r = this.results[this.at];
    if (!r) return;
    openTicket(r.id, tabName(r), { pin: true });
    closeOverlay(props().overlay);
  }

  render() {
    const t = theme();
    return v_flex()
      .id("goto")
      .w(480)
      .p(10)
      .gap(6)
      .bg(t.popover)
      .font_family(UI_FONT)
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        const n = this.results.length;
        if (e.key === "escape") closeOverlay(props().overlay);
        else if (e.key === "down" && n) this.at = (this.at + 1) % n;
        else if (e.key === "up" && n) this.at = (this.at + n - 1) % n;
        else if (e.key === "enter") this.choose();
        else return;
        cx.stop_propagation();
        cx.notify();
      })
      .child(
        h_flex()
          .id("goto-label")
          .gap(8)
          .text_size(11)
          .text_color(t.muted)
          .child(div().child("Go to ticket"))
          .child(mono("cmd-shift-O", 11)),
      )
      .child(
        h_flex()
          .id("goto-field")
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
          .text_size(12)
          .children(
            this.results.map((r, i) =>
              h_flex()
                .id(`goto-${r.id}`)
                .gap(8)
                .px(8)
                .py(6)
                .rounded(4)
                .when(i === this.at, (el) => el.bg(t.selected))
                .cursor_pointer()
                .on_click(() => {
                  this.at = i;
                  this.choose();
                })
                .child(mono(r.id, 11))
                .child(
                  div()
                    .flex_1()
                    .min_w(0)
                    .truncate()
                    .child(r.title ?? ""),
                )
                .child(
                  div()
                    .text_color(t.muted)
                    .child(r.state ?? ""),
                ),
            ),
          ),
      )
      .when(Boolean(this.error), (el) =>
        el.child(div().text_size(11).text_color(t.blocked).child(this.error)),
      )
      .child(div().text_size(11).text_color(t.muted).child(HINT));
  }
}
