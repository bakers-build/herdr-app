import { beforeEach, expect, test } from "bun:test";
import {
  click,
  env,
  find,
  findText,
  flush,
  load,
  mount,
  reset,
  runs,
  texts,
  tools,
} from "./harness";

import { activeSpace, backend, NOW } from "./fixtures/shop";

const ctx: any = await import("../mods/bakers/lib/context.js");

beforeEach(() => {
  reset();
  ctx._resetForTests();
});

test("router renders a message for an unknown view", async () => {
  const Bakers = await load("bakers/main.js");
  const root = mount(Bakers, { view: "nope" }).render();
  expect(texts(root)).toEqual(["bakers: unknown view"]);
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
    props: { view: "picker", kind: "project" },
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

test("rail: 56 px column with the bakers button 36x36 labelled b 2", async () => {
  const Bakers = await load("bakers/main.js");
  env.shared["bakers.needs"] = { count: 2, ids: ["SHOP-41", "SHOP-56"], updated: NOW };
  activeSpace();
  const root = mount(Bakers, { view: "rail" }).render();
  expect(root.calls.w).toEqual([56]);
  const b = find(root, "rail-bakers");
  expect(texts(b)).toEqual(["b 2"]);
  expect(b.calls.size).toEqual([36]);
  expect(b.calls.text_size).toEqual([10]);
  expect(b.calls.border_color).toEqual(["accent"]);
  expect(b.calls.accessibility_label).toEqual(["bakers, 2 tickets need you"]);
  click(b);
  expect(env.shared["bakers.view"]).toBe("needs-me");
  expect(runs()).toContainEqual(["tab.select", { id: "t0" }]);
  click(find(root, "rail-spaces"));
  expect(runs()).toContainEqual(["layout.toggle", { id: "sidebar" }]);
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

test("status: project, need-you count and last update; a click opens the Tickets tab", async () => {
  const Bakers = await load("bakers/main.js");
  activeSpace();
  backend();
  const view = mount(Bakers, { view: "status" });
  await flush();
  const root = view.render();
  expect(texts(root)).toEqual(["acme-shop", "2 need you", "updated 1m ago"]);
  const need = findText(root, "2 need you");
  expect(need.calls.text_color).toEqual(["blocked"]);
  expect(need.calls.font_semibold).toBeDefined();
  expect(root.calls.text_size).toEqual([11]);
  expect(env.shared["bakers.needs"]).toMatchObject({ count: 2, ids: ["SHOP-41", "SHOP-56"] });
  env.calls.length = 0;
  click(root);
  expect(runs()).toEqual([["tab.select", { id: "t0" }]]);
});

test("status: bakers offline when the CLI is missing", async () => {
  const Bakers = await load("bakers/main.js");
  activeSpace();
  const view = mount(Bakers, { view: "status" });
  await flush();
  expect(texts(view.render())).toEqual(["bakers offline"]);
});

test("status: refreshes every 60 s", async () => {
  const Bakers = await load("bakers/main.js");
  activeSpace();
  backend();
  mount(Bakers, { view: "status" });
  await flush();
  expect(env.timers.some((t) => t.every && t.ms === 60000)).toBe(true);
});

test("status: global keys open Go to ticket, the Tickets tab and the ticket panel", async () => {
  const Bakers = await load("bakers/main.js");
  activeSpace();
  backend();
  env.layout = {
    id: "root",
    children: [{ id: "panel", hidden: true, children: [{ id: "panel-body", active: "files" }] }],
  };
  env.commands.push("goto", "tickets", "panel");
  mount(Bakers, { view: "status" });
  await flush();
  const overlay = env.calls.find((c) => c.fn === "openOverlay")?.args[0] as any;
  expect(overlay).toMatchObject({
    mod: "bakers",
    props: { view: "goto" },
    kind: "popup",
    width: 480,
  });
  expect(overlay.at.y).toBe(120);
  expect(runs()).toContainEqual(["tab.select", { id: "t0" }]);
  expect(runs()).toContainEqual(["layout.select", { stack: "panel-body", child: "ticket" }]);
  expect(runs()).toContainEqual(["layout.show", { id: "panel" }]);
});
