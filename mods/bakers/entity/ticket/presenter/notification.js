// presenter/notification: the toast for a ticket that newly asks a question. A click runs
// bakers.open, which opens its tab; a toast is read, never focused.
import { firstLine } from "../../../core/format.js";
import { question } from "../rules.js";

/** @param {string} id @param {any[]} comments */
export function notification(id, comments) {
  const text = firstLine(question(comments)?.body ?? "");
  return {
    title: `${id} asks a question`,
    body: text.length > 120 ? `${text.slice(0, 117)}...` : text,
    level: /** @type {"warning"} */ ("warning"),
    action: { name: "bakers.open", args: { ticket: id } },
  };
}
