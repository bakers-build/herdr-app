import { beforeEach, expect, test } from "bun:test";
import { click, env, find, findText, load, mount, reset, runs, texts } from "../harness";

const tabs: any = await import("../../mods/bakers/core/tabs.js");

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

test("bakers-tabs draws Tickets with the count, the italic preview and the needs-you dot", async () => {
  const Tabs = await load("bakers/main.js");
  space(
    tab("t0", "Tickets", 1, { active: true }),
    tab("t5", "SHOP-41 working", 2),
    tab("t6", "SHOP-56 plan", 3),
    tab("t7", "SHOP-49 closed", 4),
  );
  env.shared["bakers.needs"] = { count: 2, ids: ["SHOP-41", "SHOP-56"], updated: 1 };
  env.shared["bakers.preview"] = { id: "SHOP-56", index: null };
  const view = mount(Tabs, { view: "tabs" });
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
  expect(find(root, "dot-t5").calls.bg).toEqual(["blocked"]);
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
  const root = mount(Tabs, { view: "tabs" }).render();
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
  const root = mount(Tabs, { view: "tabs" }).render();
  env.calls.length = 0;
  const item = find(root, "tab-t5");
  item.calls["on_mouse_down:left"][1]({ click_count: 1 }, { stop_propagation() {} });
  item.calls["on_mouse_up:left"][1]({}, {});
  expect(runs()).toEqual([["tab.select", { id: "t5" }]]);
});
