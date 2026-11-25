// ticket/commands: every write to a ticket, and the only place that sends one.
// Forms (ticket/form) chain these as steps; menus reach the at-once ones through
// the action registry (ticket/register.js).
import { call } from "../core/cli.js";
import { refresh } from "./store.js";

/** A new comment of a type (comments are create-only). @param {string} ticket @param {string} type @param {string} body */
export const publish = (ticket, type, body) =>
  call("bakers_comment_publish", { ticket, type, body });
/** @param {string} ticket @param {string} body */
export const comment = (ticket, body) => publish(ticket, "comment", body);
/** Replaces the description whole (no revision check in the API). @param {string} ticket @param {string} description */
export const describe = (ticket, description) =>
  call("bakers_ticket_update", { ticket, description });
/** @param {string} ticket @param {{ title: string, description: string }} fields */
export const edit = (ticket, fields) => call("bakers_ticket_update", { ticket, ...fields });
/** @param {string} ticket @param {string} state */
export const transition = (ticket, state) => call("bakers_ticket_transition", { ticket, state });
/** @param {string} ticket @param {boolean} frozen */
export const setFrozen = (ticket, frozen) => call("bakers_ticket_update", { ticket, frozen });
/** @param {string} ticket @param {string} reason */
export const cancelRun = (ticket, reason) => call("bakers_run_cancel", { ticket, reason });
/** @param {string} ticket @param {string} conductor */
export const setConductor = (ticket, conductor) =>
  call("bakers_ticket_update", { ticket, conductor });
/** @param {Record<string, unknown>} fields */
export const create = (fields) => call("bakers_ticket_create", fields);

/** Type or Recipe, saved at once. @param {string} ticket @param {{ type?: string, recipe?: string }} fields */
export async function classify(ticket, fields) {
  await call("bakers_ticket_classify", { ticket, ...fields });
  await refresh();
}

/** Labels added or removed at once. @param {string} ticket @param {{ labels_add?: string[], labels_remove?: string[] }} fields */
export async function labels(ticket, fields) {
  await call("bakers_ticket_update", { ticket, ...fields });
  await refresh();
}
