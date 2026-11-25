// project/view/picker (route project.picker): switch the window's project.
import { perform } from "../../core/actions.js";
import { PopupList } from "../../ui/components/menu.js";
import { pickerItems } from "../presenter/picker.js";
import { currentProject, ensureChoices, projectChoices } from "../state.js";

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
    return pickerItems(projectChoices(), currentProject()?.uuid ?? null).map((it) => ({
      ...it,
      choose: async (/** @type {any} */ cx) => {
        this.close();
        await perform(it.action, cx);
        await perform(["ticket.refresh"], cx);
      },
    }));
  }
}
