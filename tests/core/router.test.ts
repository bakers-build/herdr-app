import { beforeEach, expect, test } from "bun:test";
import { env, reset } from "../harness";

const registry: any = await import("../../mods/bakers/core/registry.js");
const { openRoute, viewOf } = await import("../../mods/bakers/core/router.js");

beforeEach(() => {
  reset();
  registry._resetForTests();
});

test("viewOf returns the view a route registered", () => {
  class V {}
  registry.define("route", "x.v", { view: V });
  expect(viewOf("x.v")).toBe(V);
});

test("viewOf is null for an unknown route", () => {
  expect(viewOf("no.such.route")).toBeNull();
});

test("openRoute sends the merged spec and returns the overlay id", () => {
  registry.define("route", "x.pop", { view: class {}, open: { kind: "popup", width: 220 } });
  const id = openRoute("x.pop", { ticket: "T-1" }, { at: { x: 1, y: 2 } });
  expect(id).toBe("overlay-1");
  expect(env.calls.filter((c: any) => c.fn === "openOverlay").map((c: any) => c.args[0])).toEqual([
    {
      mod: "bakers",
      props: { view: "x.pop", ticket: "T-1" },
      kind: "popup",
      width: 220,
      at: { x: 1, y: 2 },
    },
  ]);
});

test("openRoute: extra wins over open; a route without open sends only mod and props", () => {
  registry.define("route", "x.a", { view: class {}, open: { width: 220 } });
  registry.define("route", "x.b", { view: class {} });
  openRoute("x.a", {}, { width: 480 });
  openRoute("x.b");
  expect(env.calls.filter((c: any) => c.fn === "openOverlay").map((c: any) => c.args[0])).toEqual([
    { mod: "bakers", props: { view: "x.a" }, width: 480 },
    { mod: "bakers", props: { view: "x.b" } },
  ]);
});

test("openRoute for an unknown route opens nothing and returns null", () => {
  expect(openRoute("no.such.route")).toBeNull();
  expect(env.calls.filter((c: any) => c.fn === "openOverlay")).toEqual([]);
});
