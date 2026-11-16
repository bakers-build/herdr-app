// ui/components/state: what a view shows when it has no data to draw: loading, a failure from
// core/errors (offline or failed with Retry), or an empty hint. A view never goes blank.
import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { theme } from "herdr";
import { button } from "./button.js";

/** @param {string} text */
export function loading(text) {
  const t = theme();
  return div().p(12).text_color(t.muted).child(text);
}

/** @param {{ kind: string, message: string, retry: boolean }} failure @param {((e: any, cx: any) => void) | null} [onRetry] */
export function failureView(failure, onRetry) {
  const t = theme();
  return h_flex()
    .id("failure")
    .gap(8)
    .items_center()
    .px(12)
    .py(16)
    .text_size(12)
    .text_color(t.blocked)
    .child(div().child(failure.message))
    .when(Boolean(failure.retry && onRetry), (el) =>
      el.child(button("retry", "Retry", onRetry, { h: 24, size: 12 })),
    );
}
