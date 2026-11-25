// ticket/repository over the fake JSON:API server: a refresh reads what the open lists need,
// not the project's history.
import { beforeEach, expect, test } from "bun:test";
import { activeSpace, backend, resetMod } from "../fixtures/shop";
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
