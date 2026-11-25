// The view modes of a ticket: raw data in, props out. No elements, no calls.
import { expect, test } from "bun:test";
import "../harness";

const P = "../../mods/bakers/ticket/presenter";
const { agentLine } = await import(`${P}/field/agent-line.js`);
const { card, KEY_HINT } = await import(`${P}/card.js`);
const { full, needsCard } = await import(`${P}/full.js`);
const { context } = await import(`${P}/context.js`);
const { railLabel, statusParts } = await import(`${P}/counts.js`);
const { notification } = await import(`${P}/notification.js`);
const { search } = await import(`${P}/search.js`);
const { stateItems } = await import("../../mods/bakers/ticket/operations/state.js");

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

const base = {
  id: "SHOP-41",
  title: "Checkout fails with an empty cart",
  state: "working",
  type: "bug",
  labels: ["auto", "ui"],
  assignee: "pg",
  why: null,
  since: min(120),
  run: null,
  conductor: "c1",
};

test("card: the fields in the order of the rows", () => {
  const vm = card(
    { ...base, why: "Asked a question", since: min(35), run: running },
    { selected: true, now: NOW },
  );
  expect(Object.keys(vm)).toEqual([
    "key",
    "selected",
    "id",
    "state",
    "type",
    "age",
    "title",
    "why",
    "labels",
    "assignee",
    "agent",
  ]);
  expect(vm).toEqual({
    key: "SHOP-41",
    selected: true,
    id: "SHOP-41",
    state: "working",
    type: "bug",
    age: "35m",
    title: "Checkout fails with an empty cart",
    why: "Asked a question",
    labels: ["auto", "ui"],
    assignee: "pg",
    agent: { tone: "blocked", ring: false, text: "Claude Code needs you" },
  });
});

test("card: why only when it needs you; the agent text names the machine", () => {
  const quiet = card(base, { selected: false, now: NOW });
  expect(quiet.why).toBeNull();
  expect(quiet.agent).toEqual({ tone: "muted", ring: true, text: "No active run" });
  expect(quiet.age).toBe("2h");
  const r = { ...base, run: running, machine: "studio-mac" };
  expect(card(r, { selected: false, now: NOW }).agent).toEqual({
    tone: "working",
    ring: false,
    text: "Claude Code working, studio-mac",
  });
  expect(
    card({ ...base, since: null, type: null, assignee: null }, { selected: false, now: NOW }),
  ).toMatchObject({ age: "", type: "", assignee: "" });
  expect(KEY_HINT).toContain("The filter bar narrows the list");
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

test("full: the header names the newest open run, as the list and the panel do", () => {
  const older = { agent: "claude", state: "running", started_at: min(90) / 1000, closed: false };
  const newer = { agent: "codex", state: "running", started_at: min(10) / 1000, closed: false };
  for (const runs of [
    [older, newer],
    [newer, older],
  ]) {
    const d = { ...detail, runs, why: null, since: null };
    expect(full(d, { terminal: null, now: NOW }).agent.line).toBe("Codex working, 10m");
  }
});

test("context: the panel's sections", () => {
  const vm = context(detail, {
    terminal: null,
    reason: "No live run terminal",
    now: NOW,
    activity: null,
    activityServed: false,
  });
  expect(vm.sub).toBe("working, frozen");
  expect(vm.agent).toMatchObject({
    text: "Claude Code needs you",
    rest: "35m",
    show: "No live run terminal",
    cancel: null,
    hint: "R moves, G shows the agent.",
  });
  expect(vm.properties).toEqual({
    type: "bug",
    recipe: "matt",
    labels: ["Question"],
    labelsLocked: false,
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

test("counts: rail and status", () => {
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

const { ticketActions } = await import("../../mods/bakers/ticket/operations/actions.js");
const { moreItems } = await import("../../mods/bakers/ticket/operations/more.js");
const withRuns = (o: any = {}) => ({
  ticket: { identifier: "SHOP-41", frozen: false, ...o },
  runs: o.runs ?? [],
});

test("ticketActions: the six actions with keys, reasons and actions", () => {
  const a = ticketActions(withRuns({ runs: [{ closed: false }] }), null);
  expect(a.map((x: any) => x.label)).toEqual([
    "Show agent",
    "Change state...",
    "Move to...",
    "Freeze...",
    "Cancel run...",
    "Copy identifier",
  ]);
  expect(a.map((x: any) => x.keys ?? null)).toEqual(["G", null, "R", null, null, null]);
  expect(a[0].action).toEqual(["ticket.showAgent", "SHOP-41"]);
  expect(a[1]).toMatchObject({ key: "state", step: "state" });
  expect(a[2].action).toEqual(["ticket.move", "SHOP-41"]);
  expect(a[3].action).toEqual(["form.open", "freeze", { ticket: "SHOP-41" }]);
  expect(a[4]).toMatchObject({
    reason: null,
    action: ["form.open", "cancel", { ticket: "SHOP-41" }],
  });
  expect(a[5].action).toEqual(["copy", "SHOP-41"]);
});

test("ticketActions: frozen gives Unfreeze; no active run and no terminal give reasons", () => {
  const a = ticketActions(
    withRuns({ frozen: true, runs: [{ closed: true }] }),
    "No live run terminal",
  );
  expect(a[3]).toMatchObject({
    label: "Unfreeze...",
    action: ["form.open", "unfreeze", { ticket: "SHOP-41" }],
  });
  expect(a[0].reason).toBe("No live run terminal");
  expect(a[4].reason).toBe("No active run");
});

test("moreItems keeps its menu: Freeze, Cancel run (disabled without a run), Copy identifier", () => {
  const m = moreItems(withRuns());
  expect(m.map((i: any) => i.label)).toEqual(["Freeze...", "Cancel run...", "Copy identifier"]);
  expect(m[0].disabled).toBeFalsy();
  expect(m[1].disabled).toBe(true);
  expect(m[2]).toMatchObject({ separator: true, action: ["copy", "SHOP-41"] });
  expect(moreItems(withRuns({ runs: [{ closed: false }] }))[1].disabled).toBeFalsy();
});

test("notification, search result, state menu", () => {
  expect(notification("SHOP-41", detail.comments)).toEqual({
    title: "SHOP-41 asks a question",
    body: "Redirect or page?",
    level: "warning",
    action: { name: "bakers.open:SHOP-41" },
  });
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
});

test("context: Description, Acceptance and Summary, each editable while the ticket is open", () => {
  const o = { terminal: null, reason: null, now: NOW, activity: null, activityServed: true };
  const withAcceptance = {
    ...detail,
    comments: [
      ...detail.comments,
      { id: "a1", type: "acceptance", author: "pg", created: "1", body: "Old" },
      { id: "a2", type: "acceptance", author: "pg", created: "2", body: "New" },
    ],
  };
  expect(context(withAcceptance, o).sections).toEqual([
    { key: "description", title: "Description", body: "D", empty: null, reason: null },
    { key: "acceptance", title: "Acceptance", body: "New", empty: null, reason: null },
    { key: "summary", title: "Summary", body: "", empty: "None yet.", reason: null },
  ]);
  const closed = { ...detail, ticket: { ...detail.ticket, state: "done" } };
  expect(context(closed, o).sections.map((s: any) => s.reason)).toEqual([
    "A closed ticket cannot be changed any more.",
    "A closed ticket cannot be changed any more.",
    "A closed ticket cannot be changed any more.",
  ]);
});
