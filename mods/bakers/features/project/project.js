// features/project: the project picker. The project itself is resolved by core/session
// (shared uuid, else .bakers/project.config.js of the active space); this slice draws the
// sidebar's picker button and the popup that switches projects.
import { svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { openOverlay, theme } from "herdr";
import { register } from "../../core/actions.js";
import { chip, icons } from "../../core/kit.js";
import { PopupList } from "../../core/menu.js";
import {
  chooseProject,
  currentProject,
  pickerAvailable,
  projectChoices,
  refresh,
} from "../../core/session.js";
import { perform } from "../../core/actions.js";

register("project.choose", async (uuid, name) => {
  chooseProject({ uuid, name });
  await refresh();
});

export function openProjectPicker() {
  openOverlay({ mod: "bakers", props: { view: "project-picker" }, kind: "popup", width: 220 });
}

/** The picker button in the sidebar's Tickets header; disabled with the API chip when the CLI has no project list. */
export function pickerButton() {
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
    .when(canPick, (el) => el.cursor_pointer().on_click(() => openProjectPicker()));
}

/** The view "project-picker". */
export default class ProjectPicker extends PopupList {
  items() {
    return projectChoices().map((pr) => ({
      key: pr.uuid,
      label: pr.name,
      current: pr.uuid === currentProject()?.uuid,
      hint: pr.uuid === currentProject()?.uuid ? "current" : undefined,
      choose: (/** @type {any} */ cx) => {
        this.close();
        perform(["project.choose", pr.uuid, pr.name], cx);
      },
    }));
  }
}
