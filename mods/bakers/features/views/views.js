// features/views: the views section of the sidebar (R2-3), one row per view with its
// count. Mine and Recently closed carry the API chip: the bakers API has no assignee and
// no closing date.
import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { theme } from "herdr";
import { chip } from "../../core/kit.js";
import { STATES } from "../../core/store.js";
import { cap, chooseView, currentView } from "../../core/views.js";

/** The rows of the sidebar section with their counts. @param {any} counts */
export function viewRows(counts) {
  const t = theme();
  const view = currentView();
  const row = (
    /** @type {string} */ key,
    /** @type {string} */ label,
    /** @type {number | null} */ count,
    o = {},
  ) => {
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
          .on_click(() => chooseView(key)),
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
  return [
    row("needs-me", "Needs me", counts.needsMe),
    row("mine", "Mine", null, { api: true, disabled: true }),
    row("open", "Open by state", counts.open),
    ...STATES.map((s) => row(`state:${s}`, cap(s), counts.byState[s] ?? 0, { sub: true })),
    row("closed", "Recently closed", null, { api: true, dim: true }),
  ];
}
