// The mod's reads (core/api.js through the repositories) against the real bakers server,
// seeded with its e2e test world. Runs only from tests/contract/run.ts (bun run
// test:contract), which sets BAKERS_CONTRACT_*; a plain `bun test` skips it.
import { beforeAll, describe, expect, test } from "bun:test";

const URL = process.env.BAKERS_CONTRACT_URL ?? "";
const KEY = process.env.BAKERS_CONTRACT_KEY ?? "";
const PROJECT = process.env.BAKERS_CONTRACT_PROJECT ?? "";
const TICKET = process.env.BAKERS_CONTRACT_TICKET ?? "";

// The harness replaces the global fetch with a stub; keep the real one for the server.
const realFetch = globalThis.fetch;
const { env } = await import("../harness");
const api: any = await import("../../mods/bakers/core/api.js");
const tickets: any = await import("../../mods/bakers/ticket/repository.js");
const projects: any = await import("../../mods/bakers/project/repository.js");

/** What `bakers auth token` does: the key's client credentials for an access token. */
async function token() {
  const [id, secret] = [KEY.slice(0, KEY.indexOf(":")), KEY.slice(KEY.indexOf(":") + 1)];
  const r = await realFetch(`${URL}/oauth/token`, {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: id,
      client_secret: secret,
    }),
  });
  if (!r.ok) throw new Error(`token: HTTP ${r.status}`);
  const t: any = await r.json();
  return { base_url: URL, token: t.access_token, token_type: "Bearer" };
}

