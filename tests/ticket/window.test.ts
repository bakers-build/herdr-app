// The ticket module's window task: leftover ticket tabs from the time tickets opened as tabs are
// closed once per window; the Tickets tab stays.
import { beforeEach, expect, test } from "bun:test";
import { activeSpace, backend, resetMod } from "../fixtures/shop";
import { env, flush, reset, runs } from "../harness";

const { windowTask } = await import("../../mods/bakers/ticket/window.js");

const modPane = (tab: string) => ({
  pane: `p-${tab}`,
  terminal: null,
  mod: "bakers",
  tab,
  title: "bakers",
});

beforeEach(() => {
  reset();
  resetMod();
});

test("the window task closes leftover ticket tabs once, never the Tickets tab", async () => {
  activeSpace();
  backend();
  env.spaces[0].tabs.push(
    { id: "t5", name: "SHOP-41 working", index: 2 },
    { id: "t6", name: "SHOP-49 closed", index: 3 },
  );
  env.panes = ["t5", "t6"].map(modPane);
  const task = windowTask();
  await task.run();
  await flush();
  const closes = () => runs().filter((r) => r[0] === "tab.close");
  expect(closes()).toEqual([
    ["tab.close", { id: "t5" }],
    ["tab.close", { id: "t6" }],
  ]);
  env.calls.length = 0;
  await task.run();
  await flush();
  expect(closes()).toEqual([]);
  expect(runs().some((r) => r[0] === "tab.rename")).toBe(false);
});

test("the sweep leaves a tab with an agent or a terminal pane, whatever its name", async () => {
  activeSpace();
  backend();
  env.spaces[0].tabs.push(
    { id: "t5", name: "SHOP-41 working", index: 2, panes: 1, status: null },
    { id: "t7", name: "ABC-12 notes", index: 3, panes: 2, status: null },
    { id: "t8", name: "SHOP-56 plan", index: 4, panes: 1, status: "working" },
  );
  env.panes = [
    modPane("t5"),
    modPane("t7"),
    { pane: "p-t7b", terminal: "t3", tab: "t7", title: "zsh" },
    modPane("t8"),
  ];
  await windowTask().run();
  await flush();
  expect(runs().filter((r) => r[0] === "tab.close")).toEqual([["tab.close", { id: "t5" }]]);
});
