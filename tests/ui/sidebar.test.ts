import { beforeEach, expect, test } from "bun:test";
import { click, env, find, findText, flush, load, mount, reset, runs, texts } from "../harness";

import { activeSpace, backend, resetMod } from "../fixtures/shop";

beforeEach(() => {
  reset();
  resetMod();
});

test("sidebar: Tickets with the project picker and the views with counts and API chips", async () => {
  const Bakers = await load("bakers/main.js");
  activeSpace();
  backend();
  const view = mount(Bakers, { view: "sidebar" });
  await flush();
  const root = view.render();
  expect(root.calls.w).toEqual([220]);
  const t = texts(root);
  expect(t.slice(0, 2)).toEqual(["TICKETS", "acme-shop"]);
  expect(t).toEqual([
    "TICKETS",
    "acme-shop",
    "API",
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
    "API",
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

test("sidebar: an unknown project_list keeps the picker disabled with the API chip", async () => {
  const Bakers = await load("bakers/main.js");
  activeSpace();
  backend();
  const view = mount(Bakers, { view: "sidebar" });
  await flush();
  const picker = find(view.render(), "project-picker");
  expect(picker.calls.on_click).toBeUndefined();
  expect(findText(picker, "API")).toBeDefined();
});
