// The view modes of a ticket: raw data in, props out. No elements, no calls.
import { expect, test } from "bun:test";
import "../../harness";

const P = "../../../mods/bakers/entity/ticket/presenter";
const { agentLine } = await import(`${P}/agent.js`);
const { teaser, columns, emptyHint } = await import(`${P}/teaser.js`);
const { full, needsCard } = await import(`${P}/full.js`);
const { context } = await import(`${P}/context.js`);
const { sidebarRows, railLabel, statusParts } = await import(`${P}/counts.js`);
const { notification } = await import(`${P}/notification.js`);
const { tabName } = await import(`${P}/tab.js`);
const { search } = await import(`${P}/search.js`);
const { stateItems } = await import(`${P}/states.js`);
const { viewItems, viewLabel } = await import(`${P}/views.js`);

const NOW = Date.parse("2026-11-15T12:00:00Z");
const min = (m: number) => NOW - m * 60000;
const running = { agent: "claude", state: "running", started_at: min(60) / 1000, closed: false };

test("agent line: asking, working, no run", () => {
  expect(
    agentLine(
      { run: running, why: "Asked a question", since: min(35) },
      { address: "studio-mac/t7" },
      NOW,
    ),
  ).toMatchObject({
    tone: "blocked",
    ring: false,
    text: "Claude Code needs you",
    rest: "on studio-mac, 35m",
    line: "Claude Code needs you on studio-mac, 35m",
  });
  expect(agentLine({ run: running, why: null, since: null }, { address: "t7" }, NOW).line).toBe(
    "Claude Code working on this computer, 1h",
  );
  expect(
    agentLine({ run: null, why: null, since: null, conductor: null }, null, NOW),
  ).toMatchObject({
    tone: "muted",
    ring: true,
    text: "No active run, no conductor",
    line: "No active run, no conductor",
  });
  expect(agentLine({ run: null, why: null, since: null, conductor: "c1" }, null, NOW).text).toBe(
    "No active run",
  );
});

test("teaser: the agent cell names the claiming machine, as drawn", () => {
  const r = {
    id: "SHOP-41",
    title: "T",
    state: "working",
    why: "Asked a question",
    since: min(35),
    run: running,
    machine: "studio-mac",
  };
  expect(teaser(r, { view: "needs-me", selected: false, now: NOW }).cells[3]).toEqual({
    status: { tone: "blocked", ring: false, text: "Claude Code needs you, studio-mac" },
  });
});

test("teaser: the five cells of a Needs me row", () => {
  const r = {
    id: "SHOP-41",
    title: "Checkout fails with an empty cart",
    state: "working",
    why: "Asked a question",
    since: min(35),
    run: running,
  };
  expect(teaser(r, { view: "needs-me", selected: true, now: NOW })).toEqual({
    key: "SHOP-41",
    selected: true,
    cells: [
      { text: "SHOP-41", mono: true },
      { text: "Checkout fails with an empty cart", truncate: true },
      { text: "Asked a question", tone: "blocked", strong: true },
      { status: { tone: "blocked", ring: false, text: "Claude Code needs you" } },
      { text: "35m", tone: "muted", size: 12 },
    ],
  });
  expect(teaser(r, { view: "open", selected: false, now: NOW }).cells[2]).toEqual({
    text: "working",
    tone: "muted",
  });
});

test("teaser: columns and hints", () => {
  expect(columns("needs-me").map((c: any) => [c.label, c.w])).toEqual([
    ["TICKET", 76],
    ["TITLE", null],
    ["WHY", 170],
    ["AGENT", 150],
    ["AGE", 44],
  ]);
  expect(columns("open")[2].label).toBe("STATE");
  expect(emptyHint("needs-me", "")).toBe(
    "Nothing else needs you. Switch the view for Mine or Open by state.",
  );
  expect(emptyHint("open", "deliv")).toBe('Nothing else matches "deliv".');
});

const detail = {
  ticket: {
    identifier: "SHOP-41",
    state: "working",
    frozen: true,
    frozen_at: new Date(min(35)).toISOString(),
    title: "T",
    description: "D",
    type: "bug",
    recipe: "matt",
    labels: ["Question"],
    branch_name: "b",
    assignee: "cw",
    reviewers: [],
    links: [{ uri: "u", title: "MR !91" }],
    conductor: "c1",
  },
  comments: [
    {
      id: "p1",
      type: "plan",
      author: "Claude Code",
      created: new Date(min(120)).toISOString(),
      body: "## Plan\n\nMore.",
    },
    {
      id: "q1",
      type: "question",
      author: "Claude Code",
      created: new Date(min(35)).toISOString(),
      body: "Redirect or page?",
    },
  ],
  runs: [running],
  why: "Asked a question",
  since: min(35),
};

