// components/form/inline: a form drawn in place (the composer, the title and description
// editor): an optional accent label, the text fields, the message, then one row with the
// checkboxes, the hint and the buttons. Each button sends with its own variant.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme } from "herdr";
import { button } from "../components/button.js";
import { field, message } from "./inputs.js";

/**
 * @param {string} id
 * @param {any} def
 * @param {import("./inputs.js").FormInputs} inputs
 * @param {(variant: string, cx: any) => void} onButton
 */
export function inlineForm(id, def, inputs, onButton) {
  const t = theme();
  const fields = def.fields ?? [];
  const texts = fields.filter((/** @type {any} */ f) => f.type !== "checkbox");
  const boxes = fields.filter((/** @type {any} */ f) => f.type === "checkbox");
  const buttons = def.buttons ?? [];
  const msg = message(inputs.state);
  return v_flex()
    .id(id)
    .w_full()
    .gap(def.gap ?? 6)
    .when(Boolean(def.label), (el) =>
      el.child(div().text_size(11).font_semibold().text_color(t.accent).child(def.label)),
    )
    .children(texts.map((/** @type {any} */ f) => field(f, inputs)))
    .when(Boolean(msg), (el) => el.child(msg))
    .when(Boolean(boxes.length || def.hint || buttons.length), (el) =>
      el.child(
        h_flex()
          .gap(8)
          .items_center()
          .flex_wrap()
          .children(boxes.map((/** @type {any} */ f) => field(f, inputs)))
          .when(Boolean(def.hint), (r) =>
            r.child(
              div()
                .flex_1()
                .text_size(11)
                .text_color(t.muted)
                .when(buttons.length > 0, (d) => d.text_right())
                .child(def.hint),
            ),
          )
          .children(
            buttons.map((/** @type {any} */ b) =>
              button(b.id, b.label, (_e, cx) => onButton(b.variant, cx), {
                h: 26,
                size: 12,
                primary: Boolean(b.primary),
                disabled: inputs.state.busy,
              }),
            ),
          ),
      ),
    );
}
