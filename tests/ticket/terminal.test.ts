import { beforeEach, expect, test } from "bun:test";
import { live, resetMod } from "../fixtures/shop";
import { env, reset } from "../harness";

const terminal: any = await import("../../mods/bakers/ticket/terminal.js");

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
