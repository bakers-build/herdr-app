import { beforeEach, expect, test } from "bun:test";
import { live, resetMod, ticketPanel } from "../../fixtures/shop";
import { click, env, find, flush, load, mount, reset, runs, texts } from "../../harness";

beforeEach(() => {
  reset();
  resetMod();
});

/** The run column as the layout holds it, its terminal block showing `address` (or none). */
function column(address: string | null) {
  env.layout = {
    id: "root",
    children: [
      {
        id: "run",
        type: "column",
        children: [
          { id: "run-header", type: "block" },
          ...(address
            ? [{ id: "run-terminal", type: "block", content: { terminal: address } }]
            : []),
        ],
      },
    ],
  };
}

async function header() {
  const Bakers = await load("bakers/main.js");
  return mount(Bakers, { view: "ticket.run" });
}

test("the header names the run, program, address and machine", async () => {
  column("vps/t7");
  env.terminals = [live("vps/t7")];
  expect(texts((await header()).render())).toEqual(["Run 3", "vps/t7", "vps", "Hide"]);
});

test("a local run says this computer", async () => {
  column("t7");
  env.terminals = [live("t7")];
  expect(texts((await header()).render())).toEqual(["Run 3", "t7", "this computer", "Hide"]);
});

test("without its terminal the header shows only Hide", async () => {
  column(null);
  env.terminals = [live("t7")];
  expect(texts((await header()).render())).toEqual(["Hide"]);
});

test("Hide hides the column and leaves the run alone", async () => {
  column("t7");
  env.terminals = [live("t7")];
  const copy = await header();
  env.calls.length = 0;
  click(find(copy.render(), "run-hide"));
  expect(runs()).toEqual([["layout.hide", { id: "run" }]]);
  expect(env.shared["bakers.runHidden"]).toBe(true);
});

test("render only reads", async () => {
  column("t7");
  env.terminals = [live("t7")];
  const copy = await header();
  env.calls.length = 0;
  copy.render();
  copy.render();
  expect(env.calls.filter((c) => c.fn === "run" || c.fn === "setShared")).toEqual([]);
});

const shell = (address: string, opened: string, id = "SHOP-41") => ({
  address,
  state: "live",
  labels: { "bakers.exec": id, "bakers.opened": opened },
  program: { name: "zsh" },
});

function stack(...shown: string[]) {
  env.shared["bakers.selected"] = "SHOP-41";
  env.layout = {
    id: "root",
    children: [
      {
        id: "run",
        type: "column",
        children: [
          { id: "run-header", type: "block" },
          { id: "run-terminal", type: "block", content: { terminal: "t7" } },
          ...shown.map((a) => ({ id: `run-x-${a}`, type: "block", content: { terminal: a } })),
        ],
      },
    ],
  };
}

test("the agent's tab comes first and is active; it has no close", async () => {
  stack();
  env.terminals = [
    live("t7", "SHOP-41", { cwd: "/w" }),
    shell("t20", "1000"),
    shell("t21", "2000"),
  ];
  const tree = (await header()).render();
  expect(texts(tree)).toEqual([
    "Run 3",
    "Shell 1",
    "×",
    "Shell 2",
    "×",
    "t7",
    "this computer",
    "Execute",
    "Hide",
  ]);
  expect(find(tree, "run-tab-agent")).toBeTruthy();
  expect(find(tree, "run-close-agent")).toBeFalsy();
  expect(find(tree, "run-close-1000")).toBeTruthy();
});

test("Execute starts a shell with the run's cwd and shows it after the sync; no pane.focus", async () => {
  stack();
  env.terminals = [live("t7", "SHOP-41", { cwd: "/w" })];
  const copy = await header();
  env.calls.length = 0;
  click(find(copy.render(), "run-execute"));
  await flush();
  const hc = env.calls.find((c) => c.fn === "hc") as any;
  expect(hc.args[0].slice(0, 6)).toEqual(["run", "--json", "--bg", "--no-parent", "--cwd", "/w"]);
  expect(env.shared["bakers.runTab"]).toBeTruthy();
  expect(runs().some((r) => r[0] === "pane.focus")).toBe(false);
});

