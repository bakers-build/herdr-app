import { afterEach, beforeEach, expect, test } from "bun:test";
import { bakersLayout } from "../../scripts/layout.js";
import { activeSpace, live, resetMod, ticketTab } from "../fixtures/shop";
import { env, reset, runs } from "../harness";

const terminal: any = await import("../../mods/bakers/ticket/terminal.js");
const { findNode }: any = await import("../../mods/bakers/core/herdr.js");
const registry: any = await import("../../mods/bakers/core/registry.js");
const main = await Bun.file(new URL("../fixtures/herdr-main.json", import.meta.url)).json();

beforeEach(() => {
  reset();
  resetMod();
});

test("runTerminal finds a live run by identifier or UUID, local or remote", () => {
  env.terminals = [live("vps/t7", "uuid-41")];
  expect(terminal.runTerminal("SHOP-41", "uuid-41")?.address).toBe("vps/t7");
  expect(terminal.runTerminal("SHOP-41")).toBeUndefined();
  env.terminals = [live("t7")];
  expect(terminal.runTerminal("SHOP-41")?.address).toBe("t7");
});

test("runTerminal skips a finished run", () => {
  env.terminals = [live("t6", "SHOP-41", { state: "exited" }), live("t7")];
  expect(terminal.runTerminal("SHOP-41")?.address).toBe("t7");
  env.terminals = [live("t6", "SHOP-41", { state: "exited" })];
  expect(terminal.runTerminal("SHOP-41")).toBeUndefined();
});

const active = { runs: [{ uuid: "r1", closed: false }], claim_machine: "studio-mac" };

test("runReason names a machine Herdr is not connected to", () => {
  env.machines = [{ name: null, layout: "ready" }];
  expect(terminal.runReason(active, undefined)).toBe(
    "The run is on studio-mac, which Herdr is not connected to",
  );
});

test("runReason on a connected machine, without a run or without a machine: no live terminal", () => {
  env.machines = [
    { name: null, layout: "ready" },
    { name: "studio-mac", layout: "ready" },
  ];
  expect(terminal.runReason(active, undefined)).toBe("No live run terminal");
  env.machines = [];
  expect(terminal.runReason({ runs: [], claim_machine: "studio-mac" }, undefined)).toBe(
    "No live run terminal",
  );
  expect(terminal.runReason({ ...active, claim_machine: null }, undefined)).toBe(
    "No live run terminal",
  );
  expect(terminal.runReason(active, live("t7"))).toBe(null);
});

// The run column: the front tab, Herdr's layout and its terminals, as the window task sees them.

/** A Tickets tab t0 and, for an id, a ticket tab t5 in front (else t0, or a plain tab t6). */
function front(id: string | null, plain = false) {
  activeSpace();
  env.spaces[0].tabs.push({ id: "t6", name: "notes", index: 3, active: false });
  if (id) env.spaces[0].tabs.push({ id: "t5", name: `${id} working`, index: 2, active: true });
  env.focused = { space: "s1", tab: id ? "t5" : plain ? "t6" : "t0", pane: "p1" };
}

/** Plays the recorded layout writes into env.layout the way Herdr does, then forgets them. */
function applies() {
  for (const [c, a] of runs() as [string, any][]) {
    if (c === "layout.set") env.layout = structuredClone(a.layout);
    if (c === "layout.show") findNode(env.layout, a.id).hidden = false;
    if (c === "layout.hide") findNode(env.layout, a.id).hidden = true;
  }
  env.calls.length = 0;
}

/** A copy of the tree without the run column. */
function withoutRun(tree: any): any {
  const t = structuredClone(tree);
  const body = findNode(t, "work-body");
  body.children = body.children.filter((c: any) => c.id !== "run");
  return t;
}

const col = () => findNode(env.layout, "run");
const sets = () => runs().filter(([c]) => c === "layout.set") as [string, any][];

/** A run column showing t7 for SHOP-41, applied. */
function shown() {
  front("SHOP-41");
  env.terminals = [live("t7")];
  terminal.syncRun();
  applies();
}

