import { beforeEach, expect, test } from "bun:test";
import { env, reset, runs } from "../harness";

const tabs: any = await import("../../mods/bakers/core/tabs.js");
const ticketTabs: any = await import("../../mods/bakers/ticket/tabs.js");

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

const modPane = (tabId: string) => ({
  pane: `p-${tabId}`,
  terminal: null,
  mod: "bakers",
  tab: tabId,
  title: "bakers",
});

function space(...list: any[]) {
  env.spaces = [{ id: "s1", name: "acme-shop", active: true, tabs: list }];
}

beforeEach(() => {
  reset();
  tabs._resetForTests();
});

test("ensureTicketsTab creates the Tickets tab when missing", () => {
  space(tab("t1", "1", 1));
  ticketTabs.ensureTicketsTab();
  expect(runs()).toEqual([
    ["tab.new", { mod: "bakers", props: { view: "ticket.list" }, name: "Tickets" }],
  ]);
});

test("ensureTicketsTab with no space opens Tickets in a new space", () => {
  env.spaces = [];
  ticketTabs.ensureTicketsTab();
  expect(runs()).toEqual([
    ["space.new", {}],
    ["tab.new", { mod: "bakers", props: { view: "ticket.list" }, name: "Tickets" }],
  ]);
});

test("ensureTicketsTab only selects an existing Tickets tab", () => {
  space(tab("t0", "Tickets", 1), tab("t1", "1", 2));
  ticketTabs.ensureTicketsTab();
  expect(runs()).toEqual([["tab.select", { id: "t0" }]]);
});

test("reconcile keeps the Tickets tab at index 1", () => {
  space(tab("t1", "1", 1), tab("t0", "Tickets", 2));
  tabs.reconcile();
  expect(runs()).toEqual([["tab.move", { id: "t0", index: 1 }]]);
  env.calls.length = 0;
  space(tab("t0", "Tickets", 1), tab("t1", "1", 2));
  tabs.reconcile();
  expect(runs()).toEqual([]);
});

test("selectTicket selects the ticket and shows it in the panel, never a tab", () => {
  space(tab("t0", "Tickets", 1));
  ticketTabs.selectTicket("SHOP-41");
  expect(env.shared["bakers.selected"]).toBe("SHOP-41");
  expect(ticketTabs.selectedTicket()).toBe("SHOP-41");
  expect(runs()).toEqual([
    ["layout.select", { stack: "panel-body", child: "ticket" }],
    ["layout.show", { id: "panel" }],
  ]);
});

test("closeAll closes every leftover ticket tab but Tickets", () => {
  space(
    tab("t0", "Tickets", 1),
    tab("t5", "SHOP-41 working", 2),
    tab("t6", "SHOP-49 closed", 3),
    tab("t8", "1", 4),
  );
  env.panes = ["t0", "t5", "t6", "t8"].map((t) => modPane(t));
  ticketTabs.closeAll();
  expect(runs()).toEqual([
    ["tab.close", { id: "t5" }],
    ["tab.close", { id: "t6" }],
  ]);
});

test("closeAll keeps a ticket-named tab with a terminal and closes the bakers mod tab", () => {
  space(
    tab("t0", "Tickets", 1),
    tab("t5", "ABC-12 notes", 2),
    tab("t6", "ABC-13 working", 3),
    tab("t7", "ABC-14 done", 4),
  );
  env.panes = [
    { pane: "p0", terminal: null, mod: "bakers", tab: "t0", title: "bakers" },
    { pane: "p5", terminal: "t12", tab: "t5", title: "zsh" },
    { pane: "p6", terminal: null, mod: "bakers", tab: "t6", title: "bakers" },
    { pane: "p7", terminal: null, mod: "other", tab: "t7", title: "other" },
  ];
  ticketTabs.closeAll();
  expect(runs()).toEqual([["tab.close", { id: "t6" }]]);
});

const panelLayout = (hidden: boolean, active: string) => ({
  id: "root",
  type: "row",
  children: [
    { id: "work-body", type: "row", children: [{ id: "main", type: "tabs" }] },
    {
      id: "panel",
      type: "column",
      hidden,
      children: [{ id: "panel-body", type: "stack", active, children: [] }],
    },
  ],
});

test("frontTicket is the selected ticket on the Tickets tab or while the panel shows it", () => {
  space(tab("t0", "Tickets", 1), tab("t8", "1", 2));
  env.shared["bakers.selected"] = "SHOP-41";
  env.layout = panelLayout(true, "ticket");
  env.focused = { space: "s1", tab: "t0", pane: "p0" };
  expect(ticketTabs.frontTicket()).toBe("SHOP-41");
  env.focused = { space: "s1", tab: "t8", pane: "p8" };
  expect(ticketTabs.frontTicket()).toBe(null);
  env.layout = panelLayout(false, "ticket");
  expect(ticketTabs.frontTicket()).toBe("SHOP-41");
  env.layout = panelLayout(false, "files");
  expect(ticketTabs.frontTicket()).toBe(null);
  env.shared["bakers.selected"] = null;
  env.layout = panelLayout(false, "ticket");
  expect(ticketTabs.frontTicket()).toBe(null);
});
