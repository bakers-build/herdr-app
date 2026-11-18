// ticket/list/index: the ticket lists in the order the sidebar and the view menu show them,
// with their counts. The definitions are next to this file; ticket/register.js registers them.
import { findList } from "../../list/lookup.js";
import { runList } from "../../list/run.js";
import { STATES } from "../rules.js";

/** The keys in navigation order: one row per state under Open by state. */
export const NAV = ["needs-me", "mine", "open", ...STATES.map((s) => `state:${s}`), "closed"];

/** A registered list; the key names one this module imports. @param {string} key */
function known(key) {
  const list = findList(key);
  if (!list) throw new Error(`bakers: no list "${key}"`);
  return list;
}

/** @param {string} key */
export function listFor(key) {
  return findList(key) ?? known("needs-me");
}

/**
 * The sidebar's rows: label, count, chip and state.
 * @param {any[]} records the open tickets' records @param {string} current
 */
export function navItems(records, current) {
  return NAV.map((key) => {
    const { def, args, label } = known(key);
    return {
      key,
      label,
      count: def.count ? runList(def, records, { args }).total : null,
      selected: key === current,
      sub: Boolean(def.sub),
      dim: Boolean(def.dim),
      api: Boolean(def.api),
      disabled: Boolean(def.disabled),
    };
  });
}

/** The view menu: the sidebar's lists, a shortcut while it is hidden. @param {string} current */
export function menuItems(current) {
  return NAV.map((key) => {
    const { def, label } = known(key);
    return {
      label,
      action: ["ticket.view", key],
      current: key === current,
      sub: Boolean(def.sub),
      api: Boolean(def.api),
      disabled: Boolean(def.disabled),
    };
  });
}

/** The hint below the rows. @param {any} list from listFor @param {string} exposed */
export function emptyText(list, exposed) {
  if (exposed.trim()) return `Nothing else matches "${exposed.trim()}".`;
  const e = list.def.empty;
  return typeof e === "function" ? e(list.args) : (e ?? "");
}
