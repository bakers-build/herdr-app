// components/pill: a 24 px pill (state, Frozen, from and to in dialogs), optionally a button
// with a chevron.
import { svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { theme } from "herdr";
import { icons } from "../core/theme.js";

/** @param {string} text @param {{ strong?: boolean, id?: string, chevron?: boolean, px?: number, size?: number, onClick?: (e: any, cx: any) => void }} [o] */
export function pill(text, o = {}) {
  const t = theme();
  return h_flex()
    .when(Boolean(o.id), (el) => el.id(o.id))
    .h(24)
    .px(o.px ?? 8)
    .gap(4)
    .items_center()
    .rounded(12)
    .border(1)
    .border_color(o.strong ? t.foreground : t.border)
    .when(Boolean(o.strong) && o.size == null, (el) => el.font_semibold())
    .when(o.size != null, (el) => el.text_size(o.size))
    .when(Boolean(o.onClick), (el) => el.bg(t.surface).cursor_pointer().on_click(o.onClick))
    .child(text)
    .when(Boolean(o.chevron), (el) => el.child(svg(icons.down).size(10)));
}
