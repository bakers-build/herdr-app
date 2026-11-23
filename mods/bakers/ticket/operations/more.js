// ticket/operations/more: the "..." menu of a ticket: Freeze... or Unfreeze..., Cancel run...
// (only while a run is active), Copy identifier, taken from the ticket's actions.
import { ticketActions } from "./actions.js";

const MORE = ["freeze", "cancel", "copy"];

/** @param {{ ticket: any, runs: any[] }} detail */
export function moreItems(detail) {
  return ticketActions(detail, null)
    .filter((a) => MORE.includes(a.key))
    .map((a) => ({
      label: a.label,
      action: a.action,
      disabled: Boolean(a.reason) || undefined,
      separator: a.key === "copy" || undefined,
    }));
}
