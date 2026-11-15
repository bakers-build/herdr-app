// The run's terminal on this computer and the words for where an agent runs.
// The herdr-core conductor addon labels run terminals bakers.ticket=<identifier> (and
// bakers.run); labels match case-sensitively, by identifier or UUID.
import { terminals } from "herdr";

/** @param {string} id identifier @param {string} [uuid] */
export function runTerminal(id, uuid) {
  return terminals().find((t) => {
    const v = t?.labels?.["bakers.ticket"];
    return v != null && (v === id || (uuid && v === uuid));
  });
}

/** "this computer" for a bare address, else the machine before the slash. @param {any} terminal */
export function machineOf(terminal) {
  if (!terminal?.address) return null;
  const i = String(terminal.address).indexOf("/");
  return i < 0 ? "this computer" : String(terminal.address).slice(0, i);
}

export const NO_TERMINAL = "The run's terminal is not on this computer";
