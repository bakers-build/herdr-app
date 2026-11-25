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

test("each filter alone", () => {
  expect(run({})).toEqual(["SHOP-41", "SHOP-56", "SHOP-57", "SHOP-58", "SHOP-60"]);
  expect(run({ needsMe: true })).toEqual(["SHOP-41", "SHOP-56", "SHOP-60"]);
  expect(run({ mine: true })).toEqual(["SHOP-41", "SHOP-57", "SHOP-60"]);
  expect(run({ state: "working" })).toEqual(["SHOP-41", "SHOP-58"]);
  expect(run({ state: "open" })).toHaveLength(5);
  expect(run({ label: "auto" })).toEqual(["SHOP-41", "SHOP-56"]);
  expect(run({ type: "feature" })).toEqual(["SHOP-56", "SHOP-57"]);
});

test("filters AND each other and the / text", () => {
  expect(run({ needsMe: true, mine: true })).toEqual(["SHOP-41", "SHOP-60"]);
  expect(run({ needsMe: true, mine: true, state: "review" })).toEqual(["SHOP-60"]);
  expect(run({ label: "auto", type: "bug" })).toEqual(["SHOP-41"]);
  const l = listForFilter({ ...DEFAULT_FILTER, mine: true, type: "bug" });
  const rows = applyFilter(records, { ...DEFAULT_FILTER, mine: true, type: "bug" }, { user });
  expect(ids(runList(l.def, rows, { args: l.args, exposed: "shop-60" }).rows)).toEqual(["SHOP-60"]);
});

test("isActive and clearFilter", () => {
  expect(currentFilter()).toEqual(DEFAULT_FILTER);
  expect(DEFAULT_FILTER).toEqual({
    needsMe: false,
    mine: false,
    state: "open",
    label: null,
    type: null,
  });
  expect(isActive(DEFAULT_FILTER, user)).toBe(false);
  for (const p of [
    { needsMe: true },
    { mine: true },
    { state: "plan" },
    { state: "closed" },
    { label: "ui" },
    { type: "bug" },
  ])
    expect(isActive({ ...DEFAULT_FILTER, ...p }, user)).toBe(true);
  setFilter({ needsMe: true });
  setFilter({ label: "ui" });
  expect(currentFilter()).toEqual({ ...DEFAULT_FILTER, needsMe: true, label: "ui" });
  expect(env.shared["bakers.filter"]).toEqual({ ...DEFAULT_FILTER, needsMe: true, label: "ui" });
  clearFilter();
  expect(currentFilter()).toEqual(DEFAULT_FILTER);
});

test("counts: Needs me, Mine, Open, each state, label and type", () => {
  const today = {
    needsMe: 3,
    mine: 3,
    open: 5,
    states: { qualification: 1, plan: 1, working: 2, review: 1 },
    labels: { Question: 1, auto: 2, ui: 1 },
    types: { bug: 2, chore: 1, feature: 2 },
  };
  expect(counts(records, user)).toEqual(today);
  expect(counts(records, user, DEFAULT_FILTER)).toEqual(today);
});

test("Mine counts 0 under Needs me when none of my tickets needs me", () => {
  const recs = [
    rec("SHOP-70", "working", { assignee: "pg" }),
    rec("SHOP-71", "plan", { why: "Plan ready for approval", assignee: "jo" }),
  ];
  const f = { ...DEFAULT_FILTER, needsMe: true, mine: true };
  expect(counts(recs, user, f).mine).toBe(0);
  expect(applyFilter(recs, f, { user })).toHaveLength(0);
});

test("a toggle counts with the other active parts", () => {
  expect(counts(records, user, { ...DEFAULT_FILTER, mine: true }).needsMe).toBe(2);
  expect(counts(records, user, { ...DEFAULT_FILTER, needsMe: true }).mine).toBe(2);
});

test("State, Label and Type entries count with the other active parts", () => {
  const byNeedsMe = counts(records, user, { ...DEFAULT_FILTER, needsMe: true });
  expect(byNeedsMe.open).toBe(3);
  expect(byNeedsMe.states).toEqual({ qualification: 0, plan: 1, working: 1, review: 1 });
  expect(counts(records, user, { ...DEFAULT_FILTER, type: "feature" }).labels).toEqual({
    Question: 0,
    auto: 1,
    ui: 0,
  });
  expect(counts(records, user, { ...DEFAULT_FILTER, label: "auto" }).types).toEqual({
    bug: 1,
    chore: 0,
    feature: 1,
  });
});

