// project/view/picker (route project.picker): switch the window's project.
import { perform } from "../../core/actions.js";
import { PopupList } from "../../ui/components/menu.js";
import { pickerItems } from "../presenter/picker.js";
import { currentProject, projectChoices } from "../state.js";

export default class ProjectPicker extends PopupList {
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