test("full: header, card and comments", () => {
  const vm = full(detail, { terminal: null, now: NOW });
  expect(vm).toMatchObject({
    id: "SHOP-41",
    state: "working",
    frozen: true,
    title: "T",
    commentsHeading: "Comments 2, newest last",
  });
  expect(vm.agent.line).toBe("Claude Code needs you, 35m");
  expect(vm.needs).toEqual({
    kind: "question",
    label: "NEEDS YOU",
    title: "Asked a question, 35m ago",
    text: "Redirect or page?",
    hint: "A acts on this card",
  });
  expect(vm.comments.map((c: any) => [c.meta, c.foldable, c.firstLine, c.marked])).toEqual([
    [["Claude Code", "plan", "2h"], true, "Plan", false],
    [["Claude Code", "question", "35m"], false, "Redirect or page?", true],
  ]);
  expect(needsCard({ ...detail, why: null }, NOW)).toBe(null);
  expect(
    needsCard({ ...detail, why: "Plan ready for approval", since: min(12) }, NOW),
  ).toMatchObject({ kind: "plan", title: "Plan ready for approval, 12m ago", text: "Plan" });
});

test("context: the panel's sections", () => {
  const vm = context(detail, { terminal: null, now: NOW, activity: null, activityServed: false });
  expect(vm.sub).toBe("working, frozen");
  expect(vm.agent).toMatchObject({
    text: "Claude Code needs you",
    rest: "35m",
    show: "The run's terminal is not on this computer",
    cancel: null,
    hint: "R moves, G shows the agent.",
  });
  expect(vm.properties).toEqual({
    type: "bug",
    recipe: "matt",
    labels: ["Question"],
    frozen: { text: "Yes, 35m", form: "unfreeze", label: "Unfreeze..." },
    assignee: "cw",
    reviewers: "-",
    branch: "b",
    parent: null,
    link: { title: "MR !91", uri: "u" },
  });
  expect(vm.activity).toEqual({ api: true, items: [] });
  const withActivity = context(detail, {
    terminal: null,
    now: NOW,
    activityServed: true,
    activity: [
      {
        kind: "status_changed",
        previous: "qualification",
        next: "working",
        created: new Date(min(60)).toISOString(),
      },
      { kind: "claimed", step: "working", created: new Date(min(60)).toISOString() },
      { kind: "created", actor: "pg", created: new Date(min(180)).toISOString() },
      { kind: "review_requested", created: new Date(min(5)).toISOString() },
    ],
  });
  expect(withActivity.activity).toEqual({
    api: false,
    items: [
      { text: "qualification to working", age: "1h" },
      { text: "Run started, working", age: "1h" },
      { text: "Created by pg", age: "3h" },
      { text: "Review requested", age: "5m" },
    ],
  });
  expect(vm.runs).toEqual([{ state: "running", agent: "Claude Code", age: "1h" }]);
});

test("counts: sidebar rows, rail and status", () => {
  const rows = sidebarRows(
    { needsMe: 2, open: 6, byState: { qualification: 2, plan: 1, working: 3 }, recentlyClosed: 4 },
    "needs-me",
  );
  expect(rows.map((r: any) => [r.label, r.count, r.selected])).toEqual([
    ["Needs me", 2, true],
    ["Mine", null, false],
    ["Open by state", 6, false],
    ["Qualification", 2, false],
    ["Plan", 1, false],
    ["Working", 3, false],
    ["Review", 0, false],
    ["Recently closed", 4, false],
  ]);
  expect(rows[7]).toMatchObject({ dim: true });
  expect(rows[7].api).toBeUndefined();
  expect(railLabel(2)).toEqual({
    text: "b 2",
    aria: "bakers, 2 tickets need you",
    tone: "blocked",
  });
  expect(
    statusParts({ project: "acme-shop", count: 2, updated: min(1), failure: null, now: NOW }),
  ).toEqual([
    { text: "acme-shop" },
    { text: "2 need you", tone: "blocked", strong: true },
    { text: "updated 1m ago" },
  ]);
  expect(
    statusParts({
      project: null,
      count: 0,
      updated: null,
      failure: { kind: "offline", message: "x" },
      now: NOW,
    }),
  ).toEqual([{ text: "bakers offline" }]);
});

test("notification, tab name, search result, state menu, view names", () => {
  expect(notification("SHOP-41", detail.comments)).toEqual({
    title: "SHOP-41 asks a question",
    body: "Redirect or page?",
    level: "warning",
    action: { name: "bakers.open", args: { ticket: "SHOP-41" } },
  });
  expect(tabName({ id: "SHOP-41", state: "working" })).toBe("SHOP-41 working");
  expect(tabName({ id: "SHOP-49", state: "done" })).toBe("SHOP-49 closed");
  expect(search({ identifier: "SHOP-38", title: "Slots", state: "done" })).toEqual({
    id: "SHOP-38",
    title: "Slots",
    state: "done",
    closed: true,
  });
  expect(stateItems("SHOP-56", "plan").map((i: any) => i.label)).toEqual([
    "Qualification...",
    "Plan",
    "Working...",
    "Review...",
    "Done...",
    "Cancelled...",
  ]);
  expect(stateItems("SHOP-56", "plan")[2].action).toEqual([
    "form.open",
    "state",
    { ticket: "SHOP-56", from: "plan", to: "working" },
  ]);
  expect(viewLabel("state:working")).toBe("Working");
  expect(viewItems("open").find((i: any) => i.current).label).toBe("Open by state");
});
