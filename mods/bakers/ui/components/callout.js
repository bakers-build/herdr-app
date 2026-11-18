// ui/components/callout: a card with an accent border: a small upper-case label, a title, a
// text, then buttons and a hint (the Needs-you card).
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { tokens } from "../theme.js";

/** @param {string} id @param {{ label: string, title: string, text: string, hint?: string }} vm @param {any[]} buttons */
export function callout(id, vm, buttons) {
  const t = tokens();
  return v_flex()
    .id(id)
    .gap(8)
    .px(14)
    .py(12)
    .rounded(8)
    .border(1)
    .border_color(t.accent)
    .child(div().text_size(11).font_semibold().text_color(t.accent).child(vm.label))
    .child(div().font_semibold().child(vm.title))
    .child(div().text_size(13).child(vm.text))
    .child(
      h_flex()
        .gap(8)
        .flex_wrap()
        .items_center()
        .children(buttons)
        .when(Boolean(vm.hint), (el) =>
          el.child(
            div()
              .text_size(11)
              .text_color(t.muted)
              .child(vm.hint ?? ""),
          ),
        ),
    );
}
