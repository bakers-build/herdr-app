// ticket/repository over the fake JSON:API server: a refresh reads what the open lists need,
// not the project's history.
import { beforeEach, expect, test } from "bun:test";
import { activeSpace, backend, read, resetMod } from "../fixtures/shop";
import { env, fetched, reset } from "../harness";

const repository: any = await import("../../mods/bakers/ticket/repository.js");
const { getStore, ready } = await import("../../mods/bakers/ticket/store.js");

beforeEach(() => {
  reset();
  resetMod();
  activeSpace();
  backend();
});

test("listOpen asks the server for open tickets only", async () => {
  const list = await repository.listOpen("p1");
  expect(list.map((t: any) => t.identifier)).not.toContain("SHOP-49");
  expect(list.map((t: any) => t.identifier)).toContain("SHOP-41");
  const urls = fetched().filter((u) => u.includes("/bb_ticket/bb_ticket?"));
  expect(urls.length).toBe(1);
  expect(urls[0]).toContain(
    "filter[f1][condition][path]=closed&filter[f1][condition][operator]==&filter[f1][condition][value]=0",
  );
});

test("listOpen adds the tickets of open tabs, closed or not, by identifier", async () => {
  const list = await repository.listOpen("p1", ["SHOP-49", "SHOP-41"]);
  const ids = list.map((t: any) => t.identifier);
  expect(ids).toContain("SHOP-49");
  expect(ids.filter((id: string) => id === "SHOP-41").length).toBe(1);
  const inTabs =
    "filter[f1][condition][operator]=IN&filter[f1][condition][value][]=SHOP-49&filter[f1][condition][value][]=SHOP-41";
  expect(fetched().some((u) => u.includes(inTabs))).toBe(true);
});

test("planComments reads the plans of open tickets only", async () => {
  await repository.planComments("p1");
  const urls = fetched().filter((u) => u.includes("/bb_comment/bb_comment?"));
  expect(urls.length).toBe(1);
  expect(urls[0]).toContain(
    "[condition][path]=ticket_id.closed&filter[f2][condition][operator]==&filter[f2][condition][value]=0",
  );
});

test("the store's refresh also reads the selected ticket, a closed one included", async () => {
  env.shared["bakers.selected"] = "SHOP-49";
  await ready();
  expect(getStore().byId("SHOP-49")?.closed).toBe(true);
});

test("the list carries each ticket's type, read with the list", async () => {
  const list = await repository.listOpen("p1");
  expect(list.find((t: any) => t.identifier === "SHOP-41")?.type).toBe("bug");
  expect(list.find((t: any) => t.identifier === "SHOP-56")?.type).toBeNull();
  const url = fetched().find((u) => u.includes("/bb_ticket/bb_ticket?")) ?? "";
  expect(decodeURIComponent(url)).toContain("include=labels,ticket_type");
});

const TICKET_FIELDS =
  "fields[bb_ticket--bb_ticket]=identifier,title,state,labels,frozen,frozen_at,closed,closed_date,changed,assignee_name,ticket_type,claim_machine,conductor_id";
const RUN_FIELDS = "fields[bb_run--bb_run]=state,agent,harness,started_at,closed,ticket_id";

test("the list asks for a sparse fieldset and leaves the runs to a search of their own", async () => {
  await repository.listOpen("p1", ["SHOP-49"]);
  const urls = fetched().map((u) => decodeURIComponent(u));
  const tickets = urls.filter((u) => u.includes("/bb_ticket/bb_ticket?"));
  expect(tickets.length).toBe(2);
  for (const u of tickets) {
    expect(u).toContain(TICKET_FIELDS);
    expect(u).toContain("include=labels,ticket_type");
    expect(u).not.toMatch(/include=[^&]*runs/);
  }
});

test("listRuns searches the runs of the open tickets and of the tabs, sparse", async () => {
  await repository.listRuns("p1", ["SHOP-49"]);
  const urls = fetched()
    .map((u) => decodeURIComponent(u))
    .filter((u) => u.includes("/bb_run/bb_run?"));
  expect(urls.length).toBe(2);
  for (const u of urls) {
    expect(u).toContain(RUN_FIELDS);
    expect(u).toContain("[condition][path]=ticket_id.project_id.id");
    expect(u).not.toContain("include=");
  }
  expect(urls[0]).toContain("[condition][path]=ticket_id.closed");
  expect(urls[1]).toContain("[condition][path]=ticket_id.identifier");
  expect(urls[1]).toContain("[operator]=IN&filter[f1][condition][value][]=SHOP-49");
});

