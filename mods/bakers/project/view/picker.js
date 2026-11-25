// project/view/picker (route project.picker): switch the window's project. It only chooses: a
// popup's tasks end when it closes, so the Tickets list, a long-lived copy, loads the project.
import { h_flex } from "gpui-base";
import { perform } from "../../core/actions.js";
import { PopupList } from "../../ui/components/menu.js";
import { pickerItems, workspaceSegments } from "../presenter/picker.js";
import {
  chooseWorkspace,
  currentProject,
  ensureChoices,
  projectsOf,
  shownWorkspace,
  workspaceChoices,
} from "../state.js";

export default class ProjectPicker extends PopupList {
  /** A popup is a fresh copy of the mod: it loads the project and the choices it lists.
   *  @param {unknown} props @param {import("gpui-kit").AsyncContext} cx */
  init(props, cx) {
    super.init(props, cx);
    cx.spawn(async (cx) => {
      await ensureChoices();
      cx.notify();
    });
  }

  items() {
    return pickerItems(projectsOf(shownWorkspace()), currentProject()?.uuid ?? null).map((it) => ({
      ...it,
      choose: async (/** @type {any} */ cx) => {
        await perform(it.action, cx);
        this.close();
      },
    }));
  }

  /** The workspace switch above the rows; none with fewer than two workspaces.
   *  @param {any} t */
  top(t) {
    const choices = workspaceChoices();
    if (choices.length < 2) return null;
    const shown = shownWorkspace()?.uuid ?? null;
    return h_flex()
      .id("workspace-switch")
      .flex_wrap()
      .gap(4)
      .px(4)
      .pb(4)
      .children(
        workspaceSegments(choices, shown).map((s) =>
          h_flex()
            .id(`ws-${s.key}`)
            .px(8)
            .py(4)
            .rounded(4)
            .cursor_pointer()
            .hover((el) => (s.current ? el : el.bg(t.hover)))
            .when(s.current, (el) => el.bg(t.selected).font_semibold())
            .child(s.label)
            .on_click((_e, cx) => {
              chooseWorkspace(s.key);
              this.at = 0;
              cx.notify();
            }),
        ),
      );
  }

  /** Left and Right cycle the workspaces.
   *  @param {any} e @returns {boolean} */
  onKey(e) {
    const choices = workspaceChoices();
    if (choices.length < 2 || (e.key !== "left" && e.key !== "right")) return false;
    const shown = shownWorkspace()?.uuid;
    const i = Math.max(
      0,
      choices.findIndex((w) => w.uuid === shown),
    );
    const step = e.key === "right" ? 1 : choices.length - 1;
    chooseWorkspace(choices[(i + step) % choices.length].uuid);
    this.at = 0;
    return true;
  }
}
