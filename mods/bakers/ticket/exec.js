// ticket/exec: a ticket's shells, started with the Execute button through herdr-core's `hc run`.
// A shell is a live terminal labelled bakers.exec=<identifier> and bakers.opened=<ms since epoch>
// (never a herdr.* label). The run area's tab bar shows the agent's run or one shell; which one is
// shared("bakers.runTab") = { [identifier]: tab key of the shown shell }, absent = the agent's tab.
import { hc, notify, run, setShared, shared, terminals } from "herdr";

export const EXEC = "bakers.exec";
export const OPENED = "bakers.opened";
export const TAB = "bakers.runTab";

/** The ticket's live shells, oldest first; one without a numeric opened label comes last.
 *  @param {string} id identifier */
export function shells(id) {
  const at = (/** @type {any} */ s) => {
    const n = Number(s.labels?.[OPENED]);
    return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
  };
  return terminals()
    .filter((t) => t?.state === "live" && t.labels?.[EXEC] === id)
    .sort((a, b) => (at(a) === at(b) ? 0 : at(a) < at(b) ? -1 : 1));
}

/** What identifies a shell as a tab: its opened label, else its address. @param {any} shell */
export function tabKey(shell) {
  const v = shell?.labels?.[OPENED];
  return typeof v === "string" && v !== "" ? v : shell.address;
}

/** The selected tab map, copied. @returns {Record<string, string>} */
function tabs() {
  return { .../** @type {Record<string, string> | undefined} */ (shared(TAB)) };
}

/** The shell the ticket's tab shows, or null for the agent's tab (or a shell that is gone).
 *  @param {string} id */
export function shownShell(id) {
  const key = tabs()[id];
  return key == null ? null : (shells(id).find((s) => tabKey(s) === key) ?? null);
}

/** @param {string} id @param {string | null} key a shell's tab key; null selects the agent's tab */
export function selectTab(id, key) {
  const next = tabs();
  if (key == null) delete next[id];
  else next[id] = key;
  setShared(TAB, next);
}

/** The hc arguments starting a shell in the run's directory, on the run's machine; null without
 *  a directory. @param {string} id @param {any} run the ticket's run terminal @param {number} now */
export function shellArgs(id, run, now) {
  if (!run?.cwd) return null;
  const address = String(run.address ?? "");
  const machine = address.includes("/") ? address.slice(0, address.indexOf("/")) : null;
  return [
    "run",
    "--json",
    "--bg",
    "--no-parent",
    "--cwd",
    run.cwd,
    ...(machine ? ["--on", machine] : []),
    "--label",
    `${EXEC}=${id}`,
    "--label",
    `${OPENED}=${now}`,
  ];
}

/** Starts a shell beside the run and shows it. @param {string} id @param {any} run */
export async function startShell(id, run) {
  const now = Date.now();
  const args = shellArgs(id, run, now);
  if (!args) return false;
  const r = await hc(args);
  if (r.code !== 0) {
    notify({ title: "Execute failed", body: r.stderr, level: "error" });
    return false;
  }
  selectTab(id, String(now));
  return true;
}

/** Closes a shell; the selection goes back to the agent when it showed this shell.
 *  @param {string} id @param {any} shell */
export function closeShell(id, shell) {
  run("terminal.kill", { terminal: shell.address });
  if (tabs()[id] === tabKey(shell)) selectTab(id, null);
}

/** The layout child id of a shell's block. @param {string} address */
export function childId(address) {
  return `run-x-${address.replaceAll("/", "-")}`;
}