test("listRuns skips the tab search without tabs", async () => {
  await repository.listRuns("p1");
  const urls = fetched().filter((u) => u.includes("/bb_run/bb_run?"));
  expect(urls.length).toBe(1);
});

test("listRuns maps each ticket's runs by the ticket's uuid", async () => {
  const runs = await repository.listRuns("p1", ["SHOP-41"]);
  expect(runs.get("u41")).toEqual([
    expect.objectContaining({ uuid: "r1", state: "running", agent: "claude", closed: false }),
  ]);
  expect(runs.get("u56")).toBeUndefined();
});

test("plan comments and the closed list ask for sparse fields too", async () => {
  await repository.planComments("p1");
  await repository.query({ filter: [["closed", "=", true]] });
  const urls = fetched().map((u) => decodeURIComponent(u));
  expect(urls.find((u) => u.includes("/bb_comment/bb_comment?"))).toContain(
    "fields[bb_comment--bb_comment]=created,ticket_id",
  );
  const closed = urls.filter((u) => u.includes("/bb_ticket/bb_ticket?")).pop();
  expect(closed).toContain(TICKET_FIELDS);
  expect(closed).toContain("include=labels,ticket_type");
});

test("the store sees the runs of each ticket as the include gave them", async () => {
  await ready();
  const runs = (id: string) => getStore().tickets.find((t: any) => t.identifier === id)?.runs;
  expect(runs("SHOP-41")).toEqual([
    {
      uuid: "r1",
      state: "running",
      agent: "claude",
      started_at: expect.anything(),
      closed: false,
    },
  ]);
  expect(getStore().byId("SHOP-41")?.run?.uuid).toBe("r1");
  expect(runs("SHOP-56")).toEqual([]);
});

test("currentUser reads the signed-in user's uuid and display name", async () => {
  expect(await repository.currentUser()).toEqual({
    uuid: "u-me",
    name: "Pascal Glass",
    names: ["Pascal Glass"],
  });
});

test("currentUser keeps the display name for showing and both names for matching", async () => {
  backend({ jsonapi: { users: [{ id: "u-me", display_name: "Pascal Glass", name: "pg" }] } });
  expect(await repository.currentUser()).toEqual({
    uuid: "u-me",
    name: "Pascal Glass",
    names: ["Pascal Glass", "pg"],
  });
});

test("currentUser is null when the user cannot be read", async () => {
  backend({ jsonapi: { users: [] } });
  expect(await repository.currentUser()).toBeNull();
});

/** SHOP-56 with an older plan, a spec and an older summary besides its plan, restored afterwards. */
async function withFoldedComments(fn: () => Promise<any>) {
  const before = read.u56.comments;
  read.u56.comments = [
    {
      id: "p0",
      type: "plan",
      author: "Claude Code",
      created: "2026-01-01T10:00:00Z",
      body: "Old plan",
    },
    {
      id: "s0",
      type: "summary",
      author: "Claude Code",
      created: "2026-01-01T11:00:00Z",
      body: "Old summary",
    },
    {
      id: "s1",
      type: "summary",
      author: "Claude Code",
      created: "2026-01-02T11:00:00Z",
      body: "New summary",
    },
    {
      id: "sp",
      type: "spec",
      author: "Claude Code",
      created: "2026-01-02T12:00:00Z",
      body: "The spec",
    },
    { id: "k1", type: "comment", author: "You", created: "2026-01-03T09:00:00Z", body: "Go ahead" },
    ...before,
  ];
  try {
    return await fn();
  } finally {
    read.u56.comments = before;
  }
}

test("the detail does not include its comments and reads them with sparse fields", async () => {
  await withFoldedComments(() => repository.readTicket("SHOP-56"));
  const urls = fetched().map((u) => decodeURIComponent(u));
  const detail = urls.find((u) => u.includes("/bb_ticket/bb_ticket?")) ?? "";
  expect(detail).not.toMatch(/include=[^&]*comments/);
  const comments = urls.filter((u) => u.includes("/bb_comment/bb_comment?"));
  expect(comments.length).toBe(3);
  for (const u of comments) expect(u).toContain("fields[bb_comment--bb_comment]=");
  const others = comments.find((u) => u.includes("operator]=NOT IN")) ?? "";
  expect(others).toContain(
    "fields[bb_comment--bb_comment]=bb_comment_type,author_name,created,body",
  );
  const meta =
    comments.find((u) => u.includes("operator]=IN&") && u.includes("bb_comment_type")) ?? "";
  expect(meta).toContain("fields[bb_comment--bb_comment]=bb_comment_type,author_name,created");
  expect(meta).not.toContain("created,body");
  const bodies = comments.find((u) => u.includes("path]=id")) ?? "";
  expect(bodies).toContain("fields[bb_comment--bb_comment]=body");
  expect(bodies).toContain("operator]=IN");
});

