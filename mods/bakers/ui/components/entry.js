// ui/components/entry: one entry of a feed: a muted meta line (first part strong), then the
// body; foldable entries show their first line until opened; marked ones carry an accent
// bar (the comments of a ticket).
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";

import { markdown } from "./markdown.js";
import { tokens } from "../theme.js";

/**
 * @param {{ key: string, meta: string[], body: string, firstLine: string, foldable: boolean, marked: boolean }} vm
 * @param {boolean} open
 * @param {(cx: any) => void} onToggle
 */
export function entry(vm, open, onToggle) {
  const t = tokens();
  const [head, ...rest] = vm.meta;
  return v_flex()
    .id(`comment-${vm.key}`)
    .gap(3)
    .when(vm.marked, (el) => el.border_l_2().border_color(t.accent).pl(8))
    .when(vm.foldable, (el) => el.cursor_pointer().on_click((_e, cx) => onToggle(cx)))
    .child(
      h_flex()
        .gap(6)
        .text_size(11)
        .text_color(t.muted)
        .child(
          div()
            .font_semibold()
            .text_color(t.foreground)
            .child(head ?? ""),
        )
        .children(rest.map((m) => div().child(m))),
    )
    .child(
      vm.foldable && !open
        ? div().truncate().child(vm.firstLine)
        : vm.foldable
          ? markdown(`c-${vm.key}`, vm.body)
          : div().child(vm.body ?? ""),
    );
}
