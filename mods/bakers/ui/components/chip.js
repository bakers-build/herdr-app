// components/chip: the dashed chip, e.g. "API" for what the bakers API cannot deliver yet.
import { h_flex } from "gpui-base";
import { theme } from "herdr";

/** @param {string} [text] @param {number} [size] */
export function chip(text = "API", size = 8) {
  const t = theme();
  return h_flex()
    .flex_none()
    .h(size === 8 ? 14 : 16)
    .px(size === 8 ? 4 : 5)
    .items_center()
    .rounded(size === 8 ? 3 : 4)
    .border(1)
    .border_dashed()
    .border_color(t.muted)
    .text_size(size)
    .font_semibold()
    .text_color(t.muted)
    .child(text);
}
