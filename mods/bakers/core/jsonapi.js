// core/jsonapi: a JSON:API document as plain entities. Attributes become fields; a text
// field ({ value, format, processed }) becomes its value; a relationship becomes the
// included entity when the document carries it, else a { id, type } reference. Nested
// includes resolve too; a resource met again on the same path stays a reference.

/** @param {any} v */
const plain = (v) =>
  v && typeof v === "object" && !Array.isArray(v) && "value" in v && "format" in v ? v.value : v;

/**
 * @param {any} doc a JSON:API document
 * @returns {{ data: any, next: boolean }}
 */
export function normalize(doc) {
  /** @type {Map<string, any>} */
  const index = new Map();
  for (const r of [
    ...(Array.isArray(doc?.data) ? doc.data : doc?.data ? [doc.data] : []),
    ...(doc?.included ?? []),
  ])
    index.set(`${r.type}:${r.id}`, r);

  /** @param {any} ref @param {Set<string>} path */
  const resolve = (ref, path) => {
    if (!ref) return null;
    const key = `${ref.type}:${ref.id}`;
    const r = index.get(key);
    if (!r || path.has(key)) return { id: ref.id, type: ref.type };
    return entity(r, new Set([...path, key]));
  };

  /** @param {any} r @param {Set<string>} path */
  const entity = (r, path) => {
    /** @type {Record<string, any>} */
    const e = { id: r.id, type: r.type };
    for (const [k, v] of Object.entries(r.attributes ?? {})) e[k] = plain(v);
    for (const [k, rel] of Object.entries(r.relationships ?? {})) {
      const d = /** @type {any} */ (rel)?.data;
      e[k] = Array.isArray(d) ? d.map((x) => resolve(x, path)) : resolve(d, path);
    }
    return e;
  };

  const top = (/** @type {any} */ r) => entity(r, new Set([`${r.type}:${r.id}`]));
  return {
    data: Array.isArray(doc?.data) ? doc.data.map(top) : doc?.data ? top(doc.data) : null,
    next: Boolean(doc?.links?.next),
  };
}