test("the detail's comments: others with body, the newest plan, spec and summary with body, older ones without", async () => {
  const d = await withFoldedComments(() => repository.readTicket("SHOP-56"));
  const by = (id: string) => d.comments.find((c: any) => c.id === id);
  expect(d.comments.map((c: any) => c.id)).toEqual(["p0", "s0", "s1", "sp", "k1", "p1"]);
  expect(by("k1")).toMatchObject({
    type: "comment",
    author: "You",
    body: "Go ahead",
    loaded: true,
  });
  expect(by("p1")).toMatchObject({
    type: "plan",
    author: "Claude Code",
    body: "## Plan\n\nShow the date.",
    loaded: true,
  });
  expect(by("s1")).toMatchObject({ body: "New summary", loaded: true });
  expect(by("sp")).toMatchObject({ body: "The spec", loaded: true });
  expect(by("p0")).toMatchObject({ type: "plan", author: "Claude Code", body: "", loaded: false });
  expect(by("s0")).toMatchObject({ type: "summary", body: "", loaded: false });
  // The newest bodies come in one request, by id.
  const urls = fetched().map((u) => decodeURIComponent(u));
  const bodies = urls.find((u) => u.includes("fields[bb_comment--bb_comment]=body")) ?? "";
  expect(bodies).toMatch(/\]\[\]=p1/);
  expect(bodies).toMatch(/\]\[\]=s1/);
  expect(bodies).toMatch(/\]\[\]=sp/);
  expect(bodies).not.toMatch(/\]\[\]=(p0|s0)/);
});

test("when summaries tie on created, the one the panel reads as newest is the one loaded", async () => {
  const before = read.u56.comments;
  read.u56.comments = [
    {
      id: "t1",
      type: "summary",
      author: "Claude Code",
      created: "2026-01-02T11:00:00Z",
      body: "First post",
    },
    {
      id: "t2",
      type: "summary",
      author: "Claude Code",
      created: "2026-01-02T11:00:00Z",
      body: "Reposted",
    },
    ...before,
  ];
  try {
    const d = await repository.readTicket("SHOP-56");
    const summaries = d.comments.filter((c: any) => c.type === "summary");
    expect(summaries.at(-1)).toMatchObject({ id: "t2", body: "Reposted", loaded: true });
    expect(summaries.find((c: any) => c.id === "t1")).toMatchObject({ loaded: false });
  } finally {
    read.u56.comments = before;
  }
});

test("a ticket without plan, spec or summary needs no request for newest bodies", async () => {
  await repository.readTicket("SHOP-41");
  const comments = fetched().filter((u) => u.includes("/bb_comment/bb_comment?"));
  expect(comments.length).toBe(2);
});

test("commentBody reads one comment's body and nothing else", async () => {
  let before = 0;
  await withFoldedComments(async () => {
    await repository.commentBody("p0"); // the first read also asks for a token
    before = fetched().length;
    expect(await repository.commentBody("p0")).toBe("Old plan");
  });
  const urls = fetched()
    .slice(before)
    .map((u) => decodeURIComponent(u));
  expect(urls.length).toBe(1);
  expect(urls[0]).toContain("fields[bb_comment--bb_comment]=body");
});

test("the searches that page through everything sort by a unique key", async () => {
  await repository.listRuns("p1", ["SHOP-49"]);
  await repository.planComments("p1");
  await withFoldedComments(() => repository.readTicket("SHOP-56"));
  const paged = fetched()
    .map((u) => decodeURIComponent(u))
    .filter(
      (u) => /\/bb_(run|comment)\/bb_(run|comment)\?/.test(u) && u.includes("page[limit]=50"),
    );
  // two run searches, the plan comments, the two comment searches of the detail
  expect(paged.length).toBe(5);
  for (const u of paged) expect(u).toMatch(/[?&]sort=id(&|$)/);
});
