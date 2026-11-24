import { afterEach, beforeEach, expect, test } from "bun:test";
import { bakersLayout } from "../../scripts/layout.js";
import { activeSpace, live, resetMod, ticketPanel } from "../fixtures/shop";
import { env, reset, runs } from "../harness";

const terminal: any = await import("../../mods/bakers/ticket/terminal.js");
const { findNode, withoutNode }: any = await import("../../mods/bakers/core/herdr.js");
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

// The run inside the panel: the selection, Herdr's layout and its terminals, as the window task
// sees them.

/** Selects a ticket (or none) with the panel shown on `child`. */
function select(id: string | null, child = "ticket") {
  activeSpace();
  env.shared["bakers.selected"] = id;
  env.focused = { space: "s1", tab: "t0", pane: "p1" };
  findNode(env.layout, "panel").hidden = false;
  findNode(env.layout, "panel-body").active = child;
}

/** Plays the recorded layout writes into env.layout the way Herdr does, then forgets them. */
function applies() {
  for (const [c, a] of runs() as [string, any][]) {
    if (c === "layout.set") env.layout = structuredClone(a.layout);
    if (c === "layout.show") findNode(env.layout, a.id).hidden = false;
    if (c === "layout.hide") findNode(env.layout, a.id).hidden = true;
    if (c === "layout.select") findNode(env.layout, a.stack).active = a.child;
  }
  env.calls.length = 0;
}

const col = () => findNode(env.layout, "run");
const panel = () => findNode(env.layout, "panel");
const sets = () => runs().filter(([c]) => c === "layout.set") as [string, any][];
const HEADER = {
  id: "run-header",
  type: "block",
  size: { px: 32 },
  resizable: false,
  content: { mod: "bakers", props: { view: "ticket.run" } },
};

/** The selected SHOP-41's run t7 shown in the panel, applied. */
function shown() {
  select("SHOP-41");
  env.terminals = [live("t7")];
  terminal.syncRun();
  applies();
}

beforeEach(() => {
  env.layout = bakersLayout(structuredClone(main));
});

afterEach(() => {
  // Herdr never takes the run over: no terminal command, no relabel, no close, no agent.focus, no hc.
  for (const [c] of runs() as [string][]) {
    expect(c.startsWith("terminal.")).toBe(false);
    expect(c.startsWith("pane.close")).toBe(false);
    expect(c.includes("label")).toBe(false);
    expect(c).not.toBe("agent.focus");
  }
  expect(env.calls.filter((c) => c.fn === "exec")).toEqual([]);
});

test("a live run of the selected ticket shows below the panel body, 1:1, focus untouched", () => {
  select("SHOP-41");
  const before = structuredClone(env.layout);
  env.terminals = [live("t7")];
  terminal.syncRun();
  expect(runs().map(([c]) => c)).toEqual(["layout.set"]);
  const tree = sets()[0][1].layout;
  const p = findNode(tree, "panel");
  expect(p.children.map((c: any) => c.id)).toEqual(["panel-body", "run"]);
  expect(findNode(tree, "panel-body").size).toEqual({ weight: 1 });
  expect(findNode(tree, "work-body").children.map((c: any) => c.id)).toEqual(["main", "panel"]);
  const { children, ...column } = findNode(tree, "run");
  expect(column).toEqual({ id: "run", type: "column", size: { weight: 1 }, hidden: false });
  expect(children).toEqual([
    HEADER,
    {
      id: "run-stack",
      type: "stack",
      size: { weight: 1 },
      active: "run-terminal",
      children: [{ id: "run-terminal", type: "block", content: { terminal: "t7" } }],
    },
  ]);
  // the rest of the tree is as read, the panel widened from the installed width
  const rest = structuredClone(tree);
  findNode(rest, "panel").children = findNode(before, "panel").children;
  findNode(rest, "panel").size = findNode(before, "panel").size;
  expect(rest).toEqual(before);
  expect(p.size).toEqual({ px: 480 });
});

