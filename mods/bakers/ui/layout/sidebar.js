// ui/layout/sidebar: the bakers section of the left sidebar (R2-3), below Herdr's Spaces and
// Agents: the Tickets card with the project picker and the views with their counts.
import { svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { openOverlay, theme } from "herdr";
import { ensureTicketsTab } from "../../core/tabs.js";
import { icons, UI_FONT } from "../../core/theme.js";
import { chip } from "../../components/chip.js";
import { navRows } from "../../components/nav.js";
import { heading } from "../../components/text.js";
import { currentProject, pickerAvailable, projectChoices } from "../../entity/project/data.js";
import { currentView, getStore, ready, setView } from "../../entity/ticket/data.js";
import { sidebarRows } from "../../entity/ticket/presenter/counts.js";

export default class Sidebar {
  init(_props, cx) {
    cx.spawn(async (cx) => {
      await ready();
      cx.notify();
    });
  }

  picker() {
    const t = theme();
    const canPick = pickerAvailable() && projectChoices().length > 1;
    return h_flex()
      .id("project-picker")
      .ml_auto()
      .h(20)
      .px(6)
      .gap(4)
      .items_center()
      .rounded(4)
      .border(1)
      .border_color(t.border)
      .bg(t.surface)
      .text_size(11)
      .child(currentProject()?.name ?? "No project")
      .child(svg(icons.down).size(10))
      .when(!pickerAvailable(), (el) => el.child(chip()))
      .when(canPick, (el) =>
        el.cursor_pointer().on_click(() =>
          openOverlay({
            mod: "bakers",
            props: { view: "project-picker" },
            kind: "popup",
            width: 220,
          }),
        ),
      );
  }

  render() {
    const t = theme();
    const rows = sidebarRows(getStore().counts(), currentView());
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
            h_flex().gap(6).mb(4).items_center().child(heading("Tickets")).child(this.picker()),
          )
          .children(
            navRows(rows, (key) => {
              setView(key);
              ensureTicketsTab();
            }),
          ),
      );
  }
}