beforeEach(() => {
  env.layout = bakersLayout(structuredClone(main));
});

afterEach(() => {
  // Herdr never takes the run over: no terminal command, no agent.focus, no hc.
  for (const [c] of runs() as [string][]) {
    expect(c.startsWith("terminal.")).toBe(false);
    expect(c).not.toBe("agent.focus");
  }
  expect(env.calls.filter((c) => c.fn === "exec")).toEqual([]);
});

test("a live run of the front ticket adds the column after main, focus untouched", () => {
  front("SHOP-41");
  env.terminals = [live("t7")];
  terminal.syncRun();
  expect(runs().map(([c]) => c)).toEqual(["layout.set"]);
  const tree = sets()[0][1].layout;
  expect(findNode(tree, "work-body").children.map((c: any) => c.id)).toEqual([
    "main",
    "run",
    "panel",
  ]);
  const { children, ...column } = findNode(tree, "run");
  expect(column).toEqual({ id: "run", type: "column", size: { weight: 1 } });
  expect(children).toEqual([
    {
      id: "run-header",
      type: "block",
      size: { px: 32 },
      resizable: false,
      content: { mod: "bakers", props: { view: "ticket.run" } },
    },
    { id: "run-terminal", type: "block", content: { terminal: "t7" } },
  ]);
  // the rest of the tree is as read
  expect(withoutRun(tree)).toEqual(bakersLayout(structuredClone(main)));
});

test("a remote run shows by its address", () => {
  front("SHOP-41");
  env.terminals = [live("vps/t7")];
  terminal.syncRun();
  expect(findNode(sets()[0][1].layout, "run-terminal").content).toEqual({ terminal: "vps/t7" });
});

test("an unchanged tick calls nothing", () => {
  shown();
  terminal.syncRun();
  expect(runs()).toEqual([]);
});

test("another ticket tab shows its run and keeps the column's size", () => {
  shown();
  col().size = { px: 500 };
  front("SHOP-56");
  env.terminals = [live("t7"), live("t9", "SHOP-56")];
  terminal.syncRun();
  expect(runs().map(([c]) => c)).toEqual(["layout.set"]);
  const tree = sets()[0][1].layout;
  expect(findNode(tree, "run").size).toEqual({ px: 500 });
  expect(findNode(tree, "run-terminal").content).toEqual({ terminal: "t9" });
});

test("the Tickets tab, a plain tab and a ticket without a run hide the column once", () => {
  for (const away of [() => front(null), () => front(null, true), () => front("SHOP-56")]) {
    shown();
    away();
    terminal.syncRun();
    expect(runs()).toEqual([["layout.hide", { id: "run" }]]);
    applies();
    terminal.syncRun();
    expect(runs()).toEqual([]);
    expect(env.terminals).toEqual([live("t7")]);
  }
});

test("a hidden column comes back with layout.show only", () => {
  shown();
  col().hidden = true;
  terminal.syncRun();
  expect(runs()).toEqual([["layout.show", { id: "run" }]]);
});

test("a finished run never shows", () => {
  front("SHOP-41");
  env.terminals = [live("t7", "SHOP-41", { state: "exited" })];
  terminal.syncRun();
  expect(runs()).toEqual([]);
  shown();
  env.terminals = [live("t7", "SHOP-41", { state: "exited" })];
  terminal.syncRun();
  expect(runs()).toEqual([["layout.hide", { id: "run" }]]);
});

test("the header left alone after a run ends is hidden", () => {
  shown();
  col().children = col().children.filter((c: any) => c.id !== "run-terminal");
  env.terminals = [];
  terminal.syncRun();
  expect(runs()).toEqual([["layout.hide", { id: "run" }]]);
});

test("the header left alone gets a new run's terminal", () => {
  shown();
  col().children = col().children.filter((c: any) => c.id !== "run-terminal");
  env.terminals = [live("t8")];
  terminal.syncRun();
  expect(runs().map(([c]) => c)).toEqual(["layout.set"]);
  const run = findNode(sets()[0][1].layout, "run");
  expect(run.children.map((c: any) => c.id)).toEqual(["run-header", "run-terminal"]);
  expect(findNode(run, "run-terminal").content).toEqual({ terminal: "t8" });
});

