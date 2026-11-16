import { beforeEach, expect, test } from "bun:test";
import { reset } from "../harness";

const { createStore } = await import("../../mods/bakers/ticket/store.js");
const { deriveWhy } = await import("../../mods/bakers/ticket/rules.js");
const format = await import("../../mods/bakers/core/format.js");

beforeEach(reset);

const NOW = Date.parse("2026-11-15T12:00:00Z");
const ago = (min: number) => new Date(NOW - min * 60000).toISOString();

const rows = [
  {
    id: "u41",
    identifier: "SHOP-41",
    title: "Checkout fails with an empty cart",
    state: "working",
    labels: ["Question", "checkout"],
    frozen: true,
    frozen_at: ago(35),
    closed: false,
  },
  {
    id: "u56",
    identifier: "SHOP-56",
    title: "Show delivery date on the product page",
    state: "plan",
    labels: [],
    frozen: false,
    frozen_at: null,
    closed: false,
  },
  {
    id: "u60",
    identifier: "SHOP-60",
    title: "Review me",
    state: "review",
    labels: [],
    frozen: false,
    frozen_at: null,
    closed: false,
  },
  {
    id: "u61",
    identifier: "SHOP-61",
    title: "Qualify me",
    state: "qualification",
    labels: [],
    frozen: false,
    frozen_at: null,
    closed: false,
  },
  {
    id: "u62",
    identifier: "SHOP-62",
    title: "Working quietly",
    state: "working",
    labels: [],
    frozen: false,
    frozen_at: null,
    closed: false,
  },
  {
    id: "u49",
    identifier: "SHOP-49",
    title: "Old one",
    state: "done",
    labels: [],
    frozen: false,
    frozen_at: null,
    closed: true,
  },
];

const details: Record<string, any> = {
  u41: {
    ticket: { ...rows[0], type: "bug", comments: [] },
    runs: [
      {
        uuid: "r1",
        state: "running",
        agent: "claude",
        started_at: (NOW - 60 * 60000) / 1000,
        closed: false,
      },
    ],
  },
  u56: {
    ticket: { ...rows[1], comments: [{ type: "plan", body: "Plan", created: ago(12) }] },
    runs: [],
  },
  u60: {
    ticket: { ...rows[2], comments: [] },
    runs: [
      {
        uuid: "r2",
        state: "done",
        agent: "claude",
        started_at: (NOW - 120 * 60000) / 1000,
        closed: true,
      },
    ],
  },
  u61: { ticket: { ...rows[3], comments: [] }, runs: [] },
  u62: {
    ticket: { ...rows[4], comments: [] },
    runs: [
      {
        uuid: "r3",
        state: "running",
        agent: "codex",
        started_at: (NOW - 5 * 60000) / 1000,
        closed: false,
      },
    ],
  },
};

function fakeApi(over: any = {}) {
  const calls: string[] = [];
  const api = {
    calls,
    listOpen: async (p: string) => {
      calls.push(`list ${p}`);
      return rows.map((r) => ({ ...r, runs: details[r.id]?.runs ?? [] }));
    },
    planComments: async (p: string) => {
      calls.push(`plans ${p}`);
      const plans = new Map<string, any[]>();
      for (const [id, d] of Object.entries(details)) {
        const list = (d.ticket.comments ?? []).filter((c: any) => c.type === "plan");
        if (list.length) plans.set(id, list);
      }
      return plans;
    },
    readTicket: async (id: string) => {
      calls.push(`read ${id}`);
      return { ...details[id].ticket, runs: details[id].runs };
    },
    ...over,
  };
  return api;
}

