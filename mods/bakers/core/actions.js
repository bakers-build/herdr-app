// core/actions: what a menu item does when chosen. An overlay is its own mod copy, so an
// item carries its action as data, [name, ...args], and the menu runs it. Actions are
// registered under the "action" type (core/registry.js); main.js registers every one, so
// every copy knows every action. Only copy is built in: it needs the chooser's context.
import { get } from "./registry.js";

/** @param {any[]} action @param {any} [cx] the chooser's context (clipboard) */
export async function perform(action, cx) {
  if (!Array.isArray(action)) return;
  const [name, ...args] = action;
  if (name === "copy") return cx?.write_to_clipboard(args[0]);
  return get("action", name)?.run(...args);
}
