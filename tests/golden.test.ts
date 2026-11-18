// Characterisation: the frames of the shell and the ticket module as they render today, pinned
// as snapshots, and the Herdr calls of their clicks and keys. A refactor must not change them.
import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { activeSpace, backend, NOW, resetMod, ticketTab } from "./fixtures/shop";
import { serialise } from "./golden";
import { click, env, find, flush, load, mount, reset, runs } from "./harness";

const realNow = Date.now;
// The views read the clock when they render; hold it at the fixture's NOW.
beforeAll(() => {
  Date.now = () => NOW;
});
afterAll(() => {
  Date.now = realNow;
});

beforeEach(() => {
  reset();
  resetMod();
});

const tab = (id: string, name: string, index: number, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  index,
  named: true,
  active: false,
  status: null,
  panes: 1,
  zoomed: false,
  settled: false,
  ...extra,
});

const panelLayout = (hidden: boolean, active: string) => ({
  id: "root",
  children: [
    { id: "sidebar", hidden: false, size: { px: 220 }, children: [] },
    { id: "panel", hidden, children: [{ id: "panel-body", active, children: [] }] },
  ],
});

/** The commands and overlays sent to Herdr, as [name, ...args]. */
function sent(): unknown[][] {
  return env.calls
    .filter((c) => c.fn === "run" || c.fn === "openOverlay")
    .map((c) => (c.fn === "run" ? c.args : [c.fn, ...c.args]));
}

async function shell(view: string) {
  const Bakers = await load("bakers/main.js");
  activeSpace();
  backend();
  const copy = mount(Bakers, { view });
  await flush();
  return copy;
}

async function tabsR24() {
  const Bakers = await load("bakers/main.js");
  env.spaces = [
    {
      id: "s1",
      name: "acme-shop",
      active: true,
      tabs: [
        tab("t0", "Tickets", 1, { active: true }),
        tab("t5", "SHOP-41 working", 2),
        tab("t6", "SHOP-56 plan", 3),
        tab("t7", "SHOP-49 closed", 4),
        tab("t8", "tb3", 5),
      ],
    },
  ];
  env.panes = [{ id: "p8", tab: "t8", program: { name: "zsh" } }];
  env.shared["bakers.needs"] = { count: 2, ids: ["SHOP-41", "SHOP-56"], updated: NOW };
  env.shared["bakers.preview"] = { id: "SHOP-56", index: null };
  env.shared["workspace.panels"] = ["files", "changes"];
  env.layout = panelLayout(true, "files");
  return mount(Bakers, { view: "shell.tabs" });
}

async function tabsR23() {
  const Bakers = await load("bakers/main.js");
  env.spaces = [
    {
      id: "s1",
      name: "acme-shop",
      active: true,
      tabs: [tab("t0", "Tickets", 1), tab("t5", "SHOP-41 working", 2, { active: true })],
    },
  ];
  env.shared["bakers.needs"] = { count: 2, ids: ["SHOP-41", "SHOP-56"], updated: NOW };
  env.layout = panelLayout(false, "ticket");
  return mount(Bakers, { view: "shell.tabs" });
}

test("golden: shell.rail", async () => {
  const Bakers = await load("bakers/main.js");
  env.shared["bakers.needs"] = { count: 2, ids: ["SHOP-41", "SHOP-56"], updated: NOW };
  activeSpace();
  expect(serialise(mount(Bakers, { view: "shell.rail" }).render())).toMatchSnapshot();
});

test("golden: shell.sidebar", async () => {
  const view = await shell("shell.sidebar");
  expect(serialise(view.render())).toMatchSnapshot();
});

test("golden: shell.status", async () => {
  const view = await shell("shell.status");
  expect(serialise(view.render())).toMatchSnapshot();
});

test("golden: shell.status bakers offline", async () => {
  const Bakers = await load("bakers/main.js");
  activeSpace();
  const view = mount(Bakers, { view: "shell.status" });
  await flush();
  expect(serialise(view.render())).toMatchSnapshot();
});

