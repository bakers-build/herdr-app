// features/document: the reading parts of a ticket tab (R2-3): the agent line, the 22 px
// title, the Markdown description with "Click or E to edit.", and the comments, newest
// last, with plan, spec and summary folded to their first line until clicked.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme } from "herdr";
import { machineOf } from "../../core/agent.js";
import { age, firstLine, toMs } from "../../core/format.js";
import { dot, heading } from "../../core/kit.js";
import { renderMarkdown } from "./markdown.js";

const FOLDED = ["plan", "spec", "summary"];

/** "Claude Code needs you on studio-mac, 35m". @param {any} detail @param {any} terminal */
export function agentText(detail, terminal) {
  const where = machineOf(terminal);
  const run = detail.runs.find((/** @type {any} */ r) => !r.closed);
  const since = detail.why === "Asked a question" ? detail.since : toMs(run?.started_at);
  const parts = [detail.agent.text + (where ? ` on ${where}` : "")];
  if (since != null) parts.push(age(Date.now() - since));
  return parts.join(", ");
}

/** @param {any} detail @param {any} terminal */
export function agentLine(detail, terminal) {
  const t = theme();
  const tone = detail.agent.tone;
  return h_flex()
    .id("agent-line")
    .gap(6)
    .items_center()
    .text_size(12)
    .text_color(tone === "blocked" ? t.blocked : t.muted)
    .child(
      dot(
        tone === "blocked" ? "blocked" : tone === "working" ? "working" : "muted",
        !detail.agent.run,
      ),
    )
    .child(agentText(detail, terminal));
}

/** @param {any} ticket @param {(cx: any) => void} onEdit */
export function title(ticket, onEdit) {
  return div()
    .id("title")
    .text_size(22)
    .font_semibold()
    .line_height(27.5)
    .on_click((_e, cx) => onEdit(cx))
    .child(ticket.title ?? "");
}

/** @param {any} ticket @param {(cx: any) => void} onEdit */
export function description(ticket, onEdit) {
  const t = theme();
  return v_flex()
    .id("description")
    .gap(8)
    .child(heading("Description"))
    .child(
      div()
        .id("description-body")
        .cursor_text()
        .on_click((_e, cx) => onEdit(cx))
        .child(renderMarkdown(`desc-${ticket.identifier}`, ticket.description ?? "")),
    )
    .child(div().text_size(11).text_color(t.muted).child("Click or E to edit."));
}

/** Which folded comments are open, per ticket tab. */
export class Comments {
  constructor() {
    this.open = new Set();
  }

  /** @param {any} detail */
  render(detail) {
    const t = theme();
    const list = detail.comments ?? [];
    const asking = detail.why === "Asked a question";
    const lastQuestion = [...list].reverse().find((c) => c.type === "question");
    return v_flex()
      .id("comments")
      .gap(10)
      .child(heading(`Comments ${list.length}, newest last`))
      .children(
        list.map((/** @type {any} */ c, /** @type {number} */ i) => {
          const key = c.id ?? String(i);
          const foldable = FOLDED.includes(c.type);
          const folded = foldable && !this.open.has(key);
          return v_flex()
            .id(`comment-${key}`)
            .gap(3)
            .when(asking && c === lastQuestion, (el) =>
              el.border_l_2().border_color(t.accent).pl(8),
            )
            .when(foldable, (el) =>
              el.cursor_pointer().on_click((_e, cx) => {
                if (this.open.has(key)) this.open.delete(key);
                else this.open.add(key);
                cx.notify();
              }),
            )
            .child(
              h_flex()
                .gap(6)
                .text_size(11)
                .text_color(t.muted)
                .child(
                  div()
                    .font_semibold()
                    .text_color(t.foreground)
                    .child(c.author ?? ""),
                )
                .child(div().child(c.type ?? "comment"))
                .child(div().child(age(Date.now() - (toMs(c.created) ?? Date.now())))),
            )
            .child(
              folded
                ? div().truncate().child(firstLine(c.body))
                : foldable
                  ? renderMarkdown(`c-${key}`, c.body)
                  : div().child(c.body ?? ""),
            );
        }),
      );
  }
}
