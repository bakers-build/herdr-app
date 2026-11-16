// ui/components/button: a button as drawn: 1 px border, 6 px corners; primary is solid and
// semibold; disabled shows half opacity and says why.
import { h_flex } from "gpui-base";
import { theme } from "herdr";

/**
 * @param {string} id
 * @param {string} label
 * @param {((e: any, cx: any) => void) | null} onClick
 * @param {{ primary?: boolean, h?: number, px?: number, size?: number, disabled?: boolean, reason?: string }} [o]
 */
export function button(id, label, onClick, o = {}) {
  const t = theme();
  const h = o.h ?? 28;
  const el = h_flex()
    .id(id)
    .flex_none()
    .h(h)
    .px(o.px ?? (o.primary ? 12 : h <= 24 ? 8 : 10))
    .items_center()
    .rounded(6)
    .when(o.size != null, (e) => e.text_size(o.size))
    .when(Boolean(o.primary), (e) => e.bg(t.solid).text_color(t.solid_foreground).font_semibold())
    .when(!o.primary, (e) =>
      e.border(1).border_color(t.border).bg(t.surface).text_color(t.foreground),
    )
    .child(label);
  if (o.disabled)
    return el
      .disabled(true)
      .opacity(0.5)
      .when(Boolean(o.reason), (e) => e.tooltip(o.reason));
  return onClick
    ? el
        .cursor_pointer()
        .hover((s) => s.opacity(0.88))
        .on_click(onClick)
    : el;
}
