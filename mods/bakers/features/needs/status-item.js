// features/needs: the bakers item in the status bar (R2-4, R2-3): project, need-you count
// and last update, or "bakers offline"; a click opens the Tickets tab.
import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { theme } from "herdr";
import { age } from "../../core/format.js";
import { UI_FONT } from "../../core/kit.js";
import { currentProject, error, getStore } from "../../core/session.js";
import { ensureTicketsTab } from "../../core/tabs.js";

/** @param {(width: number) => void} onWidth the item's width (for centring Go to ticket) */
export function statusItem(onWidth) {
  const t = theme();
  const store = getStore();
  const err = error();
  const needs = store.needs();
  const offline = Boolean(err?.offline);
  const project = currentProject();
  return h_flex()
    .id("bakers-status")
    .size_full()
    .px(12)
    .gap(10)
    .items_center()
    .justify_end()
    .font_family(UI_FONT)
    .text_size(11)
    .text_color(t.muted)
    .bg(t.chrome)
    .border_t(1)
    .border_color(t.border)
    .cursor_pointer()
    .on_size_change((size, cx) => {
      onWidth(size.width);
      cx.notify();
    })
    .on_click(() => ensureTicketsTab())
    .when(offline, (el) => el.child(div().child("bakers offline")))
    .when(!offline && Boolean(project), (el) =>
      el
        .child(div().child(project.name))
        .when(needs.count > 0, (e) =>
          e.child(div().text_color(t.blocked).font_semibold().child(`${needs.count} need you`)),
        )
        .when(Boolean(store.updated), (e) =>
          e.child(div().child(`updated ${age(Date.now() - store.updated)} ago`)),
        ),
    )
    .when(!offline && !project && Boolean(err), (el) =>
      el.child(div().truncate().child(err.message)),
    );
}
