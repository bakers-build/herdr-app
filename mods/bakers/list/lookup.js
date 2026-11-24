// list/lookup: finds a registered list by key. A key is the list's id, or its id and
// arguments: "id:a:b" runs the list "id" with args ["a", "b"] (no current list takes any).
import { all } from "../core/registry.js";

/** @param {string} key @returns {{ def: any, args: string[], label: string } | null} */
export function findList(key) {
  const [id, ...args] = String(key).split(":");
  const def = all("list").find((d) => d.id === id);
  if (!def) return null;
  return { def, args, label: typeof def.label === "function" ? def.label(args) : def.label };
}
