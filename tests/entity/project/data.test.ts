import { beforeEach, expect, test } from "bun:test";
import { env, reset, tools } from "../../harness";

import { activeSpace, backend, resetMod } from "../../fixtures/shop";

const ctx: any = await import("../../../mods/bakers/entity/project/data.js");

beforeEach(() => {
  reset();
  resetMod();
});

test("project: matches project.config.js of the active space and shares the uuid", async () => {
  activeSpace();
  backend();
  const p = await ctx.ensureProject();
  expect(p).toEqual({ uuid: "p1", name: "acme-shop" });
  expect(env.shared["bakers.project"]).toBe("p1");
  expect(tools().map((t) => t[0])).toEqual(["bakers_project_list", "bakers_project_read"]);
});

test("project: with project_list served, the name is matched against the list", async () => {
  activeSpace();
  backend({
    bakers_project_list: {
      projects: [
        { uuid: "p0", name: "infra" },
        { uuid: "p1", name: "acme-shop" },
      ],
    },
  });
  expect(await ctx.ensureProject()).toEqual({ uuid: "p1", name: "acme-shop" });
  expect(ctx.projectChoices().map((p: any) => p.name)).toEqual(["infra", "acme-shop"]);
});

test("project: no match takes the first listed project and opens the picker", async () => {
  activeSpace("/work/other");
  env.files["/work/other/.bakers/project.config.js"] =
    "export default { project: { name: 'nothing-like-it' } };";
  backend({ bakers_project_list: { projects: [{ uuid: "p0", name: "infra" }] } });
  expect(await ctx.ensureProject()).toEqual({ uuid: "p0", name: "infra" });
  expect(env.calls.find((c) => c.fn === "openOverlay")?.args[0]).toMatchObject({
    props: { view: "project-picker" },
  });
});

test("project: an already shared project is kept", async () => {
  activeSpace();
  backend();
  env.shared["bakers.project"] = "p1";
  backend({ bakers_project_read: { uuid: "p1", key: "ACMESHOP", name: "acme-shop" } });
  expect(await ctx.ensureProject()).toEqual({ uuid: "p1", name: "acme-shop" });
  expect(tools().map((t) => t[0])).toEqual(["bakers_project_read"]);
});
