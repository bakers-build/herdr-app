// ticket/tabs: the ticket vocabulary over core/tabs, for the kind "ticket" (registered in
// ticket/register.js).
import { focused, shared } from "herdr";
import {
  closeWhere,
  focusedKey,
  homeTab,
  keyedTabs,
  open,
  openHome,
  pin,
  syncNames,
} from "../core/tabs.js";

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

/** The ticket the window is on: the focused ticket tab (also while its run block has the focus),
 *  on the Tickets tab its selected row, else null. @returns {string | null} */
export function frontTicket() {
  const id = focusedTicket();
  if (id) return id;
  const home = homeTab(KIND);
  if (!home || home.id !== focused()?.tab) return null;
  return /** @type {string | null} */ (shared("bakers.selected")) ?? null;
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
