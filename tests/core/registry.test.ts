import { beforeEach, expect, test } from "bun:test";

const registry: any = await import("../../mods/bakers/core/registry.js");

beforeEach(() => registry._resetForTests());

test("define then get returns the def; unknown type or id is null", () => {
  const def = { label: "x" };
  expect(registry.define("widget", "a", def)).toBe(def);
  expect(registry.get("widget", "a")).toBe(def);
  expect(registry.get("widget", "missing")).toBeNull();
  expect(registry.get("nothing", "a")).toBeNull();
});

test("all sorts by order then by first definition; a redefinition keeps its place and replaces the def", () => {
  registry.define("widget", "a", { order: 0, v: 1 });
  registry.define("widget", "b", { order: -1 });
  registry.define("widget", "c", { order: 0 });
  registry.define("widget", "a", { order: 0, v: 2 });
  const all = registry.all("widget");
  expect(all.map((e: any) => e.id)).toEqual(["b", "a", "c"]);
  expect(all[1]).toEqual({ id: "a", order: 0, v: 2 });
});

test("all of an unknown type is []", () => {
  expect(registry.all("nothing")).toEqual([]);
});

test("_resetForTests empties every type", () => {
  registry.define("widget", "a", {});
  registry.define("gadget", "b", {});
  registry._resetForTests();
  expect(registry.all("widget")).toEqual([]);
  expect(registry.get("gadget", "b")).toBeNull();
});
