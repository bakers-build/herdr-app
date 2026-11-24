import { beforeEach, expect, test } from "bun:test";
import { click, env, find, findText, load, mount, reset, runs, texts, walk } from "../harness";

const tabs: any = await import("../../mods/bakers/core/tabs.js");
const registry: any = await import("../../mods/bakers/core/registry.js");

const tab = (id: string, name: string, index: number, extra: any = {}) => ({
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

function space(...list: any[]) {
  env.spaces = [{ id: "s1", name: "acme-shop", active: true, tabs: list }];
}

beforeEach(() => {
  reset();
  tabs._resetForTests();
});

test("bakers-tabs draws Tickets with the count and the italic preview; a leftover ticket tab gets no dot", async () => {
  const Tabs = await load("bakers/main.js");
  space(
    tab("t0", "Tickets", 1, { active: true }),
    tab("t5", "SHOP-41 working", 2),
    tab("t6", "SHOP-56 plan", 3),
    tab("t7", "SHOP-49 closed", 4),
  );
  env.shared["bakers.needs"] = { count: 2, ids: ["SHOP-41", "SHOP-56"], updated: 1 };
  env.shared["bakers.preview"] = { id: "SHOP-56", index: null };
  const view = mount(Tabs, { view: "shell.tabs" });
  const root = view.render();
  expect(texts(root).slice(0, 4)).toEqual([
    "Tickets 2",
    "SHOP-41 working",
    "SHOP-56 plan",
    "SHOP-49 closed",
  ]);
  const ticketsTab = find(root, "tab-t0");
  expect(ticketsTab.calls.h).toEqual([26]);
  expect(ticketsTab.calls.px).toEqual([10]);
  expect(ticketsTab.calls.text_size).toEqual([12]);
  expect(ticketsTab.calls.font_semibold).toBeDefined();
  expect(find(root, "tab-t6").calls.italic).toBeDefined();
  expect(find(root, "tab-t5").calls.italic).toBeUndefined();
  expect(find(root, "dot-t5")).toBeUndefined();
  expect(find(root, "dot-t7")).toBeUndefined();
  expect(root.calls.h).toEqual([40]);
});

test("bakers-tabs shows Files, Changes and Ticket; Ticket opens the ticket panel", async () => {
  const Tabs = await load("bakers/main.js");
  space(tab("t0", "Tickets", 1, { active: true }));
  env.layout = {
    id: "root",
    children: [
      {
        id: "panel",
        hidden: true,
        children: [{ id: "panel-body", active: "files", children: [] }],
      },
    ],
  };
  const root = mount(Tabs, { view: "shell.tabs" }).render();
  expect(findText(root, "Files")).toBeDefined();
  expect(findText(root, "Changes")).toBeDefined();
  env.calls.length = 0;
  click(find(root, "panel-ticket"));
  expect(runs()).toEqual([
    ["layout.select", { stack: "panel-body", child: "ticket" }],
    ["layout.show", { id: "panel" }],
  ]);
});

test("bakers-tabs selects a tab on mouse up", async () => {
  const Tabs = await load("bakers/main.js");
  space(tab("t0", "Tickets", 1, { active: true }), tab("t5", "SHOP-41 working", 2));
  const root = mount(Tabs, { view: "shell.tabs" }).render();
  env.calls.length = 0;
  const item = find(root, "tab-t5");
  item.calls["on_mouse_down:left"][1]({ click_count: 1 }, { stop_propagation() {} });
  item.calls["on_mouse_up:left"][1]({}, {});
  expect(runs()).toEqual([["tab.select", { id: "t5" }]]);
});

test("a tab no kind matches is a plain tab", async () => {
  const Tabs = await load("bakers/main.js");
  space(tab("t1", "FOO-1 x", 1, { active: true }));
  env.panes = [{ id: "p1", tab: "t1", program: { name: "zsh", icon: "mods/x/zsh.svg" } }];
  const view = mount(Tabs, { view: "shell.tabs" });
  registry._resetForTests();
  const root = view.render();
  const item = find(root, "tab-t1");
  expect(item.calls.italic).toBeUndefined();
  expect(item.nodes.some((n: any) => n.kind === "image")).toBe(true);
  env.calls.length = 0;
  item.calls["on_mouse_down:left"][1]({ click_count: 2 }, { stop_propagation() {} });
  expect(runs()).toEqual([["tab.rename", { id: "t1" }]]);
});

test("panel buttons come from tabs.panel in order and honour enabled", async () => {
  const Tabs = await load("bakers/main.js");
  const view = mount(Tabs, { view: "shell.tabs" });
  registry._resetForTests();
  registry.define("tabs.panel", "b", { order: 1, label: "Bee", bordered: false });
  registry.define("tabs.panel", "a", { order: 0, label: "Aye", bordered: true });
  registry.define("tabs.panel", "c", {
    order: 2,
    label: "Cee",
    bordered: false,
    enabled: () => false,
  });
  space(tab("t0", "plain", 1, { active: true }));
  const root = view.render();
  const ids: string[] = [];
  walk(root, (n: any) => {
    if (String(n.calls.id?.[0]).startsWith("panel-")) ids.push(n.calls.id[0]);
  });
  expect(ids).toEqual(["panel-a", "panel-b"]);
});

test("every tabs.decorate sees every tab, a plain tab included", async () => {
  const Tabs = await load("bakers/main.js");
  const view = mount(Tabs, { view: "shell.tabs" });
  registry.define("tabs.decorate", "other", {
    decorate: (_tab: any, info: any) => (info.kind === null ? { dot: "done" } : null),
  });
  space(
    tab("t0", "Tickets", 1, { active: true }),
    tab("t5", "SHOP-41 working", 2),
    tab("t9", "tb9", 3),
  );
  env.shared["bakers.needs"] = { count: 1, ids: ["SHOP-41"], updated: 1 };
  const root = view.render();
  expect(find(root, "dot-t9").calls.bg).toEqual(["done"]);
  expect(find(root, "dot-t5")).toBeUndefined();
  expect(texts(root).slice(0, 2)).toEqual(["Tickets 1", "SHOP-41 working"]);
});

test("syncPanel's enabled ids still include workspace.panels ids no panel registers", async () => {
  const Tabs = await load("bakers/main.js");
  space(tab("t0", "Tickets", 1, { active: true }));
  env.shared["workspace.panels"] = ["changes", "gone"];
  env.layout = {
    id: "root",
    children: [
      {
        id: "panel",
        hidden: false,
        children: [{ id: "panel-body", active: "files", children: [] }],
      },
    ],
  };
  const view = mount(Tabs, { view: "shell.tabs" });
  view.inner.panels = { s1: "gone" };
  env.calls.length = 0;
  view.render();
  expect(runs()).toEqual([
    ["layout.select", { stack: "panel-body", child: "gone" }],
    ["layout.show", { id: "panel" }],
  ]);
});
