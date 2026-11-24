// ticket/list/index: finds the ticket lists. The definitions are next to this file;
// ticket/register.js registers them.
import { findList } from "../../list/lookup.js";

/** A registered list; the lists are registered by this module's register.js. @param {string} key */
function known(key) {
  const list = findList(key);
  if (!list) throw new Error(`bakers: no list "${key}"`);
  return list;
}

/** @param {string} key */
export function listFor(key) {
  return findList(key) ?? known("needs-me");
}

/** The hint below the rows. @param {any} list from listFor @param {string} exposed @param {boolean} [active] a filter is active */
export function emptyText(list, exposed, active = false) {
  if (exposed.trim()) return `Nothing else matches "${exposed.trim()}".`;
  if (active) return "Nothing matches these filters.";
  const e = list.def.empty;
  return typeof e === "function" ? e(list.args) : (e ?? "");
}
