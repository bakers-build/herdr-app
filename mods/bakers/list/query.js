// list/query: a server list's definition as a core/api.js query (filter, sort, paging).

/**
 * @param {any} def @param {any} ctx the caller's values for the conditions, such as args @param {number} page
 * @returns {import("../core/api.js").Query}
 */
export function toQuery(def, ctx, page) {
  const q = def.query ?? {};
  /** @type {any} */
  const out = {
    filter: (q.filters ?? []).map((/** @type {any} */ f) => [
      f.field,
      f.op,
      typeof f.value === "function" ? f.value(ctx) : f.value,
    ]),
  };
  if (q.sort) out.sort = q.sort;
  if (q.include) out.include = q.include;
  if (def.pager?.type === "more") {
    out.limit = def.pager.limit;
    out.offset = page * def.pager.limit;
  }
  return out;
}
