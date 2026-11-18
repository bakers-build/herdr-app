// ui/components/nav: a list of navigation rows with counts, optional chips, sub rows indented
// 18 px, the selected row on the selected color in the accent (the sidebar's views).
import { div } from "gpui-kit";
import { h_flex } from "gpui-base";

import { chip } from "./chip.js";
import { tokens } from "../theme.js";

/**
 * @param {{ key: string, label: string, count: number | null, selected: boolean, sub?: boolean, dim?: boolean, api?: boolean, disabled?: boolean }[]} rows
 * @param {(key: string) => void} onChoose
 */
export function navRows(rows, onChoose) {
  const t = tokens();
  return rows.map((r) =>
    h_flex()
      .id(`view-${r.key}`)
      .justify_between()
      .items_center()
      .rounded(4)
      .when(Boolean(r.sub), (el) => el.pl(18).pr(6).py(2).text_color(t.muted))
      .when(!r.sub, (el) => el.px(6).py(4))
      .when(Boolean(r.dim) && !r.selected, (el) => el.text_color(t.muted))
      .when(r.selected, (el) => el.bg(t.selected).text_color(t.accent).font_semibold())
      .when(!r.disabled, (el) =>
        el
          .cursor_pointer()
          .hover((s) => s.bg(t.hover))
          .on_click(() => onChoose(r.key)),
      )
      .child(
        h_flex()
          .gap(4)
          .items_center()
          .child(r.label)
          .when(Boolean(r.api), (el) => el.child(chip())),
      )
      .when(r.count != null, (el) =>
        el.child(
          div()
            .when(!r.selected && !r.sub, (d) => d.text_color(t.muted))
            .child(String(r.count)),
        ),
      ),
  );
}