test("with Needs me and Mine on, every count is what its choice shows", () => {
  const f = { ...DEFAULT_FILTER, needsMe: true, mine: true, state: "open" };
  const n = counts(records, user, f);
  const shown = (patch: any) => {
    const g = { ...f, ...patch };
    const l = listForFilter(g);
    return runList(l.def, applyFilter(records, g, { user }), { args: l.args }).total;
  };
  const { labels, types } = choices(records);
  const pairs: [number | null, any][] = [
    [n.needsMe, { needsMe: true }],
    [n.mine, { mine: true }],
    [n.open, { state: "open" }],
    ...Object.entries(n.states).map(([s, c]): [number, any] => [c as number, { state: s }]),
    ...labels.map((v: string): [number, any] => [n.labels[v], { label: v }]),
    ...types.map((v: string): [number, any] => [n.types[v], { type: v }]),
  ];
  for (const [count, patch] of pairs) expect([patch, count]).toEqual([patch, shown(patch)]);
});

// HERDRAPP-23: the menus offer the workspace's catalog, also values no open ticket carries.
const catalog = { labels: ["auto", "human-review", "idea"], types: ["bug", "idea"], error: null };

test("choices: the catalog's labels and types with the open tickets' own, sorted once each", () => {
  expect(choices(records, catalog)).toEqual({
    labels: ["auto", "human-review", "idea", "Question", "ui"],
    types: ["bug", "chore", "feature", "idea"],
  });
  expect(choices(records, null)).toEqual(choices(records));
});

test("counts: a catalog value no open ticket carries counts 0, under the same rule", () => {
  const n = counts(records, user, DEFAULT_FILTER, catalog);
  expect(n.labels).toEqual({ Question: 1, auto: 2, "human-review": 0, idea: 0, ui: 1 });
  expect(n.types).toEqual({ bug: 2, chore: 1, feature: 2, idea: 0 });
  const byType = counts(records, user, { ...DEFAULT_FILTER, type: "feature" }, catalog);
  expect(byType.labels).toEqual({ Question: 0, auto: 1, "human-review": 0, idea: 0, ui: 0 });
});

test("Recently closed keeps today's counts", () => {
  expect(counts(records, user, { ...DEFAULT_FILTER, state: "closed", needsMe: true })).toEqual(
    counts(records, user),
  );
  expect(counts(records, null, { ...DEFAULT_FILTER, needsMe: true }).mine).toBeNull();
});

test("closed runs the server list: 50 per page, newest closing first", () => {
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

test("without the signed-in user Mine counts null and does not filter", () => {
  expect(counts(records, null).mine).toBeNull();
  expect(run({ mine: true }, null)).toEqual(run({}, null));
  expect(isActive({ ...DEFAULT_FILTER, mine: true }, null)).toBe(false);
  expect(isActive({ ...DEFAULT_FILTER, mine: true }, user)).toBe(true);
});

test("choices: distinct values, sorted", () => {
  expect(choices(records)).toEqual({
    labels: ["auto", "Question", "ui"],
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

test("Mine matches the assignee by either of the user's names", () => {
  // The list's assignee is the account name ("pg"); the profile may show a display name.
  const byAccount = { uuid: "u1", name: "Pascal Glass", names: ["Pascal Glass", "pg"] };
  expect(run({ mine: true }, byAccount)).toEqual(["SHOP-41", "SHOP-57", "SHOP-60"]);
  expect(counts(records, byAccount).mine).toBe(3);
  const byDisplay = { uuid: "u2", name: "jo", names: ["jo", "Jo Doe"] };
  const withDisplay = [...records, rec("SHOP-61", "plan", { assignee: "Jo Doe" })];
  expect(
    ids(applyFilter(withDisplay, { ...DEFAULT_FILTER, mine: true }, { user: byDisplay })),
  ).toEqual(["SHOP-56", "SHOP-61"]);
  expect(counts(withDisplay, byDisplay).mine).toBe(2);
});

// Review R4: "Question" sorts among the lowercase labels, not before them.
test("choices sort without regard to case", () => {
  expect(
    choices([], { labels: ["idea", "Question", "auto"], types: ["bug", "Chore"], error: null }),
  ).toEqual({
    labels: ["auto", "idea", "Question"],
    types: ["bug", "Chore"],
  });
});

// Developer live check: Herdr runs the mod in QuickJS, whose localeCompare ignores the locale and
// its options and compares code points, so "Question" still came first there.
test("choices sort without regard to case also where localeCompare ignores its options", () => {
  const original = String.prototype.localeCompare;
  String.prototype.localeCompare = function (this: string, other: string) {
    return this < other ? -1 : this > other ? 1 : 0;
  };
  try {
    expect(
      choices([], { labels: ["idea", "Question", "auto"], types: ["bug", "Chore"], error: null }),
    ).toEqual({ labels: ["auto", "idea", "Question"], types: ["bug", "Chore"] });
  } finally {
    String.prototype.localeCompare = original;
  }
});
