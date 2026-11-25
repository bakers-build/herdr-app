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
const { asProject }: any = await import("../../mods/bakers/project/model.js");

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

  test("ticket search, plan comments and conductors read without error", async () => {
    const detail = await tickets.readTicket(TICKET);
    const hits = await tickets.searchTickets(detail.identifier.slice(0, 3), PROJECT);
    expect(Array.isArray(hits)).toBe(true);
    const conductors = await tickets.listConductors(PROJECT);
    expect(Array.isArray(conductors)).toBe(true);
  });

  const byUuid = (a: any, b: any) => String(a.uuid ?? a.id).localeCompare(String(b.uuid ?? b.id));

  test("the sparse list keeps what the list reads, and listRuns equals include=runs", async () => {
    const list = await tickets.listOpen(PROJECT);
    expect(list.length).toBeGreaterThan(0);
    for (const t of list) {
      expect(typeof t.id).toBe("string");
      expect(typeof t.identifier).toBe("string");
      expect(typeof t.title).toBe("string");
      expect(typeof t.state).toBe("string");
      expect(t.closed).toBe(false);
      expect(typeof t.frozen).toBe("boolean");
      expect("changed" in t && "assignee" in t && "type" in t).toBe(true);
    }
    const some = list.slice(0, 25);
    const runs: Map<string, any[]> = await tickets.listRuns(PROJECT);
    const full = await api.search("bb_ticket", "bb_ticket", {
      filter: [["identifier", "IN", some.map((t: any) => t.identifier)]],
      include: ["runs"],
      limit: 50,
    });
    expect(full).toHaveLength(some.length);
    let withRuns = 0;
    for (const t of full) {
      const expected = (t.runs ?? [])
        .filter((r: any) => r.state)
        .map((r: any) => ({
          uuid: r.id,
          state: r.state,
          agent: r.agent ?? r.harness ?? null,
          started_at: r.started_at ?? null,
          closed: Boolean(r.closed),
        }))
        .sort(byUuid);
      if (expected.length) withRuns++;
      expect([...(runs.get(t.id) ?? [])].sort(byUuid)).toEqual(expected);
    }
    // The seeded world may hold no runs at all; then only the empty equivalence is proven.
    process.stdout.write(`contract: ${withRuns} of ${some.length} listed tickets have runs\n`);
  });

  test("the bb_run search by project, closed and identifier with a fieldset is accepted", async () => {
    const list = await tickets.listOpen(PROJECT);
    const ids = list.slice(0, 5).map((t: any) => t.identifier);
    const rows = await api.search("bb_run", "bb_run", {
      filter: [
        ["ticket_id.project_id.id", "=", PROJECT],
        ["ticket_id.closed", "=", false],
        ["ticket_id.identifier", "IN", ids],
      ],
      fields: {
        "bb_run--bb_run": ["state", "agent", "harness", "started_at", "closed", "ticket_id"],
      },
      limit: 50,
      all: true,
    });
    expect(Array.isArray(rows)).toBe(true);
    const wanted = new Set(list.slice(0, 5).map((t: any) => t.id));
    for (const r of rows) expect(wanted.has(r.ticket_id?.id)).toBe(true);
  });

  test("readTicket reads the comments apart and equal to include=comments", async () => {
    // The fixture ticket may have few comments: take the project's ticket with the most.
    const all = await api.search("bb_comment", "bb_comment", {
      filter: [["ticket_id.project_id.id", "=", PROJECT]],
      fields: { "bb_comment--bb_comment": ["bb_comment_type", "created", "ticket_id"] },
      limit: 50,
      all: true,
    });
    const count = new Map<string, number>();
    for (const c of all)
      if (c.ticket_id?.id) count.set(c.ticket_id.id, (count.get(c.ticket_id.id) ?? 0) + 1);
    const best = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? TICKET;
    process.stdout.write(`contract: comments read for a ticket with ${count.get(best) ?? 0}\n`);

    const full = await api.read("bb_ticket", "bb_ticket", best, ["comments"]);
    const part = await tickets.readTicket(full.identifier);
    const expected = (full.comments ?? []).filter((c: any) => c.created);
    expect(part.comments.map((c: any) => c.id).sort()).toEqual(
      expected.map((c: any) => c.id).sort(),
    );
    const sorted = part.comments.map((c: any) => String(c.created));
    expect(sorted).toEqual([...sorted].sort());
    const raw = new Map<string, any>(expected.map((c: any) => [c.id, c]));
    const FOLDED = ["plan", "spec", "summary"];
    for (const c of part.comments) {
      const r = raw.get(c.id);
      expect(c.type).toBe(r.bb_comment_type ?? "comment");
      expect(c.created).toBe(r.created);
      expect(c.author).toBe(r.author_name ?? "");
      if (c.loaded) expect(c.body).toBe(r.body ?? "");
      else {
        expect(c.body).toBe("");
        expect(FOLDED).toContain(c.type);
        expect(await tickets.commentBody(c.id)).toBe(r.body ?? "");
      }
    }
    // Per folded type exactly the newest is loaded, the older ones are not.
    for (const type of FOLDED) {
      const ofType = part.comments.filter((c: any) => c.type === type);
      if (!ofType.length) continue;
      expect(ofType.filter((c: any) => c.loaded).length).toBe(1);
      expect(ofType.at(-1).loaded).toBe(true);
      for (const c of ofType.slice(0, -1)) expect(c.loaded).toBe(false);
    }
    for (const c of part.comments.filter((c: any) => !FOLDED.includes(c.type)))
      expect(c.loaded).toBe(true);
  });

  test("planComments with its fieldset returns created and the ticket relation", async () => {
    const plans: Map<string, any[]> = await tickets.planComments(PROJECT);
    expect(plans instanceof Map).toBe(true);
    const direct = await api.search("bb_comment", "bb_comment", {
      filter: [
        ["bb_comment_type", "=", "plan"],
        ["ticket_id.project_id.id", "=", PROJECT],
        ["ticket_id.closed", "=", false],
      ],
      limit: 50,
      all: true,
    });
    expect([...plans.values()].flat()).toHaveLength(
      direct.filter((c: any) => c.ticket_id?.id).length,
    );
    for (const [ticket, list] of plans) {
      expect(ticket).toMatch(/^[0-9a-f-]{36}$/);
      for (const c of list) {
        expect(c.type).toBe("plan");
        expect(typeof c.created).toBe("string");
      }
    }
  });

  test("activity by the ticket's identifier equals the search by its uuid", async () => {
    const detail = await tickets.readTicket(TICKET);
    const activity = await tickets.listActivity(detail.identifier);
    const direct = await api.search("bb_activity", "bb_activity", {
      filter: [["ticket_id.id", "=", TICKET]],
      include: ["actor"],
      sort: "-created",
      limit: 20,
    });
    const key = (a: any) => `${a.created}|${a.kind}`;
    expect(activity.map(key).sort()).toEqual(direct.map(key).sort());
    process.stdout.write(`contract: the fixture ticket has ${direct.length} activity rows\n`);
    for (const a of activity) expect(typeof a.kind).toBe("string");
    const created = activity.map((a: any) => String(a.created));
    expect(created).toEqual([...created].sort().reverse());
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

  test("listProjects: each project carries its workspace uuid and name", async () => {
    const list = (await projects.listProjects()).map(asProject);
    expect(list.length).toBeGreaterThan(0);
    for (const p of list) {
      expect(p.workspace).not.toBeNull();
      expect(p.workspace.uuid).toBeString();
      expect(p.workspace.uuid).not.toBe("");
      expect(p.workspace.name).toBeString();
      expect(p.workspace.name).not.toBe("");
    }
  });
});
