// ui/components/card: one card of a list, four rows: id (mono), state pill, type, age at
// the right / title, at most two lines / why, only when it needs you / label pills, assignee,
// agent status. The selected card has the accent outline on the selected color.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";

import { MONO_FONT, tokens } from "../theme.js";
import { pill } from "./pill.js";
import { statusLine } from "./status-line.js";

const TITLE_SIZE = 13;
const TITLE_LINE = 18;

/**
 * @param {{ key: string, selected: boolean, id: string, state: string, type: string, age: string, title: string, why: string | null, labels: string[], assignee: string, agent: { tone: string, ring: boolean, text: string } }} vm
 * @param {(e: any, cx: any) => void} onClick
 */
export function ticketCard(vm, onClick) {
  const t = tokens();
  return (
    v_flex()
      .id(`row-${vm.key}`)
      .gap(6)
      .px(12)
      .py(10)
      .rounded(6)
      .border(vm.selected ? 2 : 1)
      .border_color(vm.selected ? t.accent : t.border)
      .when(vm.selected, (el) => el.bg(t.selected))
      .selected(vm.selected)
      .cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_click(onClick)
      .child(
        h_flex()
          .gap(8)
          .items_center()
          .child(div().font_family(MONO_FONT).text_size(12).child(vm.id))
          .child(pill(vm.state, { size: 11 }))
          .child(div().text_size(12).text_color(t.muted).child(vm.type))
          .child(div().flex_1())
          .child(div().text_size(12).text_color(t.muted).child(vm.age)),
      )
      // The elements have no line_clamp: two lines is a fixed line height with a height cap.
      .child(
        div()
          .text_size(TITLE_SIZE)
          .line_height(TITLE_LINE)
          .max_h(TITLE_LINE * 2)
          .overflow_hidden()
          .font_semibold()
          .child(vm.title),
      )
      .when(Boolean(vm.why), (el) =>
        el.child(
          div()
            .text_size(12)
            .font_semibold()
            .text_color(t.blocked)
            .child(vm.why ?? ""),
        ),
      )
      .child(
        h_flex()
          .gap(8)
          .items_center()
          .flex_wrap()
          .children(vm.labels.map((l) => pill(l, { size: 11, px: 6 })))
          .when(Boolean(vm.assignee), (el) =>
            el.child(div().text_size(12).text_color(t.muted).child(vm.assignee)),
          )
          .child(statusLine(null, { ...vm.agent, size: 12 })),
      )
  );
}
