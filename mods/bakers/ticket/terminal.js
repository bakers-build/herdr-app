// ticket/terminal: a ticket's run terminal. The herdr-core conductor addon labels run terminals
// bakers.ticket=<identifier> (and bakers.run); labels match case-sensitively, by identifier or UUID.
import { terminals } from "herdr";

/** @param {string} id identifier @param {string} [uuid] */
export function runTerminal(id, uuid) {
  return terminals().find((t) => {
    const v = t?.labels?.["bakers.ticket"];
    return v != null && (v === id || (uuid && v === uuid));
  });
}

export const NO_TERMINAL = "The run's terminal is not on this computer";
