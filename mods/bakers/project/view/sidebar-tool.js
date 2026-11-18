// project/view/sidebar-tool: the project button in the header of the Tickets card; it
// opens the project picker when there is more than one project (sidebar.tool "project.picker").
import { svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { openRoute } from "../../core/router.js";
import { chip } from "../../ui/components/chip.js";
import { icons, tokens } from "../../ui/theme.js";
import { currentProject, pickerAvailable, projectChoices } from "../state.js";

export default class ProjectSidebarTool {
  render() {
    const t = tokens();
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
      .when(canPick, (el) => el.cursor_pointer().on_click(() => openRoute("project.picker")));
  }
}