test("a remote run shows by its address", () => {
  select("SHOP-41");
  env.terminals = [live("vps/t7")];
  terminal.syncRun();
  expect(findNode(sets()[0][1].layout, "run-terminal").content).toEqual({ terminal: "vps/t7" });
});

test("an unchanged tick writes nothing", () => {
  shown();
  terminal.syncRun();
  terminal.syncRun(Date.now() + 5000);
  expect(runs()).toEqual([]);
});

test("another selected ticket shows its run, keeping the split the user dragged", () => {
  shown();
  col().size = { weight: 2 };
  findNode(env.layout, "panel-body").size = { weight: 3 };
  select("SHOP-56");
  env.terminals = [live("t7"), live("t9", "SHOP-56")];
  terminal.syncRun();
  expect(runs().map(([c]) => c)).toEqual(["layout.set"]);
  const tree = sets()[0][1].layout;
  expect(findNode(tree, "run").size).toEqual({ weight: 2 });
  expect(findNode(tree, "panel-body").size).toEqual({ weight: 3 });
  expect(findNode(tree, "run-terminal").content).toEqual({ terminal: "t9" });
});

test("no run, another ticket without one, or the panel on Files hides the run once", () => {
  for (const away of [
    () => select(null),
    () => select("SHOP-56"),
    () => select("SHOP-41", "files"),
  ]) {
    shown();
    panel().size = { px: 600 };
    away();
    terminal.syncRun();
    expect(runs()).toEqual([["layout.hide", { id: "run" }]]);
    applies();
    terminal.syncRun();
    expect(runs()).toEqual([]);
    expect(env.terminals).toEqual([live("t7")]);
  }
});

test("a hidden run comes back with layout.show only", () => {
  shown();
  col().hidden = true;
  terminal.syncRun();
  expect(runs()).toEqual([["layout.show", { id: "run" }]]);
});

test("a finished run never shows", () => {
  select("SHOP-41");
  env.terminals = [live("t7", "SHOP-41", { state: "exited" })];
  terminal.syncRun();
  expect(runs()).toEqual([]);
});

test("the header left alone gets a new run's terminal", () => {
  shown();
  col().children = col().children.filter((c: any) => c.id !== "run-terminal");
  env.terminals = [live("t8")];
  terminal.syncRun();
  expect(runs().map(([c]) => c)).toEqual(["layout.set"]);
  const run = findNode(sets()[0][1].layout, "run");
  expect(run.children.map((c: any) => c.id)).toEqual(["run-header", "run-stack"]);
  expect(findNode(run, "run-terminal").content).toEqual({ terminal: "t8" });
});

test("Hide keeps the run hidden across selections and new runs", () => {
  shown();
  panel().size = { px: 600 };
  terminal.hideRun();
  expect(runs()).toEqual([["layout.hide", { id: "run" }]]);
  applies();
  terminal.syncRun();
  select("SHOP-56");
  env.terminals = [live("t7"), live("t9", "SHOP-56")];
  terminal.syncRun();
  select("SHOP-41");
  env.terminals = [live("t8")];
  terminal.syncRun();
  expect(runs()).toEqual([]);
});

test("the panel is 480 px while a run shows and 368 px again without; a user's width stays", () => {
  expect(panel().size).toEqual({ px: terminal.PANEL_PX });
  shown();
  expect(panel().size).toEqual({ px: 480 });
  select("SHOP-56");
  terminal.syncRun();
  expect(runs().map(([c]) => c)).toEqual(["layout.set"]);
  applies();
  expect(panel().size).toEqual({ px: 368 });
  expect(col().hidden).toBe(true);
  panel().size = { px: 600 };
  select("SHOP-41");
  terminal.syncRun();
  applies();
  expect(panel().size).toEqual({ px: 600 });
  expect(col().hidden).toBe(false);
  select("SHOP-56");
  terminal.syncRun();
  expect(runs()).toEqual([["layout.hide", { id: "run" }]]);
});

