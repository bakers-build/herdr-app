// ticket/view/conductor-picker (route ticket.conductor-picker): Move to... picks a
// conductor of the project (bb_conductor), then the move form asks before anything happens.
import { h_flex } from "gpui-base";
import { props } from "herdr";
import { classify } from "../../core/errors.js";
import { chip } from "../../ui/components/chip.js";
import { openForm } from "../../ui/form/dialog.js";
import { PopupList } from "../../ui/components/menu.js";
import { listConductors } from "../repository.js";
import { getStore, ready } from "../store.js";

export default class ConductorPicker extends PopupList {
  /** @type {any[] | null} null until loaded */
  conductors = null;
  served = true;

  /** @param {import("gpui-shell").Props | undefined} p @param {import("gpui-kit").AsyncContext} cx */
  init(p, cx) {
    super.init(p, cx);
    cx.spawn(async (cx) => {
      try {
        const project = await ready();
        this.conductors = await listConductors(project?.uuid ?? getStore().project);
      } catch (e) {
        this.conductors = [];
        this.served = classify(e)?.kind !== "api";
      }
      cx.notify();
    });
  }

  items() {
    return (this.conductors ?? []).map((/** @type {any} */ c) => ({
      key: c.uuid ?? c.id,
      label: c.name ?? c.uuid,
      hint: [c.machine, c.online === false ? "offline" : null].filter(Boolean).join(", "),
      choose: () => {
        this.close();
        openForm("move", {
          ticket: props().ticket,
          conductor: c.uuid ?? c.id,
          name: c.name ?? c.uuid,
        });
      },
    }));
  }

  /** @param {Record<string, import("gpui-kit").Color>} t */
  bottom(t) {
    if (this.served && this.conductors && !this.conductors.length)
      return h_flex().px(8).py(6).text_color(t.muted).child("No conductor in this project.");
    if (this.served) return null;
    return h_flex()
      .gap(4)
      .items_center()
      .px(8)
      .py(6)
      .text_color(t.muted)
      .child(chip())
      .child("The conductor list needs the bakers API.");
  }
}
