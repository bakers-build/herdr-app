import { beforeEach, expect, test } from "bun:test";
import { click, env, findText, flush, load, mount, reset, runs, texts } from "../harness";

import { activeSpace, backend, resetMod } from "../fixtures/shop";

beforeEach(() => {
  reset();
  resetMod();
});

test("status: project, need-you count and last update; a click opens the Tickets tab", async () => {
  const Bakers = await load("bakers/main.js");
  activeSpace();
  backend();
  const view = mount(Bakers, { view: "shell.status" });
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
  const view = mount(Bakers, { view: "shell.status" });
  await flush();
  expect(texts(view.render())).toEqual(["bakers offline"]);
});

test("status: refreshes every 60 s", async () => {
  const Bakers = await load("bakers/main.js");
  activeSpace();
  backend();
  mount(Bakers, { view: "shell.status" });
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
  mount(Bakers, { view: "shell.status" });
  await flush();
  const overlay = env.calls.find((c) => c.fn === "openOverlay")?.args[0] as any;
  expect(overlay).toMatchObject({
    mod: "bakers",
    props: { view: "ticket.actions", page: "tickets" },
    kind: "window",
    width: 480,
  });
  expect(runs()).toContainEqual(["tab.select", { id: "t0" }]);
  expect(runs()).toContainEqual(["layout.select", { stack: "panel-body", child: "ticket" }]);
  expect(runs()).toContainEqual(["layout.show", { id: "panel" }]);
});

const registry = await import("../../mods/bakers/core/registry.js");
const { default: Status } = await import("../../mods/bakers/shell/view/status.js");

const sidebarLayout = (hidden: boolean) => ({
  id: "root",
  children: [{ id: "sidebar", hidden, size: { px: 220 }, children: [] }],
});

test("a command dispatches to its registered handler with width and left", async () => {
  await load("bakers/main.js");
  const seen: unknown[][] = [];
  registry.define("command", "probe", { run: (...a: unknown[]) => void seen.push(a) });
  env.layout = sidebarLayout(false);
  env.commands.push("probe:a:b");
  mount(Status, { view: "shell.status" });
  await flush();
  expect(seen).toEqual([["a:b", { width: 1440 - 56, left: 56 + 220 }]]);
});

test("an unknown command does nothing", async () => {
  await load("bakers/main.js");
  env.commands.push("nonesuch:x");
  mount(Status, { view: "shell.status" });
  await flush();
  expect(env.calls.filter((c) => c.fn === "run" || c.fn === "openOverlay")).toEqual([]);
});

test("status with no items draws an empty block and a click does nothing", async () => {
  await load("bakers/main.js");
  registry._resetForTests();
  const view = mount(Status, { view: "shell.status" });
  await flush();
  const root = view.render();
  expect(texts(root)).toEqual([]);
  env.calls.length = 0;
  click(root);
  expect(runs()).toEqual([]);
});

test("a status click runs only the first item's click", async () => {
  await load("bakers/main.js");
  registry._resetForTests();
  const ran: string[] = [];
  for (const name of ["first", "second"]) {
    registry.define("route", `probe.${name}`, {
      view: class {
        render() {
          return [];
        }
        click() {
          ran.push(name);
        }
      },
    });
  }
  registry.define("status.item", "second", { order: 1, route: "probe.second" });
  registry.define("status.item", "first", { order: 0, route: "probe.first" });
  const view = mount(Status, { view: "shell.status" });
  await flush();
  click(view.render());
  expect(ran).toEqual(["first"]);
});

test("a status click skips an item without click() and runs the first one that has it", async () => {
  await load("bakers/main.js");
  registry._resetForTests();
  const ran: string[] = [];
  registry.define("route", "probe.plain", {
    view: class {
      render() {
        return [];
      }
    },
  });
  registry.define("route", "probe.clicker", {
    view: class {
      render() {
        return [];
      }
      click() {
        ran.push("clicker");
      }
    },
  });
  registry.define("status.item", "plain", { order: 0, route: "probe.plain" });
  registry.define("status.item", "clicker", { order: 1, route: "probe.clicker" });
  const view = mount(Status, { view: "shell.status" });
  await flush();
  click(view.render());
  expect(ran).toEqual(["clicker"]);
});

test("a contribution naming an unregistered route is skipped; the valid one still draws and the loops start", async () => {
  await load("bakers/main.js");
  registry._resetForTests();
  const ran: string[] = [];
  registry.define("route", "probe.ok", {
    view: class {
      render() {
        return [];
      }
      click() {
        ran.push("ok");
      }
    },
  });
  registry.define("status.item", "typo", { order: 0, route: "probe.missing" });
  registry.define("status.item", "ok", { order: 1, route: "probe.ok" });
  registry.define("window.task", "t", { every: 1000, run: () => void ran.push("task") });
  const view = mount(Status, { view: "shell.status" });
  await flush();
  click(view.render());
  expect(ran).toContain("task");
  expect(ran).toContain("ok");
});