test("PANEL_PX is the width the installer gives the panel", () => {
  expect(findNode(bakersLayout(structuredClone(main)), "panel").size).toEqual({
    px: terminal.PANEL_PX,
  });
  expect(terminal.RUN_PX).toBe(480);
});

test("a run column an older version put into work-body moves into the panel in one write", () => {
  const body = findNode(env.layout, "work-body");
  env.layout = withoutNode(env.layout, "run");
  findNode(env.layout, "work-body").children.splice(1, 0, {
    id: "run",
    type: "column",
    size: { weight: 1 },
    children: [HEADER, { id: "run-terminal", type: "block", content: { terminal: "t7" } }],
  });
  expect(body).toBeDefined();
  select("SHOP-56");
  terminal.syncRun();
  expect(runs().map(([c]) => c)).toEqual(["layout.set"]);
  const tree = sets()[0][1].layout;
  expect(findNode(tree, "work-body").children.map((c: any) => c.id)).toEqual(["main", "panel"]);
  expect(findNode(tree, "panel").children.map((c: any) => c.id)).toEqual(["panel-body", "run"]);
  expect(findNode(tree, "run").hidden).toBe(true);
});

test("without a run column and nothing to show, no write; a run adds the column", () => {
  env.layout = withoutNode(env.layout, "run");
  select("SHOP-41");
  terminal.syncRun();
  expect(runs()).toEqual([]);
  env.terminals = [live("t7")];
  terminal.syncRun();
  expect(findNode(sets()[0][1].layout, "panel").children.map((c: any) => c.id)).toEqual([
    "panel-body",
    "run",
  ]);
});

test("no panel or no panel-body, no call", () => {
  select("SHOP-41");
  env.terminals = [live("t7")];
  env.layout = withoutNode(env.layout, "panel-body");
  terminal.syncRun();
  env.layout = { id: "root", children: [] };
  terminal.syncRun();
  expect(runs()).toEqual([]);
});

test("a run labelled with the ticket's UUID shows once the store knows it", async () => {
  env.terminals = [live("t7", "u41")];
  select("SHOP-41");
  terminal.syncRun();
  expect(runs()).toEqual([]);
  await ticketPanel();
  env.layout = bakersLayout(structuredClone(main));
  select("SHOP-41");
  env.calls.length = 0;
  terminal.syncRun();
  expect(findNode(sets()[0][1].layout, "run-terminal").content).toEqual({ terminal: "t7" });
});

