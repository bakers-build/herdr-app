import { beforeEach, expect, test } from "bun:test";
import { click, env, findText, flush, load, mount, reset, runs, texts } from "../harness";

import { activeSpace, backend } from "../fixtures/shop";

const ctx: any = await import("../../mods/bakers/core/session.js");

beforeEach(() => {
  reset();
  ctx._resetForTests();
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
