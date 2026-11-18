import { beforeEach, expect, test } from "bun:test";

const registry: any = await import("../../mods/bakers/core/registry.js");
const { viewOf } = await import("../../mods/bakers/core/router.js");

beforeEach(() => registry._resetForTests());

test("viewOf returns the view a route registered", () => {
  class V {}
  registry.define("route", "x.v", { view: V });
  expect(viewOf("x.v")).toBe(V);
});

test("viewOf is null for an unknown route", () => {
  expect(viewOf("no.such.route")).toBeNull();
});
