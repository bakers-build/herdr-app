// A small JSON:API server for the tests: answers the mod's fetch with documents shaped like
// Drupal's JSON:API (the real bb_ticket read in jsonapi/bb_ticket-read.json). It understands
// condition filters (=, <>, CONTAINS, STARTS_WITH, IN, IS NULL, IS NOT NULL) on attributes
// and on relationship paths (ticket_id.project_id.id), sort, include (also dotted) and paging.

export type Resource = {
  type: string;
  id: string;
  attributes: Record<string, any>;
  relationships?: Record<string, { data: any }>;
};

export const ref = (type: string, id: string) => ({ type, id });

export function jsonapiServer(resources: Resource[], base = "https://bakers.test") {
  const byKey = new Map(resources.map((r) => [`${r.type}:${r.id}`, r]));
  const get = (x: any) => (x ? byKey.get(`${x.type}:${x.id}`) : undefined);

  /** Values a path reaches from a resource (relationships fan out). */
  const values = (r: Resource | undefined, path: string[]): any[] => {
    if (!r) return [];
    const [head, ...rest] = path;
    if (head === "id" && !rest.length) return [r.id];
    if (r.relationships && head in r.relationships) {
      const d = r.relationships[head].data;
      const list = Array.isArray(d) ? d : d ? [d] : [];
      if (!rest.length) return list.map((x: any) => x.id);
      return list.flatMap((x: any) => values(get(x), rest));
    }
    const v = r.attributes?.[head];
    return rest.length ? [] : [v && typeof v === "object" && "value" in v ? v.value : v];
  };

  const test = (r: Resource, path: string, op: string, value: string | null) => {
    const vs = values(r, path.split("."));
    const has = vs.filter((v) => v !== null && v !== undefined && v !== "");
    switch (op) {
      case "=":
        return vs.some(
          (v) => String(v) === value || (typeof v === "boolean" && String(Number(v)) === value),
        );
      case "<>":
        return !vs.some((v) => String(v) === value);
      case "CONTAINS":
        return has.some((v) => String(v).toLowerCase().includes(String(value).toLowerCase()));
      case "STARTS_WITH":
        return has.some((v) => String(v).toLowerCase().startsWith(String(value).toLowerCase()));
      case "IN":
        return has.some((v) => String(value).split(",").includes(String(v)));
      case "IS NULL":
        return has.length === 0;
      case "IS NOT NULL":
        return has.length > 0;
      default:
        throw new Error(`fake server: no operator ${op}`);
    }
  };

  const collectIncludes = (r: Resource, paths: string[], into: Map<string, Resource>) => {
    for (const p of paths) {
      let level = [r];
      for (const step of p.split(".")) {
        const next: Resource[] = [];
        for (const x of level) {
          const d = x.relationships?.[step]?.data;
          for (const y of Array.isArray(d) ? d : d ? [d] : []) {
            const res = get(y);
            if (res) {
              into.set(`${res.type}:${res.id}`, res);
              next.push(res);
            }
          }
        }
        level = next;
      }
    }
  };

  const ok = (body: any) => ({
    status: 200,
    ok: true,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });

  return async (url: string, opts?: any) => {
    if (!String(opts?.headers?.Authorization ?? "").startsWith("Bearer "))
      return {
        status: 401,
        ok: false,
        json: async () => ({ errors: [{ title: "Unauthorized" }] }),
        text: async () => "",
      };
    const u = new URL(url);
    if (!url.startsWith(base)) throw new Error(`fake server: unknown host ${url}`);
    const [, , entity, bundle, uuid] = u.pathname.split("/");
    const type = `${entity}--${bundle}`;
    const p = u.searchParams;
    const include = (p.get("include") ?? "").split(",").filter(Boolean);
    const included = new Map<string, Resource>();
    if (uuid) {
      const r = byKey.get(`${type}:${uuid}`);
      if (!r)
        return {
          status: 404,
          ok: false,
          json: async () => ({ errors: [{ title: "Not Found", detail: `No ${type} ${uuid}` }] }),
          text: async () => "",
        };
      collectIncludes(r, include, included);
      return ok({ jsonapi: { version: "1.1" }, data: r, included: [...included.values()] });
    }
    let rows = resources.filter((r) => r.type === type);
    for (let i = 0; p.has(`filter[f${i}][condition][path]`); i++)
      rows = rows.filter((r) =>
        test(
          r,
          p.get(`filter[f${i}][condition][path]`) as string,
          p.get(`filter[f${i}][condition][operator]`) ?? "=",
          p.get(`filter[f${i}][condition][value]`),
        ),
      );
    const sort = p.get("sort");
    if (sort) {
      const desc = sort.startsWith("-");
      const key = desc ? sort.slice(1) : sort;
      rows = [...rows].sort(
        (a, b) =>
          String(a.attributes[key] ?? "").localeCompare(String(b.attributes[key] ?? "")) *
          (desc ? -1 : 1),
      );
    }
    const limit = Number(p.get("page[limit]") ?? 50);
    const offset = Number(p.get("page[offset]") ?? 0);
    const page = rows.slice(offset, offset + limit);
    for (const r of page) collectIncludes(r, include, included);
    return ok({
      jsonapi: { version: "1.1" },
      data: page,
      included: [...included.values()],
      links: offset + limit < rows.length ? { next: { href: "next" } } : {},
    });
  };
}
