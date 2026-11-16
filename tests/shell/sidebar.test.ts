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
