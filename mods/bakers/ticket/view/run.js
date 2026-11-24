// ticket/view/run: the run area's header (the layout block "run-header" over the run's terminal
// block): the tab bar (the agent's run, then the ticket's shells, each shell with a close), the
// address and machine of the shown tab, Execute (a shell beside the run) and Hide, which hides the
// column and leaves the run alone. A click calls herdr, then syncs the layout. Close ends a shell,
// never the run. It only reads while it renders.
import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { layout, terminals } from "herdr";
import { findNode, machineOf } from "../../core/herdr.js";
import { tokens, UI_FONT } from "../../ui/theme.js";
import { button } from "../../ui/components/button.js";
import { mono } from "../../ui/components/text.js";
import { closeShell, selectTab, shells, shownShell, startShell, tabKey } from "../exec.js";
import { selectedTicket } from "../tabs.js";
import { hideRun, runTerminal, syncRun, TERMINAL } from "../terminal.js";

/** A tab: the active one is highlighted; a shell's tab carries its close.
 *  @param {string} id element id @param {string} label @param {boolean} active
 *  @param {() => void} onClick @param {{ id: string, onClose: () => void }} [close] */
function tab(id, label, active, onClick, close) {
  const t = tokens();
  const head = button(id, label, onClick, { h: 24, size: 11 });
  const el = active ? head.bg(t.selected).font_semibold() : head;
  if (!close) return el;
  return h_flex()
    .flex_none()
    .gap(2)
    .items_center()
    .child(el)
    .child(button(close.id, "×", close.onClose, { h: 24, size: 11, px: 6 }));
}

export default class RunHeader {
  render() {
    const t = tokens();
    /** @type {string | undefined} */
    const address = findNode(layout(), TERMINAL)?.content?.terminal;
    /** @type {any} the terminal, or just its address while terminals() catches up */
    const term = address ? (terminals().find((x) => x.address === address) ?? { address }) : null;
    const n = term?.labels?.["bakers.run"];
    const id = selectedTicket();
    const mine = id && term ? shells(id) : [];
    const shown = id && term ? shownShell(id) : null;
    const shownKey = shown ? tabKey(shown) : null;
    const showing = shown ?? term;
    const run = id ? runTerminal(id) : undefined;
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
            tab("run-tab-agent", n ? `Run ${n}` : "Run", !shown, () => {
              selectTab(/** @type {string} */ (id), null);
              syncRun();
            }),
          )
          .children(
            mine.map((shell, i) => {
              const key = tabKey(shell);
              return tab(
                `run-tab-${key}`,
                `Shell ${i + 1}`,
                shownKey === key,
                () => {
                  selectTab(/** @type {string} */ (id), key);
                  syncRun();
                },
                {
                  id: `run-close-${key}`,
                  onClose: () => {
                    closeShell(/** @type {string} */ (id), shell);
                    syncRun();
                  },
                },
              );
            }),
          ),
      )
      .child(div().flex_1())
      .when(Boolean(term), (el) =>
        el
          .child(
            mono(showing?.address ?? "")
              .flex_none()
              .text_color(t.muted),
          )
          .child(
            div()
              .flex_none()
              .text_color(t.muted)
              .child(machineOf(showing) ?? ""),
          ),
      )
      .when(Boolean(id && run?.cwd), (el) =>
        el.child(
          button(
            "run-execute",
            "Execute",
            () => {
              void startShell(/** @type {string} */ (id), run).then(() => syncRun());
            },
            { h: 24, size: 11 },
          ),
        ),
      )
      .child(button("run-hide", "Hide", () => hideRun(), { h: 24, size: 11 }));
  }
}
