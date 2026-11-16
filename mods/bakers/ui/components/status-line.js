// components/status-line: a dot and a line of text in a tone, with an optional muted rest.
// Used for the agent line in the list, the ticket header and the panel.
import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { theme } from "herdr";
import { dot } from "./dot.js";

/** @param {string | null} id @param {{ tone: string, ring?: boolean, text: string, rest?: string | null, size?: number, colored?: boolean }} vm */
export function statusLine(id, vm) {
  const t = theme();
  const color = vm.tone === "blocked" ? t.blocked : vm.colored ? t.foreground : t.muted;
  return h_flex()
    .when(Boolean(id), (el) => el.id(id))
    .gap(6)
    .items_center()
    .flex_wrap()
    .when(vm.size != null, (el) => el.text_size(vm.size))
    .text_color(color)
    .child(dot(vm.tone, Boolean(vm.ring)))
    .child(div().truncate().child(vm.text))
    .when(Boolean(vm.rest), (el) => el.child(div().text_color(t.muted).child(vm.rest)));
}
