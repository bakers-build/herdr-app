// shell/controller/status: the status block, once per window. It draws the status.item
// contributions, starts each window.task (now and on its interval) and runs the key commands
// (keys.json) through the registered command handlers.
import { h_flex } from "gpui-base";
import { layout, nextCommand } from "herdr";
import { findNode } from "../../core/herdr.js";
import { all, get } from "../../core/registry.js";
import { tokens, UI_FONT } from "../../ui/theme.js";
import { draw, launch, settle, stop } from "./contributions.js";

const RAIL = 56;

export default class Status {
  /** The status bar's width; Herdr reports it on resize. */
  width = 1440 - RAIL;
  /** @type {any[]} one controller per status item, made once */
  items = [];

  /** @param {unknown} _props @param {import("gpui-kit").AsyncContext} cx */
  init(_props, cx) {
    const started = all("status.item").map((item) => launch(item.route, cx));
    this.items = started.map((s) => s.c);
    settle(started, cx);
    for (const task of all("window.task")) {
      const tick = (/** @type {import("gpui-kit").AsyncContext} */ cx) =>
        cx.spawn(async (cx) => {
          await task.run();
          cx.notify();
        });
      tick(cx);
      cx.timer.every(task.every, tick);
    }
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        await this.command(c);
        cx.notify();
      }
    });
  }

  /** @param {string} c */
  async command(c) {
    const [name, ...rest] = String(c).split(":");
    const sidebar = findNode(layout(), "sidebar");
    const left = RAIL + (sidebar && !sidebar.hidden ? (sidebar.size?.px ?? 0) : 0);
    await get("command", name)?.run(rest.join(":"), { width: this.width, left });
  }

  /** @param {import("gpui-kit").Context} cx */
  render(cx) {
    const t = tokens();
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
      .on_click(() => {
        for (const c of this.items) c.click?.();
      })
      .children(this.items.flatMap((c) => draw(c, cx)));
  }

  /** @param {import("gpui-kit").AsyncContext} cx */
  async close(cx) {
    await stop(this.items, cx);
  }
}
