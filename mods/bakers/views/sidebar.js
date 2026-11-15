// The bakers section of the left sidebar (R2-3), below Herdr's Spaces and Agents:
// Tickets with the project picker, then the views with their counts. Mine and Recently
// closed carry the API chip: the bakers API has no assignee and no closing date.
import { div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { openOverlay, setShared, shared, theme } from "herdr";
import {
  currentProject,
  getStore,
  pickerAvailable,
  projectChoices,
  ready,
} from "../lib/context.js";
import { STATES } from "../lib/store.js";
import { ensureTicketsTab } from "../lib/tabs.js";
import { chip, heading, icons, UI_FONT } from "../lib/theme.js";

const cap = (/** @type {string} */ s) => s.charAt(0).toUpperCase() + s.slice(1);

export default class Sidebar {
  init(_props, cx) {
    cx.spawn(async (cx) => {
      await ready();
      cx.notify();
    });
  }

  render() {
    const t = theme();
    const store = getStore();
    const counts = store.counts();
    const view = shared("bakers.view") ?? "needs-me";
    const project = currentProject();
    const go = (/** @type {string} */ key) => () => {
      setShared("bakers.view", key);
      ensureTicketsTab();
    };
    const row = (key, label, count, o = {}) => {
      const on = view === key;
      return h_flex()
        .id(`view-${key}`)
        .justify_between()
        .items_center()
        .rounded(4)
        .when(Boolean(o.sub), (el) => el.pl(18).pr(6).py(2).text_color(t.muted))
        .when(!o.sub, (el) => el.px(6).py(4))
        .when(Boolean(o.dim) && !on, (el) => el.text_color(t.muted))
        .when(on, (el) => el.bg(t.selected).text_color(t.accent).font_semibold())
        .when(!o.disabled, (el) =>
          el
            .cursor_pointer()
            .hover((s) => s.bg(t.hover))
            .on_click(go(key)),
        )
        .child(
          h_flex()
            .gap(4)
            .items_center()
            .child(label)
            .when(Boolean(o.api), (el) => el.child(chip())),
        )
        .when(count != null, (el) =>
          el.child(
            div()
              .when(!on && !o.sub, (d) => d.text_color(t.muted))
              .child(String(count)),
          ),
        );
    };
    const canPick = pickerAvailable() && projectChoices().length > 1;
    const picker = h_flex()
      .id("project-picker")
      .ml_auto()
      .h(20)
      .px(6)
      .gap(4)
      .items_center()
      .rounded(4)
      .border(1)
      .border_color(t.border)
      .bg(t.surface)
      .text_size(11)
      .child(project?.name ?? "No project")
      .child(svg(icons.down).size(10))
      .when(!pickerAvailable(), (el) => el.child(chip()))
      .when(canPick, (el) =>
        el.cursor_pointer().on_click(() =>
          openOverlay({
            mod: "bakers",
            props: { view: "picker", kind: "project" },
            kind: "popup",
            width: 220,
          }),
        ),
      );
    return v_flex()
      .id("bakers-sidebar")
      .w(220)
      .px(10)
      .py(12)
      .font_family(UI_FONT)
      .text_size(12)
      .text_color(t.foreground)
      .child(
        v_flex()
          .p(8)
          .gap(2)
          .rounded(6)
          .border(1)
          .border_color(t.border)
          .bg(t.surface)
          .child(h_flex().gap(6).mb(4).items_center().child(heading("Tickets")).child(picker))
          .child(row("needs-me", "Needs me", counts.needsMe))
          .child(row("mine", "Mine", null, { api: true, disabled: true }))
          .child(row("open", "Open by state", counts.open))
          .children(
            STATES.map((s) => row(`state:${s}`, cap(s), counts.byState[s] ?? 0, { sub: true })),
          )
          .child(row("closed", "Recently closed", null, { api: true, dim: true })),
      );
  }
}
