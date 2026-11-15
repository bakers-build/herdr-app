// ui/pickers: the popups that choose before anything is written: the project picker, the
// conductor picker of Move to... (R3-2; then the move dialog asks), and the label picker
// (labels used in the project, or a typed one; added at once).
import { div } from "gpui-kit";
import { h_flex, Input, InputState } from "gpui-base";
import { props } from "herdr";
import { perform } from "../core/actions.js";
import { classify } from "../core/errors.js";
import { chip } from "../components/chip.js";
import { openForm } from "../components/form/dialog.js";
import { PopupList } from "../components/menu.js";
import { currentProject, projectChoices } from "../entity/project/data.js";
import { pickerItems } from "../entity/project/presenter/picker.js";
import { getStore, listConductors, ready } from "../entity/ticket/data.js";

export class ProjectPicker extends PopupList {
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

export class ConductorPicker extends PopupList {
  init(p, cx) {
    super.init(p, cx);
    this.conductors = null;
    this.served = true;
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
      hint: c.machine ?? "",
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

  bottom(t) {
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

export class LabelPicker extends PopupList {
  init(p, cx) {
    super.init(p, cx);
    this.typing = true;
    this.input = InputState.new({ placeholder: "Label name" });
    this.input.on("change", (_e, cx) => cx.notify());
    this.input.on("submit", (_e, cx) => this.add(this.input.value(), cx));
    this.input.focus();
  }

  /** @param {string} name @param {any} cx */
  add(name, cx) {
    const label = name.trim();
    if (!label) return;
    this.close();
    cx.spawn(async () => {
      await perform(["ticket.labels", props().ticket, { labels_add: [label] }], cx);
    });
  }

  items() {
    const q = this.input.value().trim().toLowerCase();
    const known = new Set();
    for (const tk of getStore().tickets) for (const l of tk.labels ?? []) known.add(l);
    return [...known]
      .filter((l) => !q || l.toLowerCase().includes(q))
      .sort()
      .map((l) => ({ key: l, label: l, choose: (/** @type {any} */ cx) => this.add(l, cx) }));
  }

  top(t) {
    return div()
      .id("label-field")
      .h(28)
      .px(8)
      .mb(4)
      .flex()
      .items_center()
      .rounded(6)
      .border(1)
      .border_color(t.accent)
      .bg(t.surface)
      .child(Input.new(this.input).w_full());
  }
}
