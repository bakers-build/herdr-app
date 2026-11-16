// components/table: column header and rows on a fixed grid (fixed px, one flexible column),
// 12 px gap; the selected row has the accent outline on the selected color.
import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { theme } from "herdr";
import { MONO_FONT } from "../theme.js";
import { statusLine } from "./status-line.js";

/** @param {any} el @param {number | null} w */
const sized = (el, w) => (w == null ? el.flex_1().min_w(0) : el.w(w).flex_none());

/** @param {{ label: string, w: number | null }[]} columns */
export function tableHeader(columns) {
  const t = theme();
  return h_flex()
    .id("columns")
    .gap(12)
    .px(12)
    .py(6)
    .border_b(1)
    .border_color(t.border)
    .text_size(11)
    .font_semibold()
    .text_color(t.muted)
    .children(columns.map((c) => sized(div(), c.w).child(c.label)));
}

/**
 * A cell is { text, mono?, tone?, strong?, size?, truncate? } or { status: StatusLine props }.
 * @param {any} cell @param {number | null} w
 */
function cellEl(cell, w) {
  const t = theme();
  if (cell.status) return sized(statusLine(null, { ...cell.status, size: 12 }), w);
  const el = div()
    .when(Boolean(cell.mono), (e) => e.font_family(MONO_FONT).text_size(12))
    .when(cell.size != null, (e) => e.text_size(cell.size))
    .when(Boolean(cell.tone), (e) => e.text_color(t[cell.tone] ?? t.muted))
    .when(Boolean(cell.strong), (e) => e.font_semibold())
    .when(Boolean(cell.truncate), (e) => e.truncate())
    .child(cell.text ?? "");
  return sized(el, w);
}

/**
 * @param {{ key: string, selected: boolean, cells: any[] }} row
 * @param {{ label: string, w: number | null }[]} columns
 * @param {number} index
 * @param {(e: any, cx: any) => void} onClick
 */
export function tableRow(row, columns, index, onClick) {
  const t = theme();
  return h_flex()
    .id(`row-${row.key}`)
    .gap(12)
    .items_center()
    .px(12)
    .py(10)
    .min_h(28)
    .when(index > 0 && !row.selected, (el) => el.border_t(1).border_color(t.border))
    .when(row.selected, (el) => el.border(2).border_color(t.accent).bg(t.selected))
    .selected(row.selected)
    .cursor_pointer()
    .hover((s) => s.bg(t.hover))
    .on_click(onClick)
    .children(row.cells.map((c, i) => cellEl(c, columns[i]?.w ?? null)));
}
