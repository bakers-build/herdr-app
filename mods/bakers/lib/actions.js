// What a menu or picker item does when chosen. Items carry [name, ...args] so an overlay
// (its own mod copy) can run them; every effect goes through shared state, the store or a
// Herdr command, never through the opener's memory.
import { setShared, shared } from "herdr";
import { chooseProject, getStore, ready } from "./context.js";
import { openNewTicket } from "./overlay.js";
import { closeAll, closeFinished } from "./tabs.js";

export async function refresh() {
  await ready();
  const store = getStore();
  await store.refresh();
  const needs = store.needs();
  setShared("bakers.needs", { count: needs.count, ids: needs.ids, updated: store.updated });
}

/** @type {Record<string, (...args: any[]) => unknown>} */
const ACTIONS = {
  refresh,
  toggleClosed: () => setShared("bakers.showClosed", !shared("bakers.showClosed")),
  closeFinished: () => closeFinished(),
  closeAll: () => closeAll(),
  view: (v) => setShared("bakers.view", v),
  newTicket: () => openNewTicket(),
  project: async (uuid, name) => {
    chooseProject({ uuid, name });
    await refresh();
  },
};

/** @param {any[]} action */
export async function perform(action) {
  if (!Array.isArray(action)) return;
  const [name, ...args] = action;
  return ACTIONS[name]?.(...args);
}

/** @param {string} name @param {(...args: any[]) => unknown} fn */
export function register(name, fn) {
  ACTIONS[name] = fn;
}