describe.skipIf(!URL)("contract with the bakers server", () => {
  beforeAll(() => {
    api._resetForTests();
    env.fetch = (url: string, opts?: any) => realFetch(url, opts);
    env.exec = async (_cmd: string, argv: string[]) => {
      if (argv[0] === "auth" && argv[1] === "token")
        return { code: 0, stdout: JSON.stringify(await token()), stderr: "" };
      return { code: 1, stdout: "", stderr: `unexpected bakers ${argv.join(" ")}` };
    };
  });

  test("a boolean filter is sent as 1/0, which the server applies", async () => {
    const open = await api.search("bb_ticket", "bb_ticket", {
      filter: [["closed", "=", false]],
      limit: 50,
    });
    const closed = await api.search("bb_ticket", "bb_ticket", {
      filter: [["closed", "=", true]],
      limit: 50,
    });
    expect(open.length).toBeGreaterThan(0);
    expect(closed.length).toBeGreaterThan(0);
    expect(open.every((t: any) => t.closed === false)).toBe(true);
    expect(closed.every((t: any) => t.closed === true)).toBe(true);
  });

  test("listOpen: the project's open tickets with runs and labels", async () => {
    const list = await tickets.listOpen(PROJECT);
    expect(list.length).toBeGreaterThan(0);
    for (const t of list) {
      expect(t.closed).toBe(false);
      expect(typeof t.identifier).toBe("string");
      expect(Array.isArray(t.labels)).toBe(true);
      expect(Array.isArray(t.runs)).toBe(true);
    }
  });

  test("listOpen keeps every label and the type the server relates to a ticket", async () => {
    const { token: bearer } = await token();
    const get = async (path: string) => {
      const r = await realFetch(`${URL}/jsonapi/${path}`, {
        headers: { Authorization: `Bearer ${bearer}`, Accept: "application/vnd.api+json" },
      });
      return { status: r.status, doc: (await r.json().catch(() => null)) as any };
    };
    const q = new URLSearchParams({
      "filter[p][condition][path]": "project_id.id",
      "filter[p][condition][value]": PROJECT,
      "filter[c][condition][path]": "closed",
      "filter[c][condition][value]": "0",
      include: "runs,labels,ticket_type",
      "page[limit]": "50",
    });
    const raw = await get(`bb_ticket/bb_ticket?${q}`);
    // The raw shape, for the record (HERDRAPP-23): omitted includes and the terms' fields.
    const included = raw.doc?.included ?? [];
    const terms = included.filter((r: any) => String(r.type).startsWith("bb_term"));
    console.log(
      "HERDRAPP-23 raw listOpen:",
      JSON.stringify({
        status: raw.status,
        meta: raw.doc?.meta ?? null,
        included: [...new Set(included.map((r: any) => r.type))],
        term: terms[0] ?? null,
        labelled: (raw.doc?.data ?? [])
          .filter((t: any) => t.relationships?.labels?.data?.length)
          .map((t: any) => ({
            identifier: t.attributes.identifier,
            labels: t.relationships.labels.data,
            ticket_type: t.relationships.ticket_type?.data ?? null,
          })),
      }),
    );
    for (const bundle of ["label", "type"]) {
      const one = await get(`bb_term/${bundle}?page[limit]=2`);
      console.log(
        `HERDRAPP-23 raw bb_term/${bundle}:`,
        JSON.stringify({ status: one.status, meta: one.doc?.meta ?? null, data: one.doc?.data }),
      );
    }

    const byId = new Map((raw.doc?.data ?? []).map((t: any) => [t.id, t]));
    const list = await tickets.listOpen(PROJECT);
    for (const t of list) {
      const rel = (byId.get(t.id) as any)?.relationships;
      if (!rel) continue;
      expect(t.labels).toHaveLength(rel.labels?.data?.length ?? 0);
      if (rel.ticket_type?.data) expect(typeof t.type).toBe("string");
    }
  });

  test("sort, limit and offset page through the tickets without overlap", async () => {
    const q = { sort: "-changed", limit: 2 };
    const first = await api.search("bb_ticket", "bb_ticket", { ...q, offset: 0 });
    const second = await api.search("bb_ticket", "bb_ticket", { ...q, offset: 2 });
    expect(first).toHaveLength(2);
    expect(second).toHaveLength(2);
    expect(first.map((t: any) => t.id)).not.toContain(second[0].id);
    expect(first[0].changed >= first[1].changed).toBe(true);
    const all = await api.search("bb_ticket", "bb_ticket", { limit: 20, all: true });
    expect(all.length).toBeGreaterThan(20);
  });

  test("readTicket by UUID and by identifier give the same ticket with its includes", async () => {
    const byUuid = await tickets.readTicket(TICKET);
    const byId = await tickets.readTicket(byUuid.identifier, false);
    expect(byId.id).toBe(byUuid.id);
    expect(byUuid.id).toBe(TICKET);
    expect(Array.isArray(byUuid.comments)).toBe(true);
    expect(typeof byUuid.type === "string" || byUuid.type === null).toBe(true);
  });

  test("an IN filter on identifiers finds exactly those tickets", async () => {
    const some = await api.search("bb_ticket", "bb_ticket", { limit: 2 });
    const ids = some.map((t: any) => t.identifier);
    const found = await api.search("bb_ticket", "bb_ticket", {
      filter: [["identifier", "IN", ids]],
    });
    expect(found.map((t: any) => t.identifier).sort()).toEqual([...ids].sort());
  });

  test("ticket search, plan comments, activity and conductors read without error", async () => {
    const detail = await tickets.readTicket(TICKET);
    const hits = await tickets.searchTickets(detail.identifier.slice(0, 3), PROJECT);
    expect(Array.isArray(hits)).toBe(true);
    expect((await tickets.planComments(PROJECT)) instanceof Map).toBe(true);
    const activity = await tickets.listActivity(TICKET);
    expect(Array.isArray(activity)).toBe(true);
    const conductors = await tickets.listConductors(PROJECT);
    expect(Array.isArray(conductors)).toBe(true);
  });

  test("me names the signed-in user, whom currentUser reads", async () => {
    const uuid = await api.me();
    expect(typeof uuid).toBe("string");
    const user = await tickets.currentUser();
    expect(user?.uuid).toBe(uuid);
    expect(typeof user?.name).toBe("string");
    // Mine matches the list's assignee_name against the user's names: the seeded world assigns
    // tickets to the contract user (fixture-agent), found by the assignee reference.
    const account = await api.read("user", "user", uuid);
    expect(user.names).toContain(account.name);
    const assigned = await api.search("bb_ticket", "bb_ticket", {
      filter: [["assignee_user_id.id", "=", uuid]],
      limit: 50,
    });
    expect(assigned.length).toBeGreaterThan(0);
    for (const t of assigned) expect(user.names).toContain(t.assignee_name);
    const { applyFilter, DEFAULT_FILTER } = await import("../../mods/bakers/ticket/filter.js");
    const mine = applyFilter(
      assigned.map((t: any) => ({ id: t.identifier, assignee: t.assignee_name, why: null })),
      { ...DEFAULT_FILTER, mine: true },
      { user },
    );
    expect(mine).toHaveLength(assigned.length);
  });

  test("projects: the list and one project", async () => {
    const list = await projects.listProjects();
    expect(list.map((p: any) => p.id)).toContain(PROJECT);
    expect((await projects.readProject(PROJECT)).id).toBe(PROJECT);
  });
});