test("deriveWhy follows the needs-you table", () => {
  expect(deriveWhy({ state: "working", frozen: true, labels: ["Question"] }, [], [])).toBe(
    "Asked a question",
  );
  expect(deriveWhy({ state: "plan", frozen: false, labels: [] }, [{ type: "plan" }], [])).toBe(
    "Plan ready for approval",
  );
  expect(
    deriveWhy(
      { state: "plan", frozen: false, labels: [] },
      [{ type: "plan" }],
      [{ closed: false }],
    ),
  ).toBe(null);
  expect(deriveWhy({ state: "plan", frozen: false, labels: [] }, [], [])).toBe(null);
  expect(deriveWhy({ state: "review", frozen: false, labels: [] }, [], [])).toBe(
    "Ready for review",
  );
  expect(deriveWhy({ state: "working", frozen: true, labels: [] }, [], [])).toBe(null);
  expect(
    deriveWhy({ state: "done", closed: true, frozen: true, labels: ["Question"] }, [], []),
  ).toBe(null);
});

test("format.age", () => {
  expect(format.age(35 * 60000)).toBe("35m");
  expect(format.age(20 * 1000)).toBe("1m");
  expect(format.age(2 * 3600000 + 5)).toBe("2h");
  expect(format.age(3 * 86400000)).toBe("3d");
  expect(format.age(null)).toBe("");
});

test("records carry the derived reason, its start and the active run", async () => {
  const store = createStore(fakeApi(), { now: () => NOW });
  await store.load("p1");
  const byId = Object.fromEntries(store.records().map((r: any) => [r.id, r]));
  expect([byId["SHOP-41"].why, Math.round((NOW - byId["SHOP-41"].since) / 60000)]).toEqual([
    "Asked a question",
    35,
  ]);
  expect(byId["SHOP-41"].run).toMatchObject({ agent: "claude", state: "running" });
  expect([byId["SHOP-56"].why, Math.round((NOW - byId["SHOP-56"].since) / 60000)]).toEqual([
    "Plan ready for approval",
    12,
  ]);
  expect(byId["SHOP-60"].why).toBe("Ready for review");
  expect(byId["SHOP-61"].why).toBe(null);
  expect(byId["SHOP-49"]).toMatchObject({ closed: true, why: null });
});

test("needs() shares identifiers only, longest waiting first", async () => {
  const store = createStore(fakeApi(), { now: () => NOW });
  await store.load("p1");
  expect(store.needs()).toEqual({ count: 3, ids: ["SHOP-60", "SHOP-41", "SHOP-56"] });
});

test("a refresh is one list read and one plan read, no read per ticket", async () => {
  const api = fakeApi();
  const store = createStore(api, { now: () => NOW });
  await store.load("p1");
  expect(api.calls).toEqual(["list p1", "plans p1"]);
});

test("byId finds by identifier or uuid; onChange fires after refresh", async () => {
  const store = createStore(fakeApi(), { now: () => NOW });
  let fired = 0;
  store.onChange(() => fired++);
  await store.load("p1");
  expect(store.byId("SHOP-41").uuid).toBe("u41");
  expect(store.byId("u41").id).toBe("SHOP-41");
  expect(fired).toBe(1);
});

test("a failing refresh keeps the error and the old rows", async () => {
  let fail = false;
  const api = fakeApi({
    listOpen: async () => {
      if (fail) throw Object.assign(new Error("bakers offline: not found"), { offline: true });
      return rows.map((r) => ({ ...r, runs: details[r.id]?.runs ?? [] }));
    },
  });
  const store = createStore(api, { now: () => NOW });
  await store.load("p1");
  fail = true;
  await store.refresh();
  expect(store.error.message).toBe("bakers offline: not found");
  expect(store.records().length).toBe(6);
});

test("ticket(id) returns the detail with why and agent", async () => {
  const store = createStore(fakeApi(), { now: () => NOW });
  await store.load("p1");
  const d = await store.ticket("SHOP-41");
  expect(d.why).toBe("Asked a question");
  expect(d.ticket.type).toBe("bug");
  expect(d.runs.length).toBe(1);
  expect(d.since).toBe(NOW - 35 * 60000);
});
