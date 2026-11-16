// form/comment: the composer of a ticket tab (R2-3). Comment mode posts a comment. Answer
// mode, while the agent asked a question, posts the answer, then (checked) unfreezes and
// removes the label Question, then toasts. A failure after the comment says so.
import * as actions from "../commands.js";

/** @param {string} id @param {"comment" | "answer"} mode @param {string} [text] the text so far, kept across modes */
export function commentForm(id, mode, text = "") {
  const answering = mode === "answer";
  return {
    kind: "inline",
    label: answering ? "Answer to the agent's question" : null,
    fields: [
      { name: "body", type: "textarea", rows: 3, placeholder: "Comment", value: text },
      ...(answering
        ? [
            {
              name: "resume",
              type: "checkbox",
              label: "Unfreeze and remove the label Question",
              value: true,
            },
          ]
        : []),
    ],
    hint: answering ? "cmd-Enter sends, Esc back to a plain comment" : "cmd-Enter sends",
    buttons: answering
      ? [
          { id: "just-comment", label: "Just comment", variant: "comment" },
          { id: "send-answer", label: "Send answer", variant: "answer", primary: true },
        ]
      : [{ id: "send-comment", label: "Comment", variant: "comment", primary: true }],
    defaultVariant: answering ? "answer" : "comment",
    validate: (/** @type {any} */ v) =>
      String(v.body ?? "").trim() ? null : { body: "Write something first." },
    steps: [
      {
        run: (/** @type {any} */ v) => actions.comment(id, String(v.body).trim()),
        done: "Comment posted",
        failed: "Not sent",
      },
      {
        when: (/** @type {any} */ v) => v.variant === "answer" && v.resume,
        run: () => actions.resume(id),
        failed: "unfreezing failed",
      },
    ],
    success: (/** @type {any} */ v) =>
      v.variant === "answer" ? `Answered ${id}, the run continues` : null,
  };
}
