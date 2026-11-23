// ticket/operations/actions: a ticket's actions, the one list the "..." menu, the ticket view's
// keys (G, R) and the actions palette read. A reason says why an action cannot run now.
import { activeRun } from "../rules.js";

/**
 * @typedef {{ key: "agent" | "state" | "move" | "freeze" | "cancel" | "copy", label: string,
 *   keys?: string, reason?: string | null, step?: "state", action?: any[] }} TicketAction
 */

/**
 * @param {{ ticket: any, runs: any[] }} detail
 * @param {string | null} showReason why Show agent cannot run (runReason), null when it can
 * @returns {TicketAction[]}
 */
export function ticketActions(detail, showReason) {
  const tk = detail.ticket;
  const id = tk.identifier;
  return [
    {
      key: "agent",
      label: "Show agent",
      keys: "G",
      reason: showReason,
      action: ["ticket.showAgent", id],
    },
    { key: "state", label: "Change state...", step: "state" },
    { key: "move", label: "Move to...", keys: "R", action: ["ticket.move", id] },
    {
      key: "freeze",
      label: tk.frozen ? "Unfreeze..." : "Freeze...",
      action: ["form.open", tk.frozen ? "unfreeze" : "freeze", { ticket: id }],
    },
    {
      key: "cancel",
      label: "Cancel run...",
      reason: activeRun(detail.runs) ? null : "No active run",
      action: ["form.open", "cancel", { ticket: id }],
    },
    { key: "copy", label: "Copy identifier", action: ["copy", id] },
  ];
}
