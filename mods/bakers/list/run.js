// list/run: runs a list definition over records, the way Drupal Views runs a view.
// A definition has these parts, each optional:
//   filters   [{ field, op, value }]   conditions on record fields; value may be (ctx) => value
//   derived   [(record, ctx) => bool]  conditions on derived facts (who needs you)
//   exposed   { fields }                the filter field of the screen, case-insensitive contains
//   sort      [{ field, dir }]          asc or desc, empty values last
//   group     { by, order }             groups in the given order, others after
//   pager     { type, limit }           "all" (default) or "more": limit rows per page
//   query     { filters, sort, include } a server list: core/api.js does filter, sort, paging
// A server list (o.server) has been filtered, sorted and paged by the server already; only
// the exposed filter runs here, and o.more says whether the server has more.

/** @param {any} v @param {any} ctx */
const resolveValue = (v, ctx) => (typeof v === "function" ? v(ctx) : v);

/** @param {any} actual @param {string} op @param {any} want */
function test(actual, op, want) {
  const empty = actual === null || actual === undefined || actual === "";
  switch (op) {
    case "=":
      return actual === want;
    case "<>":
      return actual !== want;
    case "IN":
      return /** @type {any[]} */ ([]).concat(want).includes(actual);
    case "CONTAINS":
      return String(actual ?? "")
        .toLowerCase()
        .includes(String(want).toLowerCase());
    case "IS NULL":
      return empty;
    case "IS NOT NULL":
      return !empty;
    default:
      throw new Error(`list: no operator ${op}`);
  }
}

/** @param {{ field: string, dir?: string }[]} sort */
function comparator(sort) {
  return (/** @type {any} */ a, /** @type {any} */ b) => {
    for (const s of sort) {
      const x = a[s.field];
      const y = b[s.field];
      if (x === y) continue;
      if (x == null) return 1;
      if (y == null) return -1;
      const c = x < y ? -1 : 1;
      return s.dir === "desc" ? -c : c;
    }
    return 0;
  };
}

/**
 * @param {any} def a list definition
 * @param {any[]} records
 * @param {{ args?: string[], exposed?: string, page?: number, server?: boolean, more?: boolean, [k: string]: any }} [o]
 * @returns {{ rows: any[], groups: { key: string, rows: any[] }[] | null, total: number, more: boolean }}
 */
export function runList(def, records, o = {}) {
  const ctx = { args: [], ...o };
  let rows = [...records];
  if (!o.server) {
    for (const f of def.filters ?? [])
      rows = rows.filter((r) => test(r[f.field], f.op, resolveValue(f.value, ctx)));
    for (const d of def.derived ?? []) rows = rows.filter((r) => d(r, ctx));
  }
  const q = (o.exposed ?? "").trim().toLowerCase();
  if (q && def.exposed)
    rows = rows.filter((r) =>
      def.exposed.fields.some((/** @type {string} */ f) =>
        String(r[f] ?? "")
          .toLowerCase()
          .includes(q),
      ),
    );
  if (!o.server && def.sort?.length) rows.sort(comparator(def.sort));
  /** @type {{ key: string, rows: any[] }[] | null} */
  let groups = null;
  if (def.group) {
    const order = def.group.order ?? [];
    /** @type {Map<string, any[]>} */
    const by = new Map();
    for (const r of rows) {
      const k = String(r[def.group.by]);
      by.set(k, [...(by.get(k) ?? []), r]);
    }
    const keys = [...by.keys()].sort((a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      return (ia < 0 ? order.length : ia) - (ib < 0 ? order.length : ib);
    });
    groups = keys.map((k) => ({ key: k, rows: by.get(k) ?? [] }));
    rows = groups.flatMap((g) => g.rows);
  }
  const total = rows.length;
  if (o.server) return { rows, groups, total, more: Boolean(o.more) };
  if (def.pager?.type === "more") {
    const shown = def.pager.limit * ((o.page ?? 0) + 1);
    return { rows: rows.slice(0, shown), groups, total, more: total > shown };
  }
  return { rows, groups, total, more: false };
}
