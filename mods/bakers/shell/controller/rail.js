// shell/controller/rail: the rail (R2-4, R2-3), 56 px: Herdr's Spaces button and the bakers button
// with the needs-you count; bakers opens the Tickets tab on Needs me.
import { div } from "gpui-kit";
import { v_flex } from "gpui-base";
import { layout, run, shared } from "herdr";
import { findNode } from "../../core/herdr.js";
import { ensureTicketsTab } from "../../ticket/tabs.js";
import { tokens, UI_FONT } from "../../ui/theme.js";
import { setView } from "../../ticket/state.js";
import { railLabel } from "../../ticket/presenter/counts.js";

export default class Rail {
  render() {
    const t = tokens();
    const label = railLabel(/** @type {any} */ (shared("bakers.needs"))?.count ?? 0);
    const sidebarShown = !findNode(layout(), "sidebar")?.hidden;
    const square = () =>
      div()
        .size(36)
        .flex()
        .items_center()
        .justify_center()
        .rounded(6)
        .border(1)
        .bg(t.surface)
        .cursor_pointer();
    return v_flex()
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
      )
      .child(
        square()
          .id("rail-bakers")
          .border_color(t.accent)
          .text_size(10)
          .font_semibold()
          .text_color(t[label.tone])
          .accessibility_label(label.aria)
          .on_click(() => {
            setView("needs-me");
            ensureTicketsTab();
          })
          .child(label.text),
      );
  }
}
