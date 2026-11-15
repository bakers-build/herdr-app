// What a menu or picker item does when chosen. Items carry [name, ...args] so an overlay
// (its own mod copy) can run them; every effect goes through shared state, the store or a
// Herdr command, never through the opener's memory.
import { setShared, shared } from "herdr";
import { api, chooseProject, getStore, ready } from "./context.js";
import { openConfirm, openNewTicket } from "./overlay.js";
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
  confirm: (kind, ticket, extra = {}) => openConfirm(kind, { ticket, ...extra }),
  copy: (text, cx) => cx?.write_to_clipboard(text),
  classify: async (ticket, fields) => {
    await api.classifyTicket(ticket, fields);
    await refresh();
  },
  labels: async (ticket, fields) => {
    await api.updateTicket(ticket, fields);
    await refresh();
  },
  project: async (uuid, name) => {
    chooseProject({ uuid, name });
    await refresh();
  },
};

/** @param {any[]} action @param {any} [cx] the chooser's context (clipboard) */
export async function perform(action, cx) {
  if (!Array.isArray(action)) return;
  const [name, ...args] = action;
  if (name === "copy") return ACTIONS.copy(args[0], cx);
  return ACTIONS[name]?.(...args);
}

/** @param {string} name @param {(...args: any[]) => unknown} fn */
export function register(name, fn) {
  ACTIONS[name] = fn;
}
