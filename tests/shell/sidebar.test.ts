import { beforeEach, expect, test } from "bun:test";
import { click, env, find, flush, load, mount, reset, runs, texts } from "../harness";

import { activeSpace, backend, resetMod } from "../fixtures/shop";

beforeEach(() => {
  reset();
  resetMod();
});

test("sidebar: Tickets with the project picker and the views with their counts; Mine carries the API chip", async () => {
  const Bakers = await load("bakers/main.js");
  activeSpace();
  backend();
  const view = mount(Bakers, { view: "shell.sidebar" });
  await flush();
  const root = view.render();
  expect(root.calls.w).toEqual([220]);
  const t = texts(root);
  expect(t.slice(0, 2)).toEqual(["TICKETS", "acme-shop"]);
  expect(t).toEqual([
    "TICKETS",
    "acme-shop",
    "Needs me",
    "2",
    "Mine",
    "API",
    "Open by state",
    "6",
    "Qualification",
    "2",
    "Plan",
    "1",
    "Working",
    "3",
    "Review",
    "0",
    "Recently closed",
  ]);
  const needs = find(root, "view-needs-me");
  expect(needs.calls.bg).toEqual(["selected"]);
  expect(needs.calls.text_color).toEqual(["accent"]);
  expect(find(root, "view-mine").calls.on_click).toBeUndefined();
  env.calls.length = 0;
  click(find(root, "view-state:working"));
  expect(env.shared["bakers.view"]).toBe("state:working");
  expect(runs()).toEqual([["tab.select", { id: "t0" }]]);
});

test("sidebar: with one project the picker shows it; with two it opens the project picker", async () => {
  const Bakers = await load("bakers/main.js");
  activeSpace();
  backend();
  let view = mount(Bakers, { view: "shell.sidebar" });
  await flush();
  expect(find(view.render(), "project-picker").calls.on_click).toBeUndefined();
  reset();
  resetMod();
  activeSpace();
  backend({
    jsonapi: {
      projects: [
        { id: "p0", name: "infra" },
        { id: "p1", name: "acme-shop" },
      ],
    },
  });
  view = mount(Bakers, { view: "shell.sidebar" });
  await flush();
  click(find(view.render(), "project-picker"));
  expect(env.calls.find((c) => c.fn === "openOverlay")?.args[0]).toMatchObject({
    props: { view: "project.picker" },
  });
});

test("the sidebar's project button opens exactly the project picker popup", async () => {
  const Bakers = await load("bakers/main.js");
  activeSpace();
  backend({
    jsonapi: {
      projects: [
        { id: "p0", name: "infra" },
        { id: "p1", name: "acme-shop" },
      ],
    },
  });
  const view = mount(Bakers, { view: "shell.sidebar" });
  await flush();
  click(find(view.render(), "project-picker"));
  expect(env.calls.find((c) => c.fn === "openOverlay")?.args[0]).toEqual({
    mod: "bakers",
    props: { view: "project.picker" },
    kind: "popup",
    width: 220,
  });
});

test("shell draws registered contributions only", async () => {
  const Bakers = await load("bakers/main.js");
  const { define, _resetForTests } = await import("../../mods/bakers/core/registry.js");
  const { register } = await import("../../mods/bakers/shell/register.js");
  const { div } = await import("gpui-kit");
  _resetForTests();
  register();
  let inits = 0;
  class X {
    init() {
      inits++;
    }
    render() {
      return [div().child("row")];
    }
  }
  class Y {
    render() {
      return div().id("rail-y").child("y");
    }
  }
  define("route", "test.x", { view: X });
  define("route", "test.y", { view: Y });
  define("sidebar.section", "x", { order: 0, title: "X", route: "test.x" });
  define("rail.item", "y", { order: 0, route: "test.y" });
  const side = mount(Bakers, { view: "shell.sidebar" });
  await flush();
  expect(texts(side.render())).toEqual(["X", "row"]);
  side.render();
  expect(inits).toBe(1);
  const rail = mount(Bakers, { view: "shell.rail" }).render();
  expect(texts(rail)).toContain("y");
  expect(texts(rail)).not.toContain("Tickets");
});