test("clicking a tab selects it and syncs", async () => {
  stack();
  env.terminals = [live("t7"), shell("t20", "1000")];
  const copy = await header();
  click(find(copy.render(), "run-tab-1000"));
  expect(env.shared["bakers.runTab"]).toEqual({ "SHOP-41": "1000" });
  click(find(copy.render(), "run-tab-agent"));
  expect(env.shared["bakers.runTab"]).toEqual({});
});

test("close kills the shell, never the run", async () => {
  stack();
  env.shared["bakers.runTab"] = { "SHOP-41": "1000" };
  env.terminals = [live("t7"), shell("t20", "1000")];
  const copy = await header();
  env.calls.length = 0;
  click(find(copy.render(), "run-close-1000"));
  const kills = runs().filter((r) => r[0] === "terminal.kill");
  expect(kills).toEqual([["terminal.kill", { terminal: "t20" }]]);
  expect(env.shared["bakers.runTab"]).toEqual({});
});

test("no Execute without a live run or without its cwd", async () => {
  stack();
  env.terminals = [live("t7")];
  expect(find((await header()).render(), "run-execute")).toBeFalsy();
  env.terminals = [live("t7", "SHOP-41", { cwd: "" })];
  expect(find((await header()).render(), "run-execute")).toBeFalsy();
  env.terminals = [live("t7", "SHOP-41", { cwd: "/w", state: "exited" })];
  expect(find((await header()).render(), "run-execute")).toBeFalsy();
});

test("the header names the shown shell's address and machine; Hide still hides", async () => {
  stack("vps-t20");
  env.shared["bakers.runTab"] = { "SHOP-41": "1000" };
  env.terminals = [live("t7"), shell("vps/t20", "1000")];
  const copy = await header();
  const out = texts(copy.render());
  expect(out).toContain("vps/t20");
  expect(out).toContain("vps");
  env.calls.length = 0;
  click(find(copy.render(), "run-hide"));
  expect(runs()).toEqual([["layout.hide", { id: "run" }]]);
});

/** The active tab colour, read from the theme after the harness has mocked herdr. */
async function selected() {
  const { tokens } = await import("../../../mods/bakers/ui/theme.js");
  return tokens().selected;
}

/** terminals() answers fresh copies on every read, as Herdr's host call may: no two reads share
 *  an object, so a tab must be matched by its key, never by identity. */
function freshReads(list: any[]) {
  let base = list;
  Object.defineProperty(env, "terminals", {
    configurable: true,
    enumerable: true,
    get: () => base.map((t) => ({ ...t, labels: { ...t.labels } })),
    set: (v) => {
      base = v;
    },
  });
}

test("the shown shell's tab is active when terminals() returns fresh objects", async () => {
  stack();
  env.shared["bakers.runTab"] = { "SHOP-41": "2000" };
  freshReads([live("t7", "SHOP-41", { cwd: "/w" }), shell("t20", "1000"), shell("t21", "2000")]);
  const tree = (await header()).render();
  const active = await selected();
  expect(find(tree, "run-tab-2000").calls.bg).toEqual([active]);
  expect(find(tree, "run-tab-2000").calls.font_semibold).toBeDefined();
  expect(find(tree, "run-tab-1000").calls.bg).not.toEqual([active]);
  expect(find(tree, "run-tab-agent").calls.bg).not.toEqual([active]);
});

test("with no shell shown the agent's tab is active when terminals() returns fresh objects", async () => {
  stack();
  freshReads([live("t7", "SHOP-41", { cwd: "/w" }), shell("t20", "1000")]);
  const tree = (await header()).render();
  const active = await selected();
  expect(find(tree, "run-tab-agent").calls.bg).toEqual([active]);
  expect(find(tree, "run-tab-1000").calls.bg).not.toEqual([active]);
});

test("a run labelled with the ticket's UUID offers Execute", async () => {
  await ticketPanel();
  stack();
  env.terminals = [live("t7", "u41", { cwd: "/w" })];
  expect(find((await header()).render(), "run-execute")).toBeTruthy();
});