test("golden: shell.tabs R2-4", async () => {
  expect(serialise((await tabsR24()).render())).toMatchSnapshot();
});

test("golden: shell.tabs R2-3", async () => {
  expect(serialise((await tabsR23()).render())).toMatchSnapshot();
});

test("golden: ticket.list R2-4", async () => {
  const Bakers = await load("bakers/main.js");
  activeSpace();
  backend();
  env.shared["bakers.view"] = "needs-me";
  const view = mount(Bakers, { view: "ticket.list" });
  await flush();
  expect(serialise(view.render())).toMatchSnapshot();
});

test("golden: ticket.view R2-3", async () => {
  env.terminals = [{ address: "studio-mac/t7", labels: { "bakers.ticket": "SHOP-41" } }];
  expect(serialise((await ticketTab()).render())).toMatchSnapshot();
});

test("golden calls: rail click", async () => {
  const Bakers = await load("bakers/main.js");
  env.shared["bakers.needs"] = { count: 2, ids: ["SHOP-41", "SHOP-56"], updated: NOW };
  activeSpace();
  const root = mount(Bakers, { view: "shell.rail" }).render();
  click(find(root, "rail-bakers"));
  click(find(root, "rail-spaces"));
  expect(runs()).toMatchSnapshot();
});

test("golden calls: sidebar row click", async () => {
  const root = (await shell("shell.sidebar")).render();
  env.calls.length = 0;
  click(find(root, "view-state:working"));
  expect(runs()).toMatchSnapshot();
});

test("golden calls: status click", async () => {
  const root = (await shell("shell.status")).render();
  env.calls.length = 0;
  click(root);
  expect(runs()).toMatchSnapshot();
});

async function command(c: string, layout?: unknown) {
  activeSpace();
  backend();
  if (layout) env.layout = layout;
  env.commands.push(c);
  const Bakers = await load("bakers/main.js");
  mount(Bakers, { view: "shell.status" });
  await flush();
  return sent();
}

test("golden calls: goto with the sidebar shown", async () => {
  expect(await command("goto", panelLayout(true, "files"))).toMatchSnapshot();
});

test("golden calls: goto with the sidebar hidden", async () => {
  const layout: any = panelLayout(true, "files");
  layout.children[0].hidden = true;
  expect(await command("goto", layout)).toMatchSnapshot();
});

test("golden calls: tickets", async () => {
  expect(await command("tickets")).toMatchSnapshot();
});

test("golden calls: panel", async () => {
  expect(await command("panel", panelLayout(true, "files"))).toMatchSnapshot();
});

test("golden calls: new", async () => {
  expect(await command("new")).toMatchSnapshot();
});

test("golden calls: open:SHOP-41", async () => {
  expect(await command("open:SHOP-41")).toMatchSnapshot();
});

test("golden calls: tab double-click on a terminal tab", async () => {
  const root = (await tabsR24()).render();
  env.calls.length = 0;
  const item = find(root, "tab-t8");
  item.calls["on_mouse_down:left"][1]({ click_count: 2 }, { stop_propagation() {} });
  item.calls["on_mouse_up:left"][1]({}, {});
  expect(runs()).toMatchSnapshot();
});

test("golden calls: tab double-click on a ticket tab", async () => {
  const root = (await tabsR23()).render();
  env.calls.length = 0;
  const item = find(root, "tab-t5");
  item.calls["on_mouse_down:left"][1]({ click_count: 2 }, { stop_propagation() {} });
  item.calls["on_mouse_up:left"][1]({}, {});
  expect(runs()).toMatchSnapshot();
});

test("golden calls: Ticket panel click", async () => {
  const root = (await tabsR24()).render();
  env.calls.length = 0;
  click(find(root, "panel-ticket"));
  expect(runs()).toMatchSnapshot();
});
