// features/needs: the Needs-you card of a ticket tab (R2-3), only when the ticket needs
// you: why and since when, what it is about, the actions and "A acts on this card".
// The actions belong to other slices, so the screen passes them in.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme } from "herdr";
import { age, firstLine } from "../../core/format.js";

/** The latest question of the agent. @param {any[]} comments */
export function question(comments) {
  const list = comments ?? [];
  return [...list].reverse().find((c) => c.type === "question") ?? list[list.length - 1] ?? null;
}

/**
 * @param {any} detail the store's ticket detail
 * @param {{ question: any[], plan: any[], review?: any[] }} actions buttons per reason
 */
export function needsCard(detail, actions) {
  const t = theme();
  if (!detail?.why) return null;
  const since = detail.since == null ? "" : `, ${age(Date.now() - detail.since)} ago`;
  let body = "The branch waits for a review.";
  let buttons = actions.review ?? [];
  if (detail.why === "Asked a question") {
    body = question(detail.comments)?.body ?? "";
    buttons = actions.question;
  } else if (detail.why === "Plan ready for approval") {
    const plan = [...(detail.comments ?? [])].reverse().find((c) => c.type === "plan");
    body = firstLine(plan?.body ?? "");
    buttons = actions.plan;
  }
  return v_flex()
    .id("needs-card")
    .gap(8)
    .px(14)
    .py(12)
    .rounded(8)
    .border(1)
    .border_color(t.accent)
    .child(div().text_size(11).font_semibold().text_color(t.accent).child("NEEDS YOU"))
    .child(div().font_semibold().child(`${detail.why}${since}`))
    .child(div().text_size(13).child(body))
    .child(
      h_flex()
        .gap(8)
        .flex_wrap()
        .items_center()
        .children(buttons)
        .child(div().text_size(11).text_color(t.muted).child("A acts on this card")),
    );
}
