// list/registry: the lists a module defines, found by key. A key is the list's id, or its id
// and an argument: "state:working" runs the list "state" with args ["working"].

/** @type {any[]} */
let LISTS = [];

export function _resetForTests() {
  LISTS = [];
}

/** @param {any} def */
export function defineList(def) {
  LISTS = [...LISTS.filter((d) => d.id !== def.id), def];
  return def;
}

export const lists = () => LISTS;

/** @param {string} key @returns {{ def: any, args: string[], label: string } | null} */
export function getList(key) {
  const [id, ...args] = String(key).split(":");
  const def = LISTS.find((d) => d.id === id);
  if (!def) return null;
  return { def, args, label: typeof def.label === "function" ? def.label(args) : def.label };
}
