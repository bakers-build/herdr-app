// ticket/view/label-picker (route ticket.label-picker): the workspace's labels with those used
// in the project, minus the ticket's own, or a typed one; the chosen label is added at once.
import { div } from "gpui-kit";
import { Input, InputState } from "gpui-base";
import { props } from "herdr";
import { perform } from "../../core/actions.js";
import { PopupList } from "../../ui/components/menu.js";
import { noValues } from "../filter.js";
import { getStore, ready } from "../store.js";

export default class LabelPicker extends PopupList {
  input = InputState.new({ placeholder: "Label name" });

  /** @param {import("gpui-shell").Props | undefined} p @param {import("gpui-kit").AsyncContext} cx */
  init(p, cx) {
    super.init(p, cx);
    this.typing = true;
    this.input.on("change", (_e, cx) => cx.notify());
    this.input.on("submit", (_e, cx) => this.add(this.input.value(), cx));
    this.input.focus();
    // The ticket's own labels and the catalog come from the store, loaded once per project.
    cx.spawn(async (cx) => {
      await ready();
      cx.notify();
    });
  }

  /** The filter takes the keyboard; Esc there reaches the popup's root and closes it. */
  focusTarget() {
    return this.input;
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
    const store = getStore();
    const id = props().ticket;
    const own = new Set(store.byId(id)?.labels ?? store.cached(id)?.ticket?.labels ?? []);
    const known = new Set(store.catalog?.labels ?? []);
    for (const tk of store.tickets) for (const l of tk.labels ?? []) known.add(l);
    const offered = [...known].filter((l) => !own.has(l));
    if (!offered.length)
      return [
        {
          key: "none",
          label:
            known.size && store.catalog && !store.catalog.error
              ? "The ticket has every label"
              : noValues("label", store.catalog),
          disabled: true,
        },
      ];
    const q = this.input.value().trim().toLowerCase();
    return offered
      .filter((l) => !q || l.toLowerCase().includes(q))
      .sort()
      .map((l) => ({ key: l, label: l, choose: (/** @type {any} */ cx) => this.add(l, cx) }));
  }

  /** @param {Record<string, import("gpui-kit").Color>} t */
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
