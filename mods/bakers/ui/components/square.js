// ui/components/square: the 36 px bordered button of the rail.
import { div } from "gpui-kit";
import { tokens } from "../theme.js";

/** @returns {any} a rail button, ready for an id, a border colour and a label */
export function square() {
  const t = tokens();
  return div()
    .size(36)
    .flex()
    .items_center()
    .justify_center()
    .rounded(6)
    .border(1)
    .bg(t.surface)
    .cursor_pointer();
}
