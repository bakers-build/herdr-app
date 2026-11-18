// ticket/needs: the toast for a ticket that newly asks a question.
import { notify } from "herdr";
import { notification } from "./presenter/notification.js";

/**
 * Posts one toast per ticket newly asking a question and returns who asks now. The first
 * call only records, so starting Herdr posts nothing.
 * @param {string[] | null} prev @param {any} store
 */
export function watchNeeds(prev, store) {
  const asking = store
    .records()
    .filter((/** @type {any} */ r) => r.why === "Asked a question")
    .map((/** @type {any} */ r) => r.id);
  if (prev === null) return asking;
  for (const id of asking) {
    if (prev.includes(id)) continue;
    notify(notification(id, store.cached?.(id)?.comments ?? []));
  }
  return asking;
}
