// core/actions: what a menu item does when chosen. An overlay is its own mod copy, so an
// item carries its action as data, [name, ...args], and the menu runs it. Each feature
// registers its own actions when its module loads; main.js imports every feature, so
// every copy knows every action.

/** @type {Record<string, (...args: any[]) => unknown>} */
const ACTIONS = {
  copy: (text, cx) => cx?.write_to_clipboard(text),
};

/** @param {string} name @param {(...args: any[]) => unknown} fn */
export function register(name, fn) {
  ACTIONS[name] = fn;
}

/** @param {any[]} action @param {any} [cx] the chooser's context (clipboard) */
export async function perform(action, cx) {
  if (!Array.isArray(action)) return;
  const [name, ...args] = action;
  if (name === "copy") return ACTIONS.copy(args[0], cx);
  return ACTIONS[name]?.(...args);
}
