import { beforeEach, expect, test } from "bun:test";
import { env, reset, runs } from "../harness";

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

function note() {
  registry.define("tab", "note", {
    route: "note.view",
    props: (k: string) => ({ note: k }),
    match: /^(N\d+) (\S+)$/,
    home: { name: "Notes", route: "note.list", index: 1 },
  });
}

beforeEach(() => {
  reset();
  tabs._resetForTests();
  registry._resetForTests();
  note();
});

test("openHome creates or selects the home tab", () => {
  space(tab("t1", "1", 1));
  tabs.openHome("note");
  expect(runs()).toEqual([
    ["tab.new", { mod: "bakers", props: { view: "note.list" }, name: "Notes" }],
  ]);
  env.calls.length = 0;
  space(tab("t0", "Notes", 1), tab("t1", "1", 2));
  tabs.openHome("note");
  expect(runs()).toEqual([["tab.select", { id: "t0" }]]);
});

test("openHome with no space makes a space, then the home tab", () => {
  env.spaces = [];
  tabs.openHome("note");
  expect(runs()).toEqual([
    ["space.new", {}],
    ["tab.new", { mod: "bakers", props: { view: "note.list" }, name: "Notes" }],
  ]);
});

test("reconcile keeps home at its index", () => {
  space(tab("t1", "1", 1), tab("t0", "Notes", 2));
  tabs.reconcile();
  expect(runs()).toEqual([["tab.move", { id: "t0", index: 1 }]]);
  env.calls.length = 0;
  space(tab("t0", "Notes", 1), tab("t1", "1", 2));
  tabs.reconcile();
  expect(runs()).toEqual([]);
});

test("open as preview, then the next preview replaces it in place", () => {
  space(tab("t0", "Notes", 1));
  tabs.open("note", "N1", "N1 draft", { pin: false });
  expect(runs()).toEqual([
    ["tab.new", { mod: "bakers", props: { view: "note.view", note: "N1" }, name: "N1 draft" }],
  ]);
  expect(env.shared["bakers.preview"]).toEqual({ id: "N1", index: null });
  env.calls.length = 0;
  space(tab("t0", "Notes", 1), tab("t5", "N1 draft", 2), tab("t6", "1", 3));
  tabs._resetForTests();
  tabs.open("note", "N2", "N2 draft", { pin: false });
  expect(runs()[0]).toEqual(["tab.close", { id: "t5" }]);
  expect(env.shared["bakers.preview"]).toEqual({ id: "N2", index: 2 });
  env.calls.length = 0;
  space(tab("t0", "Notes", 1), tab("t6", "1", 2), tab("t7", "N2 draft", 3));
  tabs.reconcile();
  expect(runs()).toEqual([["tab.move", { id: "t7", index: 2 }]]);
  expect(env.shared["bakers.preview"]).toEqual({ id: "N2", index: null });
  expect(tabs.preview()).toEqual({ kind: "note", key: "N2", index: null });
});

test("an open key is only selected", () => {
  space(tab("t0", "Notes", 1), tab("t5", "N1 draft", 2));
  tabs.open("note", "N1", "N1 draft", { pin: false });
  tabs.open("note", "N1", "N1 draft", { pin: true });
  expect(runs()).toEqual([
    ["tab.select", { id: "t5" }],
    ["tab.select", { id: "t5" }],
  ]);
});

test("a double open before the tab appears opens one", () => {
  space(tab("t0", "Notes", 1));
  tabs.open("note", "N1", "N1 draft", { pin: false });
  tabs.open("note", "N1", "N1 draft", { pin: false });
  tabs.open("note", "N1", "N1 draft", { pin: true });
  expect(runs().filter((r) => r[0] === "tab.new").length).toBe(1);
});

test("pin clears the preview", () => {
  space(tab("t0", "Notes", 1), tab("t5", "N1 draft", 2));
  env.shared["bakers.preview"] = { id: "N1", index: null };
  tabs.open("note", "N1", "N1 draft", { pin: true });
  expect(env.shared["bakers.preview"]).toBe(null);
  env.shared["bakers.preview"] = { id: "N1", index: null };
  tabs.pin("note", "N1");
  expect(env.shared["bakers.preview"]).toBe(null);
});

test("syncNames renames only changed names", () => {
  space(tab("t5", "N1 draft", 2), tab("t6", "N2 final", 3), tab("t7", "N3 draft", 4));
  const names: Record<string, string> = { N1: "N1 final", N2: "N2 final", N3: "N3 draft" };
  tabs.syncNames("note", (k: string) => names[k]);
  expect(runs()).toEqual([["tab.rename", { id: "t5", name: "N1 final" }]]);
});

test("closeWhere closes matching keyed tabs, never home", () => {
  space(
    tab("t0", "Notes", 1),
    tab("t5", "N1 draft", 2),
    tab("t6", "N2 gone", 3),
    tab("t8", "1", 4),
  );
  tabs.closeWhere("note", (t: any) => t.rest === "gone");
  expect(runs()).toEqual([["tab.close", { id: "t6" }]]);
  env.calls.length = 0;
  tabs.closeWhere("note", () => true);
  expect(runs()).toEqual([
    ["tab.close", { id: "t5" }],
    ["tab.close", { id: "t6" }],
  ]);
});

test("focusedKey reads the key of the focused tab", () => {
  space(tab("t0", "Notes", 1), tab("t5", "N1 draft", 2, { active: true }));
  env.focused = { space: "s1", tab: "t5", pane: "p1" };
  expect(tabs.focusedKey("note")).toBe("N1");
  env.focused = { space: "s1", tab: "t0", pane: "p0" };
  expect(tabs.focusedKey("note")).toBe(null);
});

test("with no kind registered, parseName is null and nothing is keyed", () => {
  registry._resetForTests();
  space(tab("t5", "N1 draft", 2), tab("t0", "Notes", 1));
  expect(tabs.parseName("N1 draft")).toBe(null);
  expect(tabs.keyedTabs("note")).toEqual([]);
  expect(tabs.isHome("Notes")).toBe(null);
});
