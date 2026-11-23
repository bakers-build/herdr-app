import { beforeEach, expect, test } from "bun:test";
import { live, resetMod } from "../../fixtures/shop";
import { click, env, find, load, mount, reset, runs, texts } from "../../harness";

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
  expect(texts((await header()).render())).toEqual([
    "Run 3",
    "Claude Code",
    "vps/t7",
    "vps",
    "Hide",
  ]);
});

test("a local run says this computer", async () => {
  column("t7");
  env.terminals = [live("t7")];
  expect(texts((await header()).render())).toEqual([
    "Run 3",
    "Claude Code",
    "t7",
    "this computer",
    "Hide",
  ]);
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
