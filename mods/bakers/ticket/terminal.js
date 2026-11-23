// ticket/terminal: a ticket's run terminal. The herdr-core conductor addon labels run terminals
// bakers.ticket=<identifier> (and bakers.run); labels match case-sensitively, by identifier or UUID.
// Only a live terminal counts, on this computer (t12) or on a machine Herdr is connected to (vps/t7).
import { machines, terminals } from "herdr";
import { activeRun } from "./rules.js";

/** @param {string} id identifier @param {string} [uuid] */
export function runTerminal(id, uuid) {
  return terminals().find((t) => {
    const v = t?.labels?.["bakers.ticket"];
    return t.state === "live" && v != null && (v === id || (uuid && v === uuid));
  });
}

export const NO_TERMINAL = "No live run terminal";

/**
 * Why "Show agent" cannot show the run, or null when it can.
 * @param {{ runs: any[], claim_machine: string | null }} ticket @param {any} terminal
 */
export function runReason(ticket, terminal) {
  if (terminal) return null;
  const m = ticket.claim_machine;
  if (activeRun(ticket.runs) && m && !machines().some((x) => x.name === m))
    return `The run is on ${m}, which Herdr is not connected to`;
  return NO_TERMINAL;
}
