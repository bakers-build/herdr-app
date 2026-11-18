// ticket/tabs: the ticket vocabulary over core/tabs, for the kind "ticket" (registered in
// ticket/register.js).
import { closeWhere, focusedKey, keyedTabs, open, openHome, pin, syncNames } from "../core/tabs.js";

const KIND = "ticket";

/**
 * Opens a ticket as the preview tab, or pinned; an open ticket is only selected.
 * The name comes from the ticket presenter (ticket/presenter/tab.js).
 * @param {string} id @param {string} name @param {{ pin?: boolean }} [opts]
 */
export function openTicket(id, name, opts = {}) {
  open(KIND, id, name, opts);
}

/** Pins the preview tab when it shows this ticket. @param {string} id */
export function pinTicket(id) {
  pin(KIND, id);
}

export function ensureTicketsTab() {
  openHome(KIND);
}

/** The identifier of the focused ticket tab, or null. */
export function focusedTicket() {
  return focusedKey(KIND);
}

/** @returns {string[]} */
export function openTicketIds() {
  return keyedTabs(KIND).map((o) => o.key);
}

/** @param {(id: string) => string | null} nameOf the presenter's tab name, null when unknown */
export function syncTicketNames(nameOf) {
  syncNames(KIND, nameOf);
}

export function closeFinished() {
  closeWhere(KIND, (t) => t.rest === "closed");
}

export function closeAll() {
  closeWhere(KIND, () => true);
}
