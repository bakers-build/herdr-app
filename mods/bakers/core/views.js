// core/views: the vocabulary of the Tickets tab's views (Needs me, Mine, Open by state
// with one row per state, Recently closed). The chosen view lives in shared("bakers.view");
// the sidebar section (features/views) and the list's view menu (features/list) both use it.
import { setShared, shared } from "herdr";
import { register } from "./actions.js";
import { STATES } from "./store.js";
import { ensureTicketsTab } from "./tabs.js";

export const cap = (/** @type {string} */ s) => s.charAt(0).toUpperCase() + s.slice(1);

export const currentView = () => /** @type {string} */ (shared("bakers.view")) ?? "needs-me";

/** @param {string} view */
export function viewLabel(view) {
  if (view === "needs-me") return "Needs me";
  if (view === "mine") return "Mine";
  if (view === "closed") return "Recently closed";
  if (view.startsWith("state:")) return cap(view.slice(6));
  return "Open by state";
}

/** Chooses a view and shows the Tickets tab. @param {string} view */
export function chooseView(view) {
  setShared("bakers.view", view);
  ensureTicketsTab();
}

register("view.set", (view) => setShared("bakers.view", view));

/** The view menu's items (a shortcut while the sidebar is hidden). */
export function viewItems() {
  const view = currentView();
  const item = (/** @type {string} */ key, o = {}) => ({
    label: viewLabel(key),
    action: ["view.set", key],
    current: view === key,
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
