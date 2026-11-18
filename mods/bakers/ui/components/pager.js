// ui/components/pager: the row below a list that loads the next page.
import { h_flex } from "gpui-base";
import { tokens } from "../theme.js";

/** @param {string} label @param {(e: any, cx: any) => void} onMore */
export function pager(label, onMore) {
  const t = tokens();
  return h_flex()
    .id("show-more")
    .px(12)
    .py(10)
    .border_t(1)
    .border_color(t.border)
    .text_size(12)
    .text_color(t.accent)
    .cursor_pointer()
    .hover((s) => s.bg(t.hover))
    .on_click(onMore)
    .child(label);
}
