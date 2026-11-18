// The ticket lists: each definition run by the list engine over records, as the store gives them.
import { expect, test } from "bun:test";
import "../harness";

const { emptyText, listFor, menuItems, navItems } = await import(
  "../../mods/bakers/ticket/list/index.js"
);
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

test("Needs me: the tickets that need you, longest waiting first, with the reason column", () => {
  expect(run("needs-me").rows.map((r: any) => r.id)).toEqual(["SHOP-60", "SHOP-41", "SHOP-56"]);
  expect(listFor("needs-me").def.row.reason).toBe(true);
});

test("Open by state: grouped in workflow order", () => {
  expect(run("open").groups?.map((g: any) => [g.key, g.rows.map((r: any) => r.id)])).toEqual([
    ["qualification", ["SHOP-57"]],
    ["plan", ["SHOP-56"]],
    ["working", ["SHOP-41", "SHOP-58"]],
    ["review", ["SHOP-60"]],
  ]);
});

test("a state list takes the state as its argument", () => {
  expect(listFor("state:working").label).toBe("Working");
  expect(run("state:working").rows.map((r: any) => r.id)).toEqual(["SHOP-41", "SHOP-58"]);
  expect(emptyText(listFor("state:review"), "")).toBe("No other tickets in review.");
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

test("Mine stays empty with the API chip; an unknown key falls back to Needs me", () => {
  expect(run("mine").rows).toEqual([]);
  expect(listFor("mine").def).toMatchObject({ api: true, disabled: true });
  expect(listFor("nope").def.id).toBe("needs-me");
});

test("the sidebar's rows: every list with its count, one row per state", () => {
  expect(
    navItems(records, "needs-me").map((r: any) => [r.label, r.count, r.selected, r.sub, r.api]),
  ).toEqual([
    ["Needs me", 3, true, false, false],
    ["Mine", null, false, false, true],
    ["Open by state", 5, false, false, false],
    ["Qualification", 1, false, true, false],
    ["Plan", 1, false, true, false],
    ["Working", 2, false, true, false],
    ["Review", 1, false, true, false],
    ["Recently closed", null, false, false, false],
  ]);
});

test("the view menu offers the same lists and switches through ticket.view", () => {
  const items = menuItems("open");
  expect(items.map((i: any) => i.label)).toEqual([
    "Needs me",
    "Mine",
    "Open by state",
    "Qualification",
    "Plan",
    "Working",
    "Review",
    "Recently closed",
  ]);
  expect(items[2]).toMatchObject({ current: true, action: ["ticket.view", "open"] });
  expect(items[1].disabled).toBe(true);
});
