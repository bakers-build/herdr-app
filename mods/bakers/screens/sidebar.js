// screens/sidebar: the bakers section of the left sidebar (R2-3), below Herdr's Spaces
// and Agents: the Tickets card with the project picker (features/project) and the views
// with their counts (features/views).
import { h_flex, v_flex } from "gpui-base";
import { theme } from "herdr";
import { heading, UI_FONT } from "../core/kit.js";
import { getStore, ready } from "../core/session.js";
import { pickerButton } from "../features/project/project.js";
import { viewRows } from "../features/views/views.js";

export default class Sidebar {
  init(_props, cx) {
    cx.spawn(async (cx) => {
      await ready();
      cx.notify();
    });
  }

  render() {
    const t = theme();
    return v_flex()
      .id("bakers-sidebar")
      .w(220)
      .px(10)
      .py(12)
      .font_family(UI_FONT)
      .text_size(12)
      .text_color(t.foreground)
      .child(
        v_flex()
          .p(8)
          .gap(2)
          .rounded(6)
          .border(1)
          .border_color(t.border)
          .bg(t.surface)
          .child(
            h_flex().gap(6).mb(4).items_center().child(heading("Tickets")).child(pickerButton()),
          )
          .children(viewRows(getStore().counts())),
      );
  }
}
