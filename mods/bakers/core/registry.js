// core/registry: the one place features register what they contribute, by type and id.
// A type is any string ("widget", "gadget"); core knows none of them. define adds or
// replaces; a redefinition keeps its first position. all lists a type's entries sorted by
// def.order (default 0), then by first definition.

/** @type {Map<string, Map<string, { def: any, seq: number }>>} */
const TYPES = new Map();
let seq = 0;

/**
 * @template {object} T
 * @param {string} type @param {string} id @param {T} def
 * @returns {T}
 */
export function define(type, id, def) {
  let entries = TYPES.get(type);
  if (!entries) {
    entries = new Map();
    TYPES.set(type, entries);
  }
  const prev = entries.get(id);
  entries.set(id, { def, seq: prev ? prev.seq : seq++ });
  return def;
}

/** @param {string} type @param {string} id @returns {any} the def, or null */
export function get(type, id) {
  return TYPES.get(type)?.get(id)?.def ?? null;
}

/** @param {string} type @returns {any[]} `{ ...def, id }` sorted by order, then first definition */
export function all(type) {
  const entries = [...(TYPES.get(type) ?? [])];
  entries.sort(([, a], [, b]) => (a.def.order ?? 0) - (b.def.order ?? 0) || a.seq - b.seq);
  return entries.map(([id, { def }]) => ({ ...def, id }));
}

/** Empties every type. For tests. */
export function _resetForTests() {
  TYPES.clear();
  seq = 0;
}
