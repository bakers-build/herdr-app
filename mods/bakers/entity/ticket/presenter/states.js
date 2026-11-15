// presenter/states: the state menu of a ticket: every state (the API cannot say which ones
// the workflow allows), the current one marked; choosing opens the change-state dialog.
import { ALL_STATES } from "../rules.js";
import { cap } from "./views.js";

/** @param {string} id @param {string} current */
export function stateItems(id, current) {
  return ALL_STATES.map((s) => ({
    key: s,
    label: s === current ? cap(s) : `${cap(s)}...`,
    current: s === current,
    hint: s === current ? "current" : undefined,
    disabled: s === current,
    action: ["form.open", "state", { ticket: id, from: current, to: s }],
  }));
}

export const STATE_MENU_FOOTER = "All states shown; the server refuses what the workflow forbids.";
