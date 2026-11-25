import { afterEach, beforeEach, expect, setSystemTime, test } from "bun:test";
import { activeSpace, backend, resetMod } from "../fixtures/shop";
import { env, fetched, flush, reset } from "../harness";

const ctx: any = await import("../../mods/bakers/project/state.js");

beforeEach(() => {
  reset();
  resetMod();
});

afterEach(() => setSystemTime());

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
    props: { view: "project.picker" },
  });
  expect(env.calls.find((c) => c.fn === "openOverlay")?.args[0]).toEqual({
    mod: "bakers",
    props: { view: "project.picker" },
    kind: "popup",
    width: 220,
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

/** Every fetch hangs, as when a mod reload strands the resolution; returns the fetch count. */
function hang() {
  const seen = { fetches: 0 };
  env.fetch = () => {
    seen.fetches++;
    return new Promise(() => {});
  };
  return seen;
}

test("project: a resolution that never settles fails after 30 s and the next call starts anew", async () => {
  activeSpace();
  backend();
  const seen = hang();
  let answer: any = "pending";
  ctx.ensureProject().then((p: any) => (answer = p));
  await flush();
  expect(ctx.projectResolving()).toBe(true);
  setSystemTime(new Date(Date.now() + 29_000));
  ctx.ensureProject();
  await flush();
  expect(answer).toBe("pending"); // within the deadline the caller still waits
  expect(seen.fetches).toBe(1);
  setSystemTime(new Date(Date.now() + 2_000)); // 31 s after the start
  expect(ctx.projectResolving()).toBe(false);
  await flush();
  expect(answer).toBe(null);
  expect(ctx.projectError().offline).toBe(true);
  expect(ctx.projectError().message).toContain("30 s");
  ctx.ensureProject();
  await flush();
  expect(seen.fetches).toBe(2);
  expect(ctx.projectResolving()).toBe(true);
});

test("project: a resolution within the deadline is kept", async () => {
  activeSpace();
  backend({ jsonapi: { projects: two } });
  const first = ctx.ensureProject();
  setSystemTime(new Date(Date.now() + 29_000));
  expect(await first).toEqual({ uuid: "p1", name: "acme-shop" });
  expect(ctx.projectError()).toBe(null);
  expect(fetched()).toHaveLength(1);
});

test("project: an abandoned resolution that fails late does not replace the next one's error", async () => {
  activeSpace();
  backend();
  let failLate: (e: any) => void = () => {};
  env.fetch = () => new Promise((_ok, fail) => (failLate = fail));
  ctx.ensureProject();
  await flush();
  setSystemTime(new Date(Date.now() + 31_000));
  expect(ctx.projectResolving()).toBe(false);
  failLate(new Error("late"));
  await flush();
  expect(ctx.projectError().message).toContain("30 s");
});
