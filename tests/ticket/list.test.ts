// The ticket lists: each definition run by the list engine over records, as the store gives them.
import { expect, test } from "bun:test";
import "../harness";

const { emptyText, listFor } = await import("../../mods/bakers/ticket/list/index.js");
const { runList } = await import("../../mods/bakers/list/run.js");
const { toQuery } = await import("../../mods/bakers/list/query.js");

const rec = (
  id: string,
  state: string,
  why: string | null,
  since: number | null,
  extra: any = {},
) => ({ id, title: `Title ${id}`, state, why, since, closed: false, ...extra });
const records = [
  rec("SHOP-41", "working", "Asked a question", 300),
  rec("SHOP-56", "plan", "Plan ready for approval", 500),
  rec("SHOP-57", "qualification", null, null),
  rec("SHOP-58", "working", null, null),
  rec("SHOP-60", "review", "Ready for review", 100),
];
const run = (key: string, o: any = {}) => {
  const l = listFor(key);
  return runList(l.def, records, { args: l.args, ...o });
};

test("Needs me: the tickets that need you, longest waiting first", () => {
  expect(run("needs-me").rows.map((r: any) => r.id)).toEqual(["SHOP-60", "SHOP-41", "SHOP-56"]);
});

test("Open by state: grouped in workflow order", () => {
  expect(run("open").groups?.map((g: any) => [g.key, g.rows.map((r: any) => r.id)])).toEqual([
    ["qualification", ["SHOP-57"]],
    ["plan", ["SHOP-56"]],
    ["working", ["SHOP-41", "SHOP-58"]],
    ["review", ["SHOP-60"]],
  ]);
});

test("the exposed filter matches identifier or title, case-insensitive", () => {
  expect(run("open", { exposed: "shop-56" }).rows.map((r: any) => r.id)).toEqual(["SHOP-56"]);
  expect(emptyText(listFor("open"), " deliv ")).toBe('Nothing else matches "deliv".');
});

test("Recently closed is a server list: closed tickets of the project, newest first, 50 per page", () => {
  const l = listFor("closed");
  expect(typeof l.def.load).toBe("function");
  expect(toQuery(l.def, { project: "p1", args: [] }, 1)).toEqual({
    filter: [
      ["project_id.id", "=", "p1"],
      ["closed", "=", true],
    ],
    sort: "-closed_date",
    limit: 50,
    offset: 50,
  });
});

test("an unknown key falls back to Needs me; Mine and the state lists are gone", () => {
  expect(listFor("nope").def.id).toBe("needs-me");
  expect(listFor("mine").def.id).toBe("needs-me");
  expect(listFor("state:working").def.id).toBe("needs-me");
});
