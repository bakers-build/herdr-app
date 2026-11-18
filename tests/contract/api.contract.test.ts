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

  test("projects: the list and one project", async () => {
    const list = await projects.listProjects();
    expect(list.map((p: any) => p.id)).toContain(PROJECT);
    expect((await projects.readProject(PROJECT)).id).toBe(PROJECT);
  });
});
