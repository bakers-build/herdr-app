// ticket/view/run: the run area's header (the layout block "run-header" over the run's terminal
// block): the run's number, its program, address and machine, and Hide, which hides the column
// and leaves the run alone. It only reads while it renders.
import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { layout, terminals } from "herdr";
import { findNode, machineOf } from "../../core/herdr.js";
import { tokens, UI_FONT } from "../../ui/theme.js";
import { button } from "../../ui/components/button.js";
import { mono } from "../../ui/components/text.js";
import { hideRun, TERMINAL } from "../terminal.js";

export default class RunHeader {
  render() {
    const t = tokens();
    /** @type {string | undefined} */
    const address = findNode(layout(), TERMINAL)?.content?.terminal;
    /** @type {any} the terminal, or just its address while terminals() catches up */
    const term = address ? (terminals().find((x) => x.address === address) ?? { address }) : null;
    const n = term?.labels?.["bakers.run"];
    const program = term?.program?.name;
    return h_flex()
      .id("run-header")
      .size_full()
      .h(32)
      .min_w(0)
      .px(10)
      .gap(8)
      .items_center()
      .font_family(UI_FONT)
      .text_size(12)
      .text_color(t.foreground)
      .bg(t.chrome)
      .border_b(1)
      .border_color(t.border)
      .when(Boolean(term), (el) =>
        el
          .child(
            div()
              .flex_none()
              .font_semibold()
              .child(n ? `Run ${n}` : "Run"),
          )
          .when(Boolean(program), (el) =>
            el.child(
              div()
                .truncate()
                .child(program ?? ""),
            ),
          )
          .child(
            mono(address ?? "")
              .flex_none()
              .text_color(t.muted),
          )
          .child(
            div()
              .flex_none()
              .text_color(t.muted)
              .child(machineOf(term) ?? ""),
          ),
      )
      .child(div().flex_1())
      .child(button("run-hide", "Hide", () => hideRun(), { h: 24, size: 11 }));
  }
}