test("does not repeat a write while layout() lags", () => {
  select("SHOP-41");
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

// The run stack: the agent's run first, then the ticket's Execute shells, switched with
// layout.select.

/** A live Execute shell of a ticket, opened at `opened` ms. */
const shell = (address: string, opened: string, id = "SHOP-41") => ({
  address,
  state: "live",
  labels: { "bakers.exec": id, "bakers.opened": opened },
});
const stack = () => findNode(env.layout, "run-stack");
const kids = (node: any) => node.children.map((c: any) => [c.id, c.content?.terminal]);

test("the run sits in run-stack with the ticket's shells after it, the agent active", () => {
  select("SHOP-41");
  env.terminals = [live("t7"), shell("vps/t21", "2000"), shell("t20", "1000")];
  terminal.syncRun();
  expect(runs().map(([c]) => c)).toEqual(["layout.set"]);
  const run = findNode(sets()[0][1].layout, "run");
  expect(run.children.map((c: any) => c.id)).toEqual(["run-header", "run-stack"]);
  const s = findNode(run, "run-stack");
  expect(s.type).toBe("stack");
  expect(s.size).toEqual({ weight: 1 });
  expect(s.active).toBe("run-terminal");
  expect(kids(s)).toEqual([
    ["run-terminal", "t7"],
    ["run-x-t20", "t20"],
    ["run-x-vps-t21", "vps/t21"],
  ]);
  expect(terminal.STACK).toBe("run-stack");
});

test('only the active tab changed: layout.select {stack: "run-stack", child}, no layout.set', () => {
  select("SHOP-41");
  env.terminals = [live("t7"), shell("t20", "1000"), shell("vps/t21", "2000")];
  terminal.syncRun();
  applies();
  env.shared["bakers.runTab"] = { "SHOP-41": "2000" };
  terminal.syncRun();
  expect(runs()).toEqual([["layout.select", { stack: "run-stack", child: "run-x-vps-t21" }]]);
  applies();
  terminal.syncRun();
  expect(runs()).toEqual([]);
  env.shared["bakers.runTab"] = {};
  terminal.syncRun();
  expect(runs()).toEqual([["layout.select", { stack: "run-stack", child: "run-terminal" }]]);
});

test("a shell that ended leaves in one layout.set, the agent active again", () => {
  select("SHOP-41");
  env.terminals = [live("t7"), shell("t20", "1000"), shell("t21", "2000")];
  env.shared["bakers.runTab"] = { "SHOP-41": "2000" };
  terminal.syncRun();
  applies();
  expect(stack().active).toBe("run-x-t21");
  env.terminals = [live("t7"), shell("t20", "1000"), { ...shell("t21", "2000"), state: "exited" }];
  terminal.syncRun();
  expect(runs().map(([c]) => c)).toEqual(["layout.set"]);
  const s = findNode(sets()[0][1].layout, "run-stack");
  expect(s.active).toBe("run-terminal");
  expect(kids(s)).toEqual([
    ["run-terminal", "t7"],
    ["run-x-t20", "t20"],
  ]);
});

test("another ticket's shells never show; its selection stays in bakers.runTab", () => {
  select("SHOP-56");
  env.terminals = [live("t7"), live("t9", "SHOP-56"), shell("t20", "1000")];
  env.shared["bakers.runTab"] = { "SHOP-41": "1000" };
  terminal.syncRun();
  applies();
  expect(kids(stack())).toEqual([["run-terminal", "t9"]]);
  expect(stack().active).toBe("run-terminal");
  select("SHOP-41");
  terminal.syncRun();
  applies();
  expect(kids(stack())).toEqual([
    ["run-terminal", "t7"],
    ["run-x-t20", "t20"],
  ]);
  expect(stack().active).toBe("run-x-t20");
  expect(env.shared["bakers.runTab"]).toEqual({ "SHOP-41": "1000" });
});

test("a run column without run-stack is rebuilt once", () => {
  // the shape HERDRAPP-13 stored: the run terminal directly in the shown column
  select("SHOP-41");
  panel().size = { px: 480 };
  col().hidden = false;
  col().children = [HEADER, { id: "run-terminal", type: "block", content: { terminal: "t7" } }];
  env.terminals = [live("t7")];
  terminal.syncRun();
  expect(runs().map(([c]) => c)).toEqual(["layout.set"]);
  applies();
  expect(col().children.map((c: any) => c.id)).toEqual(["run-header", "run-stack"]);
  expect(kids(stack())).toEqual([["run-terminal", "t7"]]);
  terminal.syncRun(Date.now() + 5000);
  expect(runs()).toEqual([]);
});

test("the run ends while shells live: the column hides, no terminal.kill", () => {
  select("SHOP-41");
  panel().size = { px: 600 };
  env.terminals = [live("t7"), shell("t20", "1000")];
  terminal.syncRun();
  applies();
  env.terminals = [live("t7", "SHOP-41", { state: "exited" }), shell("t20", "1000")];
  terminal.syncRun();
  expect(runs()).toEqual([["layout.hide", { id: "run" }]]);
  applies();
  // the next run of the ticket brings the shell back as a tab
  env.terminals = [live("t8"), shell("t20", "1000")];
  terminal.syncRun();
  applies();
  expect(col().hidden).toBe(false);
  expect(kids(stack())).toEqual([
    ["run-terminal", "t8"],
    ["run-x-t20", "t20"],
  ]);
});

test("an unchanged tick with shells writes nothing", () => {
  select("SHOP-41");
  env.terminals = [live("t7"), shell("t20", "1000"), shell("vps/t21", "2000")];
  env.shared["bakers.runTab"] = { "SHOP-41": "1000" };
  terminal.syncRun();
  applies();
  terminal.syncRun();
  terminal.syncRun(Date.now() + 5000);
  expect(runs()).toEqual([]);
});

// Show agent: selects the ticket, shows the panel and the run, and focuses the run.

test("Show agent selects the ticket, shows the panel and its run and focuses it", () => {
  select("SHOP-56", "files");
  findNode(env.layout, "panel").hidden = true;
  env.terminals = [live("t7")];
  env.shared["bakers.runHidden"] = true;
  terminal.showAgent("SHOP-41");
  expect(env.shared["bakers.selected"]).toBe("SHOP-41");
  // before Herdr applies the select, the same tick writes the run into the shown panel
  expect(runs().map(([c]) => c)).toEqual([
    "layout.select",
    "layout.show",
    "layout.set",
    "pane.focus",
  ]);
  expect(runs()[3]).toEqual(["pane.focus", { terminal: "t7" }]);
  expect(env.shared["bakers.runHidden"]).toBe(false);
  expect(env.shared["bakers.runFocus"]).toBe(null);
  applies();
  expect(findNode(env.layout, "panel").hidden).toBe(false);
  expect(col().hidden).toBe(false);
});

test("Show, Hide, then Show agent within 2 s shows the run again (F1)", () => {
  shown();
  col().hidden = true;
  terminal.syncRun();
  expect(runs()).toEqual([["layout.show", { id: "run" }]]);
  applies();
  terminal.hideRun();
  applies();
  terminal.showAgent("SHOP-41");
  expect(runs()).toContainEqual(["layout.show", { id: "run" }]);
  expect(runs().at(-1)).toEqual(["pane.focus", { terminal: "t7" }]);
});

test("selection changes never focus the run", () => {
  shown();
  select("SHOP-56");
  env.terminals = [live("t7"), live("t9", "SHOP-56")];
  terminal.syncRun();
  expect(runs().filter(([c]) => String(c).startsWith("pane."))).toEqual([]);
});

test("a focus request older than 5 s is dropped", () => {
  const now = Date.now();
  select("SHOP-41");
  env.terminals = [live("t7")];
  env.shared["bakers.runFocus"] = { id: "SHOP-41", at: now - 6000 };
  terminal.syncRun(now);
  expect(runs().filter(([c]) => c === "pane.focus")).toEqual([]);
  expect(env.shared["bakers.runFocus"]).toBe(null);
});

test("a selection moved elsewhere drops the request without focusing", () => {
  select("SHOP-41");
  env.terminals = [live("t7"), live("t9", "SHOP-56")];
  env.shared["bakers.runFocus"] = { id: "SHOP-56", at: Date.now() };
  terminal.syncRun();
  expect(runs().filter(([c]) => c === "pane.focus")).toEqual([]);
  expect(env.shared["bakers.runFocus"]).toBe(null);
});

test("Show agent with the panel hidden: the same tick's layout.set never hides it again", () => {
  shown();
  terminal.hideRun();
  applies();
  terminal.syncRun();
  applies(); // the width goes back to 368 through layout.set
  findNode(env.layout, "panel").hidden = true; // cmd-shift-T
  env.shared["bakers.runHidden"] = true;
  terminal.showAgent("SHOP-41");
  // Herdr applies the queued commands in order
  applies();
  expect(findNode(env.layout, "panel").hidden).toBe(false);
  expect(findNode(env.layout, "panel-body").active).toBe("ticket");
  expect(col().hidden).toBe(false);
});
