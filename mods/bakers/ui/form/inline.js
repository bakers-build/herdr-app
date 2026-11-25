// ui/form/inline: a form drawn in place (the title and description editor): the text fields,
// the message, then the hint. Its keys send and cancel it (form/keys.js); it has no buttons.
import { div } from "gpui-kit";
import { v_flex } from "gpui-base";

import { field, message } from "./inputs.js";
import { tokens } from "../theme.js";

/**
 * @param {string} id
 * @param {any} def
 * @param {import("./inputs.js").FormInputs} inputs
 */
export function inlineForm(id, def, inputs) {
  const t = tokens();
  const fields = def.fields ?? [];
  const msg = message(inputs.state);
  return v_flex()
    .id(id)
    .w_full()
    .gap(def.gap ?? 6)
    .children(fields.map((/** @type {any} */ f) => field(f, inputs)))
    .when(Boolean(msg), (el) => el.child(msg ?? ""))
    .when(Boolean(def.hint), (el) =>
      el.child(div().text_size(11).text_color(t.muted).child(def.hint)),
    );
}
