// shell/view/rail: the rail (R2-4, R2-3), 56 px: the logo and Herdr's Spaces button, then
// the buttons modules register as rail.item.
import { div } from "gpui-kit";
import { v_flex } from "gpui-base";
import { layout, run } from "herdr";
import { findNode } from "../../core/herdr.js";
import { all } from "../../core/registry.js";
import { draw, launch, settle, stop } from "./contributions.js";
import { square } from "../../ui/components/square.js";
import { tokens, UI_FONT } from "../../ui/theme.js";

export default class Rail {
  /** @type {any[]} one view per rail item, made once */
  items = [];

  /** @param {import("gpui-shell").Props | undefined} _props @param {import("gpui-kit").AsyncContext} cx */
  init(_props, cx) {
    const started = all("rail.item")
      .map((item) => launch(item.route, cx))
      .filter((s) => s !== null);
    this.items = started.map((s) => s.c);
    settle(started, cx);
  }

  /** @param {import("gpui-kit").Context} cx */
  render(cx) {
    const t = tokens();
    const sidebarShown = !findNode(layout(), "sidebar")?.hidden;
    const rail = v_flex()
      .id("rail")
      .w(56)
      .h_full()
      .items_center()
      .gap(10)
      .pt(12)
      .bg(t.chrome)
      .border_r(1)
      .border_color(t.border)
      .font_family(UI_FONT)
      .child(div().size(20).rounded(5).bg(t.border).mb(8))
      .child(
        square()
          .id("rail-spaces")
          .border_color(sidebarShown ? t.foreground : t.border)
          .text_size(9)
          .text_color(sidebarShown ? t.foreground : t.muted)
          .accessibility_label(sidebarShown ? "Spaces, sidebar shown" : "Spaces")
          .on_click(() => run("layout.toggle", { id: "sidebar" }))
          .child("Spaces"),
      );
    for (const c of this.items) rail.children(draw(c, cx));
    return rail;
  }

  /** @param {import("gpui-kit").AsyncContext} cx */
  async close(cx) {
    await stop(this.items, cx);
  }
}
