// ticket/filter: the Tickets tab's filter: Needs me, Mine, State, Label and Type, AND-ed.
// The chosen filter is shared (so the rail, status item and menus agree); it holds names and
// flags only, no ticket content. This module draws nothing.
import { setShared, shared } from "herdr";
import { listFor } from "./list/index.js";
import { STATES } from "./rules.js";

/**
 * @typedef {{ needsMe: boolean, mine: boolean, state: string, label: string | null, type: string | null }} Filter
 * state is "open" (all open), one of STATES or "closed" (the server list).
 */

/** @type {Filter} */
export const DEFAULT_FILTER = {
  needsMe: false,
  mine: false,
  state: "open",
  label: null,
  type: null,
};

/** @returns {Filter} */
export const currentFilter = () => ({
  ...DEFAULT_FILTER,
  .../** @type {Partial<Filter>} */ (shared("bakers.filter") ?? {}),
});

/** @param {Partial<Filter>} patch */
export const setFilter = (patch) => setShared("bakers.filter", { ...currentFilter(), ...patch });

export const clearFilter = () => setShared("bakers.filter", { ...DEFAULT_FILTER });

/** @typedef {{ name: string, names?: string[] }} User the signed-in user; names: every name the assignee may show */

/** Whether a record is assigned to the user, by any of the user's names. @param {any} r @param {User} user */
const assignedTo = (r, user) =>
  r.assignee != null && (user.names ?? [user.name]).includes(r.assignee);

/** Mine is disabled without a signed-in user, so it neither filters nor counts as active. @param {Filter} f @param {User | null} user */
export const isActive = (f, user) =>
  f.needsMe ||
  (f.mine && user != null) ||
  f.state !== DEFAULT_FILTER.state ||
  f.label !== DEFAULT_FILTER.label ||
  f.type !== DEFAULT_FILTER.type;

/** The list that runs for a filter: the closed server list, Needs me for its sort, else open. @param {Filter} f */
export function listForFilter(f) {
  if (f.state === "closed") return listFor("closed");
  return listFor(f.needsMe ? "needs-me" : "open");
}

/**
 * The records every part of the filter lets through.
 * @param {any[]} records @param {Filter} f @param {{ user: User | null }} o
 */
export function applyFilter(records, f, { user }) {
  return records.filter(
    (r) =>
      (!f.needsMe || r.why !== null) &&
      (!f.mine || user == null || assignedTo(r, user)) &&
      (f.state === "open" || f.state === "closed" || r.state === f.state) &&
      (f.label === null || (r.labels ?? []).includes(f.label)) &&
      (f.type === null || r.type === f.type),
  );
}

/**
 * The counts next to the controls: for each choice, the open records the list would show with
 * that choice and the other active parts of the filter. Recently closed lists the server's
 * records, which these counts cannot see, so they then count as if no part were active.
 * @param {any[]} records @param {User | null} user @param {Filter} [filter]
 */
export function counts(records, user, filter = DEFAULT_FILTER) {
  const base = filter.state === "closed" ? DEFAULT_FILTER : filter;
  const open = records.filter((r) => !r.closed);
  const n = (/** @type {Partial<Filter>} */ patch) =>
    applyFilter(open, { ...base, ...patch }, { user }).length;
  const { labels, types } = choices(records);
  return {
    needsMe: n({ needsMe: true }),
    mine: user ? n({ mine: true }) : null,
    open: n({ state: "open" }),
    states: Object.fromEntries(STATES.map((s) => [s, n({ state: s })])),
    labels: Object.fromEntries(labels.map((v) => [v, n({ label: v })])),
    types: Object.fromEntries(types.map((v) => [v, n({ type: v })])),
  };
}

/** The labels and types present in the open records, for the menus. @param {any[]} records */
export function choices(records) {
  const open = records.filter((r) => !r.closed);
  const sorted = (/** @type {Iterable<string>} */ v) => [...new Set(v)].sort();
  return {
    labels: sorted(open.flatMap((r) => r.labels ?? [])),
    types: sorted(open.map((r) => r.type).filter(Boolean)),
  };
}
