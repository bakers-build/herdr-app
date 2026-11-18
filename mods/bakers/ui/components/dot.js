// ui/components/dot: a round 8 px status dot in a theme tone; ring draws the hollow one.
import { div } from "gpui-kit";
import { tokens } from "../theme.js";

/** @param {string} tone a theme token (blocked, working, muted, ...) @param {boolean} [ring] */
export function dot(tone, ring = false) {
  const t = tokens();
  const color = t[tone] ?? t.muted;
  return ring
    ? div().size(8).flex_none().rounded(4).border(1).border_color(color)
    : div().size(8).flex_none().rounded(4).bg(color);
}
