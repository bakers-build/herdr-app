// project/view/button: the project button in the Tickets list header (header.tool
// "project.picker"); it opens the project picker when there is more than one project.
import { svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { openRoute } from "../../core/router.js";
import { chip } from "../../ui/components/chip.js";
import { icons, tokens } from "../../ui/theme.js";
import { currentProject, pickerAvailable, projectChoices } from "../state.js";

export default class ProjectButton {
  render() {
    const t = tokens();
    const canPick = pickerAvailable() && projectChoices().length > 1;
    return h_flex()
      .id("project-button")
      .flex_none()
      .h(28)
      .px(10)
      .gap(6)
      .items_center()
      .rounded(6)
      .border(1)
      .border_color(t.border)
      .bg(t.surface)
      .font_semibold()
      .child(currentProject()?.name ?? "No project")
      .when(canPick, (el) =>
        el
          .child(svg(icons.down).size(10))
          .cursor_pointer()
          .on_click(() => openRoute("project.picker")),
      )
      .when(!pickerAvailable(), (el) => el.child(chip()));
  }
}
