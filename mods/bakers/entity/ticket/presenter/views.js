// presenter/views: the names of the Tickets tab's views, for the view menu and the sidebar.
import { STATES } from "../rules.js";

export const cap = (/** @type {string} */ s) => s.charAt(0).toUpperCase() + s.slice(1);

/** @param {string} view */
export function viewLabel(view) {
  if (view === "needs-me") return "Needs me";
  if (view === "mine") return "Mine";
  if (view === "closed") return "Recently closed";
  if (view.startsWith("state:")) return cap(view.slice(6));
  return "Open by state";
}

/** The view menu: the sidebar's views, a shortcut while it is hidden. @param {string} current */
export function viewItems(current) {
  const item = (/** @type {string} */ key, o = {}) => ({
    label: viewLabel(key),
    action: ["ticket.view", key],
    current: current === key,
    ...o,
  });
  return [
    item("needs-me"),
    item("mine", { disabled: true, api: true }),
    item("open"),
    ...STATES.map((s) => item(`state:${s}`, { sub: true })),
    item("closed", { api: true }),
  ];
}
