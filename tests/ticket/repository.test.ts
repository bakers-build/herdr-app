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
  expect(decodeURIComponent(url)).toContain("include=runs,labels,ticket_type");
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

// HERDRAPP-23: the workspace catalog, read through JSON:API.
test("listCatalog reads every label and type of the project's workspace, sorted", async () => {
  const many = Array.from({ length: 60 }, (_, i) => `l${String(i).padStart(2, "0")}`);
  backend({
    jsonapi: {
      catalog: { labels: ["idea", ...many], types: ["chore"] },
      foreign: { labels: ["elsewhere"], types: ["epic"] },
    },
  });
  const c = await repository.listCatalog("p1");
  expect(c.labels).toEqual(["Question", "checkout", "idea", ...many].sort());
  expect(c.types).toEqual(["bug", "chore"]);
  const urls = fetched()
    .filter((u) => u.includes("/bb_term/label?"))
    .map(decodeURIComponent);
  expect(urls.length).toBe(2);
  expect(urls[0]).toContain("[condition][path]=workspace_id.id");
  expect(urls[0]).toContain("[condition][value]=w1");
});

test("listCatalog maps each term's uuid to its name", async () => {
  const c = await repository.listCatalog("p1");
  expect(c.names["label-checkout"]).toBe("checkout");
  expect(c.names["type-bug"]).toBe("bug");
});

test("listCatalog fails when the project has no readable workspace", async () => {
  backend({ jsonapi: { projects: [{ id: "p1", name: "acme-shop", key: "ACMESHOP" }] } });
  await expect(repository.listCatalog("p1")).rejects.toThrow("workspace");
});

test("a ticket whose terms the server leaves out of `included` gets their names from the catalog", async () => {
  backend({ jsonapi: { omit: ["bb_term--label", "bb_term--type"] } });
  const bare = await repository.listOpen("p1");
  expect(bare.find((t: any) => t.identifier === "SHOP-41")?.labels).toEqual([]);
  await ready();
  const row = getStore().byId("SHOP-41");
  expect(row?.labels).toEqual(["Question", "checkout"]);
  expect(row?.type).toBe("bug");
});