test("Hide keeps the column hidden across tabs and new runs", () => {
  shown();
  env.shared["bakers.runHidden"] = true;
  terminal.syncRun();
  expect(runs()).toEqual([["layout.hide", { id: "run" }]]);
  applies();
  front("SHOP-56");
  env.terminals = [live("t7"), live("t9", "SHOP-56")];
  terminal.syncRun();
  front("SHOP-41");
  env.terminals = [live("t8")];
  terminal.syncRun();
  expect(runs()).toEqual([]);
});

test("no main or no work-body, no call", () => {
  front("SHOP-41");
  env.terminals = [live("t7")];
  const body = findNode(env.layout, "work-body");
  body.children = body.children.filter((c: any) => c.id !== "main");
  terminal.syncRun();
  env.layout = { id: "root", children: [] };
  terminal.syncRun();
  expect(runs()).toEqual([]);
});

test("a run labelled with the ticket's UUID shows once the store knows it", async () => {
  env.terminals = [live("t7", "u41")];
  front("SHOP-41");
  terminal.syncRun();
  expect(runs()).toEqual([]);
  await ticketTab();
  env.layout = bakersLayout(structuredClone(main));
  front("SHOP-41");
  env.calls.length = 0;
  terminal.syncRun();
  expect(findNode(sets()[0][1].layout, "run-terminal").content).toEqual({ terminal: "t7" });
});

test("does not repeat a write while layout() lags", () => {
  front("SHOP-41");
  env.terminals = [live("t7")];
  terminal.syncRun(1000);
  terminal.syncRun(1500);
  expect(sets()).toHaveLength(1);
  terminal.syncRun(3100);
  expect(sets()).toHaveLength(2);
});

test("the task is registered synchronous, every second", () => {
  const task = registry.get("window.task", "ticket.run");
  expect(task.every).toBe(1000);
  expect(task.run()).toBeUndefined();
});

// Show agent and Answer in the run: a focus request, settled once a ticket tab is in front.

test("showRun shows the front ticket's run and focuses it", () => {
  front("SHOP-41");
  env.terminals = [live("t7")];
  env.shared["bakers.runHidden"] = true;
  terminal.showRun("SHOP-41");
  expect(runs().map(([c]) => c)).toEqual(["layout.set", "pane.focus"]);
  expect(runs()[1]).toEqual(["pane.focus", { terminal: "t7" }]);
  expect(env.shared["bakers.runHidden"]).toBe(false);
  expect(env.shared["bakers.runFocus"]).toBe(null);
});

test("a focus request waits on the Tickets tab", () => {
  front(null);
  env.terminals = [live("t9", "SHOP-56")];
  terminal.showRun("SHOP-56");
  expect(runs().filter(([c]) => c === "pane.focus")).toEqual([]);
  expect(env.shared["bakers.runFocus"]).toMatchObject({ id: "SHOP-56" });
  front("SHOP-56");
  terminal.syncRun();
  expect(runs().filter(([c]) => c === "pane.focus")).toEqual([["pane.focus", { terminal: "t9" }]]);
  expect(env.shared["bakers.runFocus"]).toBe(null);
});

test("a focus request older than 5 s is dropped", () => {
  const now = Date.now();
  front("SHOP-41");
  env.terminals = [live("t7")];
  env.shared["bakers.runFocus"] = { id: "SHOP-41", at: now - 6000 };
  terminal.syncRun(now);
  expect(runs().filter(([c]) => c === "pane.focus")).toEqual([]);
  expect(env.shared["bakers.runFocus"]).toBe(null);
});

test("another ticket tab in front drops the request without focusing", () => {
  front("SHOP-41");
  env.terminals = [live("t7"), live("t9", "SHOP-56")];
  env.shared["bakers.runFocus"] = { id: "SHOP-56", at: Date.now() };
  terminal.syncRun();
  expect(runs().filter(([c]) => c === "pane.focus")).toEqual([]);
  expect(env.shared["bakers.runFocus"]).toBe(null);
});
