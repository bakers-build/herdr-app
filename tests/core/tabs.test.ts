import { beforeEach, expect, test } from "bun:test";
import { env, reset, runs } from "../harness";

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

test("ensureTicketsTab creates the Tickets tab when missing", () => {
  space(tab("t1", "1", 1));
  tabs.ensureTicketsTab();
  expect(runs()).toEqual([
    ["tab.new", { mod: "bakers", props: { view: "ticket.list" }, name: "Tickets" }],
  ]);
});

test("ensureTicketsTab only selects an existing Tickets tab", () => {
  space(tab("t0", "Tickets", 1), tab("t1", "1", 2));
  tabs.ensureTicketsTab();
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

test("openTicket as preview opens a ticket tab and remembers the preview", () => {
  space(tab("t0", "Tickets", 1));
  tabs.openTicket("SHOP-41", "SHOP-41 working", { pin: false });
  expect(runs()).toEqual([
    [
      "tab.new",
      { mod: "bakers", props: { view: "ticket.view", ticket: "SHOP-41" }, name: "SHOP-41 working" },
    ],
  ]);
  expect(env.shared["bakers.preview"]).toEqual({ id: "SHOP-41", index: null });
});

test("the next preview replaces the old one at its index", () => {
  space(tab("t0", "Tickets", 1), tab("t5", "SHOP-41 working", 2), tab("t6", "1", 3));
  env.shared["bakers.preview"] = { id: "SHOP-41", index: null };
  tabs.openTicket("SHOP-56", "SHOP-56 plan", { pin: false });
  expect(runs()).toEqual([
    ["tab.close", { id: "t5" }],
    [
      "tab.new",
      { mod: "bakers", props: { view: "ticket.view", ticket: "SHOP-56" }, name: "SHOP-56 plan" },
    ],
  ]);
  expect(env.shared["bakers.preview"]).toEqual({ id: "SHOP-56", index: 2 });
  env.calls.length = 0;
  space(tab("t0", "Tickets", 1), tab("t6", "1", 2), tab("t7", "SHOP-56 plan", 3));
  tabs.reconcile();
  expect(runs()).toEqual([["tab.move", { id: "t7", index: 2 }]]);
  expect(env.shared["bakers.preview"]).toEqual({ id: "SHOP-56", index: null });
});

test("an open ticket is only selected, never opened twice", () => {
  space(tab("t0", "Tickets", 1), tab("t5", "SHOP-41 working", 2));
  tabs.openTicket("SHOP-41", "SHOP-41 working", { pin: false });
  tabs.openTicket("SHOP-41", "SHOP-41 working", { pin: true });
  expect(runs()).toEqual([
    ["tab.select", { id: "t5" }],
    ["tab.select", { id: "t5" }],
  ]);
});

test("a double Enter before the tab appears opens one preview", () => {
  space(tab("t0", "Tickets", 1));
  tabs.openTicket("SHOP-41", "SHOP-41 working", { pin: false });
  tabs.openTicket("SHOP-41", "SHOP-41 working", { pin: false });
  tabs.openTicket("SHOP-41", "SHOP-41 working", { pin: true });
  expect(runs().filter((r) => r[0] === "tab.new").length).toBe(1);
});

test("pinning clears the preview", () => {
  space(tab("t0", "Tickets", 1), tab("t5", "SHOP-41 working", 2));
  env.shared["bakers.preview"] = { id: "SHOP-41", index: null };
  tabs.openTicket("SHOP-41", "SHOP-41 working", { pin: true });
  expect(env.shared["bakers.preview"]).toBe(null);
  env.shared["bakers.preview"] = { id: "SHOP-41", index: null };
  tabs.pin("SHOP-41");
  expect(env.shared["bakers.preview"]).toBe(null);
});

test("syncNames renames on a state change and after done; nothing when unchanged", () => {
  space(
    tab("t0", "Tickets", 1),
    tab("t5", "SHOP-41 plan", 2),
    tab("t6", "SHOP-49 review", 3),
    tab("t7", "SHOP-56 plan", 4),
  );
  const names: Record<string, string> = {
    "SHOP-41": "SHOP-41 working",
    "SHOP-49": "SHOP-49 closed",
    "SHOP-56": "SHOP-56 plan",
  };
  tabs.syncNames((id: string) => names[id]);
  expect(runs()).toEqual([
    ["tab.rename", { id: "t5", name: "SHOP-41 working" }],
    ["tab.rename", { id: "t6", name: "SHOP-49 closed" }],
  ]);
});

test("closeFinished closes closed ticket tabs; closeAll every ticket tab but Tickets", () => {
  space(
    tab("t0", "Tickets", 1),
    tab("t5", "SHOP-41 working", 2),
    tab("t6", "SHOP-49 closed", 3),
    tab("t8", "1", 4),
  );
  tabs.closeFinished();
  expect(runs()).toEqual([["tab.close", { id: "t6" }]]);
  env.calls.length = 0;
  tabs.closeAll();
  expect(runs()).toEqual([
    ["tab.close", { id: "t5" }],
    ["tab.close", { id: "t6" }],
  ]);
});

test("focusedTicket reads the identifier from the focused tab's name", () => {
  space(tab("t0", "Tickets", 1), tab("t5", "SHOP-41 working", 2, { active: true }));
  env.focused = { space: "s1", tab: "t5", pane: "p1" };
  expect(tabs.focusedTicket()).toBe("SHOP-41");
  env.focused = { space: "s1", tab: "t0", pane: "p0" };
  expect(tabs.focusedTicket()).toBe(null);
});
