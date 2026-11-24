// The ticket filter: shared state, the AND of its parts, counts and choices.
import { beforeEach, expect, test } from "bun:test";
import { env, reset } from "../harness";

const {
  DEFAULT_FILTER,
  applyFilter,
  choices,
  clearFilter,
  counts,
  currentFilter,
  isActive,
  listForFilter,
  setFilter,
} = await import("../../mods/bakers/ticket/filter.js");
const { emptyText } = await import("../../mods/bakers/ticket/list/index.js");
const { runList } = await import("../../mods/bakers/list/run.js");
const { toQuery } = await import("../../mods/bakers/list/query.js");
const { _resetForTests } = await import("../../mods/bakers/core/registry.js");
const { register } = await import("../../mods/bakers/ticket/register.js");

beforeEach(() => {
  reset();
  _resetForTests();
  register();
});

const rec = (id: string, state: string, extra: any = {}) => ({
  id,
  title: `Title ${id}`,
  state,
  why: null,
  since: null,
  closed: false,
  labels: [],
  assignee: null,
  type: null,
  ...extra,
});
const records = [
  rec("SHOP-41", "working", {
    why: "Asked a question",
    since: 300,
    labels: ["Question", "auto"],
    assignee: "pg",
    type: "bug",
  }),
  rec("SHOP-56", "plan", {
    why: "Plan ready for approval",
    since: 500,
    labels: ["auto"],
    assignee: "jo",
    type: "feature",
  }),
  rec("SHOP-57", "qualification", { type: "feature", assignee: "pg" }),
  rec("SHOP-58", "working", { labels: ["ui"], type: "chore" }),
  rec("SHOP-60", "review", { why: "Ready for review", since: 100, assignee: "pg", type: "bug" }),
];
const user = { uuid: "u1", name: "pg" };
const ids = (rows: any[]) => rows.map((r) => r.id);
const run = (patch: any, u: any = user) =>
  ids(applyFilter(records, { ...DEFAULT_FILTER, ...patch }, { user: u }));

test("T3.1 each filter alone", () => {
  expect(run({})).toEqual(["SHOP-41", "SHOP-56", "SHOP-57", "SHOP-58", "SHOP-60"]);
  expect(run({ needsMe: true })).toEqual(["SHOP-41", "SHOP-56", "SHOP-60"]);
  expect(run({ mine: true })).toEqual(["SHOP-41", "SHOP-57", "SHOP-60"]);
  expect(run({ state: "working" })).toEqual(["SHOP-41", "SHOP-58"]);
  expect(run({ state: "open" })).toHaveLength(5);
  expect(run({ label: "auto" })).toEqual(["SHOP-41", "SHOP-56"]);
  expect(run({ type: "feature" })).toEqual(["SHOP-56", "SHOP-57"]);
});

test("T3.2 filters AND each other and the / text", () => {
  expect(run({ needsMe: true, mine: true })).toEqual(["SHOP-41", "SHOP-60"]);
  expect(run({ needsMe: true, mine: true, state: "review" })).toEqual(["SHOP-60"]);
  expect(run({ label: "auto", type: "bug" })).toEqual(["SHOP-41"]);
  const l = listForFilter({ ...DEFAULT_FILTER, mine: true, type: "bug" });
  const rows = applyFilter(records, { ...DEFAULT_FILTER, mine: true, type: "bug" }, { user });
  expect(ids(runList(l.def, rows, { args: l.args, exposed: "shop-60" }).rows)).toEqual(["SHOP-60"]);
});

test("T3.3 isActive and clearFilter", () => {
  expect(currentFilter()).toEqual(DEFAULT_FILTER);
  expect(DEFAULT_FILTER).toEqual({
    needsMe: false,
    mine: false,
    state: "open",
    label: null,
    type: null,
  });
  expect(isActive(DEFAULT_FILTER)).toBe(false);
  for (const p of [
    { needsMe: true },
    { mine: true },
    { state: "plan" },
    { state: "closed" },
    { label: "ui" },
    { type: "bug" },
  ])
    expect(isActive({ ...DEFAULT_FILTER, ...p })).toBe(true);
  setFilter({ needsMe: true });
  setFilter({ label: "ui" });
  expect(currentFilter()).toEqual({ ...DEFAULT_FILTER, needsMe: true, label: "ui" });
  expect(env.shared["bakers.filter"]).toEqual({ ...DEFAULT_FILTER, needsMe: true, label: "ui" });
  clearFilter();
  expect(currentFilter()).toEqual(DEFAULT_FILTER);
});

test("T3.4 counts: Needs me, Mine, Open and each state", () => {
  expect(counts(records, user)).toEqual({
    needsMe: 3,
    mine: 3,
    open: 5,
    states: { qualification: 1, plan: 1, working: 2, review: 1 },
  });
});

test("T3.5 closed runs the server list: 50 per page, newest closing first", () => {
  const l = listForFilter({ ...DEFAULT_FILTER, state: "closed" });
  expect(typeof l.def.load).toBe("function");
  expect(toQuery(l.def, { project: "p1", args: [] }, 1)).toMatchObject({
    sort: "-closed_date",
    limit: 50,
  });
  expect(listForFilter(DEFAULT_FILTER).def.id).toBe("open");
  expect(listForFilter({ ...DEFAULT_FILTER, state: "plan" }).def.id).toBe("open");
  expect(listForFilter({ ...DEFAULT_FILTER, needsMe: true }).def.id).toBe("needs-me");
  // a closed ticket in a closed list is never dropped by the state part
  const done = [rec("SHOP-49", "done", { closed: true })];
  expect(
    applyFilter(done, { ...DEFAULT_FILTER, state: "closed" }, { user }).map((r: any) => r.id),
  ).toEqual(["SHOP-49"]);
});

test("T3.6 without the signed-in user Mine counts null and matches nothing", () => {
  expect(counts(records, null).mine).toBeNull();
  expect(run({ mine: true }, null)).toEqual([]);
});

test("T3.7 choices: distinct values, sorted", () => {
  expect(choices(records)).toEqual({
    labels: ["Question", "auto", "ui"].sort(),
    types: ["bug", "chore", "feature"],
  });
});

test("choices consider only the open records", () => {
  const done = rec("SHOP-49", "done", { closed: true, labels: ["old"], type: "spike" });
  expect(choices([...records, done])).toEqual(choices(records));
});

test("the empty text names the filters while one is active", () => {
  const l = listForFilter({ ...DEFAULT_FILTER, mine: true });
  expect(emptyText(l, "", true)).toBe("Nothing matches these filters.");
  expect(emptyText(l, " zz ", true)).toBe('Nothing else matches "zz".');
  expect(emptyText(listForFilter(DEFAULT_FILTER), "", false)).toBe("No other open tickets.");
});

test("the ticket.filter action patches the filter; the status click shows Needs me", async () => {
  const actions: any = await import("../../mods/bakers/core/actions.js");
  await actions.perform(["ticket.filter", { label: "ui" }]);
  expect(currentFilter()).toEqual({ ...DEFAULT_FILTER, label: "ui" });
  const Status = (await import("../../mods/bakers/ticket/view/status.js")).default;
  new Status().click();
  expect(currentFilter()).toEqual({ ...DEFAULT_FILTER, needsMe: true });
});
