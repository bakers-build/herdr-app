import { beforeEach, expect, test } from "bun:test";
import { activeSpace, backend, resetMod } from "../../fixtures/shop";
import { env, fetched, reset } from "../../harness";

const ctx: any = await import("../../../mods/bakers/entity/project/data.js");

beforeEach(() => {
  reset();
  resetMod();
});

const two = [
  { id: "p0", name: "infra", key: "INFRA" },
  { id: "p1", name: "acme-shop", key: "ACMESHOP" },
];

test("project: matches project.config.js of the active space and shares the uuid", async () => {
  activeSpace();
  backend({ jsonapi: { projects: two } });
  expect(await ctx.ensureProject()).toEqual({ uuid: "p1", name: "acme-shop" });
  expect(env.shared["bakers.project"]).toBe("p1");
  expect(ctx.projectChoices().map((p: any) => p.name)).toEqual(["acme-shop", "infra"]);
  expect(fetched()).toEqual([
    "https://bakers.test/jsonapi/bb_project/bb_project?sort=name&page[limit]=50&page[offset]=0",
  ]);
});

test("project: no match takes the first project by name and opens the picker", async () => {
  activeSpace("/work/other");
  env.files["/work/other/.bakers/project.config.js"] =
    "export default { project: { name: 'nothing-like-it' } };";
  backend({ jsonapi: { projects: two } });
  expect(await ctx.ensureProject()).toEqual({ uuid: "p1", name: "acme-shop" });
  expect(env.calls.find((c) => c.fn === "openOverlay")?.args[0]).toMatchObject({
    props: { view: "project-picker" },
  });
});

test("project: an already shared project is read by its uuid", async () => {
  activeSpace();
  backend();
  env.shared["bakers.project"] = "p1";
  expect(await ctx.ensureProject()).toEqual({ uuid: "p1", name: "acme-shop" });
  expect(fetched()).toEqual(["https://bakers.test/jsonapi/bb_project/bb_project/p1"]);
});

test("project: the CLI missing is offline, nothing chosen", async () => {
  activeSpace();
  expect(await ctx.ensureProject()).toBe(null);
  expect(ctx.projectError().offline).toBe(true);
});
