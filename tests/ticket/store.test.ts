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
    listOpen: async (p: string, tabs: string[] = []) => {
      calls.push(["list", p, ...tabs].join(" "));
      return rows.map((r) => ({ ...r, runs: [] }));
    },
    listRuns: async (p: string, tabs: string[] = []) => {
      calls.push(["runs", p, ...tabs].join(" "));
      return new Map(Object.entries(details).map(([id, d]) => [id, d.runs]));
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

test("a refresh is one list, one runs and one plan read, no read per ticket", async () => {
  const api = fakeApi();
  const store = createStore(api, { now: () => NOW });
  await store.load("p1");
  expect(api.calls).toEqual(["list p1", "runs p1", "plans p1"]);
});

test("a refresh asks for the open tickets together with the tickets of the open tabs", async () => {
  const api = fakeApi();
  const store = createStore(api, { now: () => NOW, tabs: () => ["SHOP-49", "SHOP-41"] });
  await store.load("p1");
  expect(api.calls).toEqual(["list p1 SHOP-49 SHOP-41", "runs p1 SHOP-49 SHOP-41", "plans p1"]);
});

test("the runs read apart are joined to their tickets: active run, since and why as before", async () => {
  const store = createStore(fakeApi(), { now: () => NOW });
  await store.load("p1");
  expect(store.tickets.find((t: any) => t.id === "u41").runs).toEqual(details.u41.runs);
  expect(store.tickets.find((t: any) => t.id === "u56").runs).toEqual([]);
  const r41 = store.byId("SHOP-41");
  expect(r41.run).toEqual(details.u41.runs[0]);
  expect(r41.since).toBe(NOW - 35 * 60000);
  expect(store.byId("SHOP-60").run).toBeNull();
  expect(store.needs()).toEqual({ count: 3, ids: ["SHOP-60", "SHOP-41", "SHOP-56"] });
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
      return rows.map((r) => ({ ...r, runs: [] }));
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

test("a record carries the ticket's type", async () => {
  const api = fakeApi({
    listOpen: async () => [{ ...rows[0], type: "bug", runs: [] }],
  });
  const store = createStore(api, { now: () => NOW });
  await store.load("p1");
  expect(store.records()[0].type).toBe("bug");
});

test("load reads the signed-in user once per project, after the first refresh", async () => {
  const calls: string[] = [];
  const api = fakeApi({
    currentUser: async () => {
      calls.push("user");
      return { uuid: "me", name: "Pascal Glass" };
    },
  });
  const store = createStore(api, { now: () => NOW });
  expect(store.user).toBeNull();
  await store.load("p1");
  await store.load("p1");
  expect(store.user).toEqual({ uuid: "me", name: "Pascal Glass" });
  expect(calls).toEqual(["user"]);
});

test("a failing user read leaves the user null and loading intact", async () => {
  const api = fakeApi({
    currentUser: async () => {
      throw new Error("no");
    },
  });
  const store = createStore(api, { now: () => NOW });
  await store.load("p1");
  expect(store.user).toBeNull();
  expect(store.tickets.length).toBeGreaterThan(0);
});

test("a refresh retries a failed user read until a user is set, never two at once", async () => {
  let reads = 0;
  let fail = true;
  let release = () => {};
  const api = fakeApi({
    currentUser: async () => {
      reads++;
      if (fail) throw new Error("transient");
      await new Promise<void>((r) => (release = r));
      return { uuid: "me", name: "Pascal Glass", names: ["Pascal Glass"] };
    },
  });
  const store = createStore(api, { now: () => NOW });
  let notified = 0;
  store.onChange(() => notified++);
  await store.load("p1");
  expect(store.user).toBeNull();
  expect(reads).toBe(1);
  fail = false;
  const first = store.refresh();
  const second = store.refresh(); // while the retry is still reading
  await new Promise((r) => setTimeout(r, 0));
  expect(reads).toBe(2);
  release();
  await Promise.all([first, second]);
  expect(store.user).toEqual({ uuid: "me", name: "Pascal Glass", names: ["Pascal Glass"] });
  const before = notified;
  await store.refresh();
  expect(reads).toBe(2); // set for the project: no more reads
  expect(notified).toBe(before + 1);
});

test("a user read finishing after a project switch is not kept for the new project", async () => {
  const pending: ((u: any) => void)[] = [];
  const api = fakeApi({
    currentUser: () => new Promise((r) => pending.push(r)),
  });
  const store = createStore(api, { now: () => NOW });
  const first = store.load("p1");
  await new Promise((r) => setTimeout(r, 0));
  const second = store.load("p2");
  await new Promise((r) => setTimeout(r, 0));
  const p1 = pending.shift(); // the read started for p1
  for (const r of pending) r(null);
  await new Promise((r) => setTimeout(r, 0));
  p1?.({ uuid: "me", name: "Old", names: ["Old"] });
  await Promise.all([first, second]);
  expect(store.project).toBe("p2");
  expect(store.user).toBeNull();
});

test("a refresh of the detail keeps a body the user already opened", async () => {
  const store = createStore(
    fakeApi({
      readTicket: async () => ({
        id: "u41",
        identifier: "SHOP-41",
        runs: [],
        comments: [
          { id: "p0", type: "plan", created: "2026-01-01T10:00:00Z", body: "", loaded: false },
        ],
      }),
    }),
    { now: () => NOW },
  );
  const first = await store.ticket("u41");
  first.comments[0].body = "Older plan text";
  first.comments[0].loaded = true;
  const again = await store.ticket("u41");
  expect(again.comments[0]).toMatchObject({ body: "Older plan text", loaded: true });
  expect(store.cached("u41").comments[0].body).toBe("Older plan text");
});

// HERDRAPP-23: the workspace catalog (labels, types) loads with the tickets, apart from them.
test("a refresh reads the project's catalog with the tickets and keeps it", async () => {
  const api = fakeApi({
    listCatalog: async (p: string) => {
      api.calls.push(`catalog ${p}`);
      return { labels: ["auto", "idea"], types: ["bug"] };
    },
  });
  const store = createStore(api, { now: () => NOW });
  expect(store.catalog).toBeNull();
  await store.load("p1");
  await store.catalogRead;
  expect(api.calls).toEqual(["list p1", "runs p1", "plans p1", "catalog p1"]);
  expect(store.catalog).toEqual({
    labels: ["auto", "idea"],
    types: ["bug"],
    names: {},
    error: null,
  });
});

test("a failing catalog read keeps its error and leaves the tickets loading", async () => {
  const api = fakeApi({
    listCatalog: async () => {
      throw new Error("HTTP 403");
    },
  });
  const store = createStore(api, { now: () => NOW });
  await store.load("p1");
  await store.catalogRead;
  expect(store.error).toBeNull();
  expect(store.records().length).toBe(6);
  expect(store.catalog.labels).toEqual([]);
  expect(store.catalog.types).toEqual([]);
  expect(store.catalog.error.message).toBe("HTTP 403");
});

test("a project switch forgets the old project's catalog, and drops it when it lands late", async () => {
  const gates: Record<string, () => void> = {};
  const api = fakeApi({
    listCatalog: async (p: string) => {
      await new Promise<void>((r) => (gates[p] = r));
      return { labels: [p], types: [] };
    },
  });
  const store = createStore(api, { now: () => NOW });
  await store.load("p1");
  const p1 = store.catalogRead;
  await store.load("p2");
  expect(store.catalog).toBeNull();
  gates.p2();
  await store.catalogRead;
  expect(store.catalog.labels).toEqual(["p2"]);
  gates.p1();
  await p1;
  expect(store.catalog.labels).toEqual(["p2"]);
});

test("a slow catalog read holds back neither the tickets nor the listeners", async () => {
  let release = () => {};
  const landed: string[] = [];
  const api = fakeApi({
    listCatalog: async () => {
      await new Promise<void>((r) => (release = r));
      return { labels: ["auto"], types: [], names: { "l-auto": "auto" } };
    },
    listOpen: async () => [{ ...rows[1], labels: [], unnamed: { labels: ["l-auto"], type: null } }],
  });
  const store = createStore(api, { now: () => NOW, onCatalog: () => landed.push("catalog") });
  let fired = 0;
  store.onChange(() => fired++);
  const loaded = await Promise.race([
    store.load("p1").then(() => "loaded"),
    new Promise((r) => setTimeout(() => r("held back"), 50)),
  ]);
  expect(loaded).toBe("loaded");
  expect(fired).toBe(1);
  expect(store.records()[0].labels).toEqual([]);
  release();
  await store.catalogRead;
  expect(fired).toBe(2);
  expect(landed).toEqual(["catalog"]);
  expect(store.records()[0].labels).toEqual(["auto"]);
});

test("a failed catalog read keeps the project's last good catalog", async () => {
  let fail = false;
  const api = fakeApi({
    listCatalog: async () => {
      if (fail) throw new Error("HTTP 502");
      return { labels: ["auto"], types: ["bug"], names: { l1: "auto" } };
    },
  });
  const store = createStore(api, { now: () => NOW });
  await store.load("p1");
  await store.catalogRead;
  fail = true;
  await store.refresh();
  await store.catalogRead;
  expect(store.catalog).toEqual({
    labels: ["auto"],
    types: ["bug"],
    names: { l1: "auto" },
    error: null,
  });
});

test("a catalog landing after a panel read names the cached detail's terms too", async () => {
  let release = () => {};
  const api = fakeApi({
    listCatalog: async () => {
      await new Promise<void>((r) => (release = r));
      return { labels: ["auto"], types: ["bug"], names: { "l-auto": "auto", "t-bug": "bug" } };
    },
    readTicket: async () => ({
      ...rows[1],
      labels: [],
      type: null,
      unnamed: { labels: ["l-auto"], type: "t-bug" },
      comments: [],
      runs: [],
    }),
  });
  const store = createStore(api, { now: () => NOW });
  await store.load("p1");
  await store.enrich(rows[1].id, true);
  expect(store.cached(rows[1].id).ticket.labels).toEqual([]);
  release();
  await store.catalogRead;
  expect(store.cached(rows[1].id).ticket.labels).toEqual(["auto"]);
  expect(store.cached(rows[1].id).ticket.type).toBe("bug");
});
