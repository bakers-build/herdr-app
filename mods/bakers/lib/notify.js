// The question toast: Herdr's notification, posted once when a ticket newly asks a
// question. A click runs bakers.open (the status view opens its tab); a toast is read,
// never focused. bakers.toast keeps the last identifier for a bare "open" command.
import { notify, setShared } from "herdr";
import { firstLine } from "./format.js";

/** @param {any} store @param {string} id */
function question(store, id) {
  const comments = store.cached?.(id)?.comments ?? [];
  const q =
    [...comments].reverse().find((c) => c.type === "question") ?? comments[comments.length - 1];
  const text = firstLine(q?.body ?? "");
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

/**
 * Posts one toast per ticket newly in "Asked a question" and returns the identifiers
 * now asking, to pass back next time. The first call only records (no toast on start).
 * @param {string[] | null} prev
 * @param {any} store
 * @returns {string[]}
 */
export function watchNeeds(prev, store) {
  const asking = store
    .view("needs-me")
    .filter((r) => r.why === "Asked a question")
    .map((r) => r.id);
  if (prev === null) return asking;
  for (const id of asking) {
    if (prev.includes(id)) continue;
    setShared("bakers.toast", id);
    notify({
      title: `${id} asks a question`,
      body: question(store, id),
      level: "warning",
      action: { name: "bakers.open", args: { ticket: id } },
    });
  }
  return asking;
}
