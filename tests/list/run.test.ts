import { expect, test } from "bun:test";
import "../harness";

const { runList } = await import("../../mods/bakers/list/run.js");
const { toQuery } = await import("../../mods/bakers/list/query.js");
const { all, define } = await import("../../mods/bakers/core/registry.js");
const { findList } = await import("../../mods/bakers/list/lookup.js");

const records = [
  { id: "A-1", title: "Cart page", state: "plan", why: null, since: 30, closed: false },
  {
    id: "A-2",
    title: "Checkout",
    state: "working",
    why: "Asked a question",
    since: 10,
    closed: false,
  },
  {
    id: "A-3",
    title: "Delivery date",
    state: "working",
    why: "Ready for review",
    since: 20,
    closed: false,
  },
  { id: "A-4", title: "Old cart bug", state: "done", why: null, since: 5, closed: true },
];

test("filters (with values from the context), derived filters, sort and the exposed filter", () => {
  const def = {
    id: "x",
    filters: [{ field: "closed", op: "=", value: false }],
    derived: [(r: any) => r.why !== null],
    exposed: { fields: ["id", "title"] },
    sort: [{ field: "since", dir: "asc" }],
  };
  expect(runList(def, records, {}).rows.map((r: any) => r.id)).toEqual(["A-2", "A-3"]);
  expect(runList(def, records, { exposed: "DELIV" }).rows.map((r: any) => r.id)).toEqual(["A-3"]);
  const byArg = { id: "s", filters: [{ field: "state", op: "=", value: (c: any) => c.args[0] }] };
  expect(runList(byArg, records, { args: ["working"] }).rows.map((r: any) => r.id)).toEqual([
    "A-2",
    "A-3",
  ]);
});

test("grouping follows the given order; unknown groups go last", () => {
  const def = { id: "g", group: { by: "state", order: ["working", "plan"] } };
  const r = runList(def, records, {});
  expect(r.groups?.map((g: any) => [g.key, g.rows.map((x: any) => x.id)])).toEqual([
    ["working", ["A-2", "A-3"]],
    ["plan", ["A-1"]],
    ["done", ["A-4"]],
  ]);
  expect(r.rows.map((x: any) => x.id)).toEqual(["A-2", "A-3", "A-1", "A-4"]);
});

test("the pager shows page by page and says when there is more", () => {
  const def = { id: "p", pager: { type: "more", limit: 2 } };
  expect(runList(def, records, { page: 0 })).toMatchObject({ total: 4, more: true });
  expect(runList(def, records, { page: 0 }).rows.length).toBe(2);
  expect(runList(def, records, { page: 1 })).toMatchObject({ more: false });
  expect(runList(def, records, { page: 1 }).rows.length).toBe(4);
});

test("a server list leaves filter, sort and paging to the server", () => {
  const def = {
    id: "closed",
    query: {
      filters: [
        { field: "project_id.id", op: "=", value: (c: any) => c.project },
        { field: "closed", op: "=", value: true },
      ],
      sort: "-closed_date",
    },
    exposed: { fields: ["id", "title"] },
    pager: { type: "more", limit: 50 },
  };
  expect(toQuery(def, { project: "p1" }, 2)).toEqual({
    filter: [
      ["project_id.id", "=", "p1"],
      ["closed", "=", true],
    ],
    sort: "-closed_date",
    limit: 50,
    offset: 100,
  });
  const r = runList(def, records.slice(0, 2), { server: true, more: true, exposed: "cart" });
  expect(r.rows.map((x: any) => x.id)).toEqual(["A-1"]);
  expect(r.more).toBe(true);
});

test("the registry finds a list by key, also with an argument", () => {
  define("list", "t-plain", { id: "t-plain", label: "Plain" });
  define("list", "t-arg", {
    id: "t-arg",
    label: (args: string[]) => `State ${args[0]}`,
  });
  expect(findList("t-plain")).toMatchObject({ def: { id: "t-plain" }, args: [], label: "Plain" });
  expect(findList("t-arg:working")).toMatchObject({
    def: { id: "t-arg" },
    args: ["working"],
    label: "State working",
  });
  expect(findList("t-nope")).toBe(null);
  expect(all("list").map((d: any) => d.id)).toEqual(expect.arrayContaining(["t-plain", "t-arg"]));
});
