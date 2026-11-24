import { beforeEach, expect, test } from "bun:test";
import { live, resetMod } from "../fixtures/shop";
import { env, reset, runs } from "../harness";

const exec: any = await import("../../mods/bakers/ticket/exec.js");
const terminal: any = await import("../../mods/bakers/ticket/terminal.js");

beforeEach(() => {
  reset();
  resetMod();
});

const shell = (address: string, opened: string | null, id = "SHOP-41", extra: any = {}) => ({
  address,
  state: "live",
  labels: { "bakers.exec": id, ...(opened == null ? {} : { "bakers.opened": opened }) },
  ...extra,
});

test("shells lists a ticket's live shells oldest first, never its run or another ticket's", () => {
  env.terminals = [
    shell("t3", "3000"),
    live("t7"),
    shell("t1", "1000"),
    shell("t9", "2000", "SHOP-42"),
    shell("t2", "2000"),
    shell("t5", "5000", "SHOP-41", { state: "exited" }),
  ];
  expect(exec.shells("SHOP-41").map((s: any) => s.address)).toEqual(["t1", "t2", "t3"]);
});

test("a shell without a numeric opened label sorts last", () => {
  env.terminals = [
    shell("t1", null),
    shell("t2", "oops"),
    shell("t3", "2000"),
    shell("t4", "1000"),
  ];
  expect(exec.shells("SHOP-41").map((s: any) => s.address)).toEqual(["t4", "t3", "t1", "t2"]);
});

test("a shell without an opened label is selected by its address and closed", () => {
  env.terminals = [shell("t1", null), shell("t4", "1000")];
  const bare = exec.shells("SHOP-41")[1];
  expect(bare.address).toBe("t1");
  expect(exec.tabKey(bare)).toBe("t1");
  expect(exec.tabKey(exec.shells("SHOP-41")[0])).toBe("1000");
  exec.selectTab("SHOP-41", exec.tabKey(bare));
  expect(exec.shownShell("SHOP-41")?.address).toBe("t1");
  exec.closeShell("SHOP-41", bare);
  expect(runs()).toContainEqual(["terminal.kill", { terminal: "t1" }]);
  expect(env.shared[exec.TAB]).toEqual({});
});

test("shownShell names the selected shell, or null for the agent's tab or a gone shell", () => {
  env.terminals = [shell("t1", "1000"), shell("t2", "2000")];
  expect(exec.shownShell("SHOP-41")).toBeNull();
  exec.selectTab("SHOP-41", "2000");
  expect(exec.shownShell("SHOP-41")?.address).toBe("t2");
  exec.selectTab("SHOP-41", "9999");
  expect(exec.shownShell("SHOP-41")).toBeNull();
  exec.selectTab("SHOP-41", "2000");
  exec.selectTab("SHOP-41", null);
  expect(exec.shownShell("SHOP-41")).toBeNull();
  expect(env.shared[exec.TAB]).toEqual({});
});

test("shellArgs on this computer: no --on; on vps: --on vps; without cwd: null", () => {
  expect(exec.shellArgs("SHOP-41", { address: "t7", cwd: "/w/shop-41" }, 1000)).toEqual([
    "run",
    "--json",
    "--bg",
    "--no-parent",
    "--cwd",
    "/w/shop-41",
    "--label",
    "bakers.exec=SHOP-41",
    "--label",
    "bakers.opened=1000",
  ]);
  expect(exec.shellArgs("SHOP-41", { address: "vps/t7", cwd: "/w/shop-41" }, 1000)).toEqual([
    "run",
    "--json",
    "--bg",
    "--no-parent",
    "--cwd",
    "/w/shop-41",
    "--on",
    "vps",
    "--label",
    "bakers.exec=SHOP-41",
    "--label",
    "bakers.opened=1000",
  ]);
  expect(exec.shellArgs("SHOP-41", { address: "t7", cwd: "" }, 1000)).toBeNull();
  expect(exec.shellArgs("SHOP-41", undefined, 1000)).toBeNull();
});

test("startShell selects the new shell; a failed hc toasts and selects nothing", async () => {
  const r = { address: "t7", cwd: "/w/shop-41" };
  expect(await exec.startShell("SHOP-41", r)).toBe(true);
  const call = env.calls.find((c) => c.fn === "hc") as any;
  expect(call.args[0].slice(0, 2)).toEqual(["run", "--json"]);
  expect((env.shared[exec.TAB] as any)["SHOP-41"]).toMatch(/^\d{10,}$/);

  reset();
  env.shared = {};
  env.hc = () => ({ code: 1, stdout: "", stderr: "no such machine" });
  expect(await exec.startShell("SHOP-41", r)).toBe(false);
  expect(env.shared[exec.TAB]).toBeUndefined();
  const toast = env.calls.find((c) => c.fn === "notify") as any;
  expect(toast.args[0]).toEqual({
    title: "Execute failed",
    body: "no such machine",
    level: "error",
  });
  expect(await exec.startShell("SHOP-41", { address: "t7", cwd: "" })).toBe(false);
});

test("closeShell kills the shell and drops the selection only when it was shown", () => {
  const a = shell("t1", "1000");
  const b = shell("t2", "2000");
  env.terminals = [a, b];
  exec.selectTab("SHOP-41", "1000");
  exec.selectTab("SHOP-42", "7");
  exec.closeShell("SHOP-41", b);
  expect(runs()).toContainEqual(["terminal.kill", { terminal: "t2" }]);
  expect(env.shared[exec.TAB]).toEqual({ "SHOP-41": "1000", "SHOP-42": "7" });
  exec.closeShell("SHOP-41", a);
  expect(env.shared[exec.TAB]).toEqual({ "SHOP-42": "7" });
});

test("childId of vps/t9 is run-x-vps-t9", () => {
  expect(exec.childId("vps/t9")).toBe("run-x-vps-t9");
});

test("runTerminal never returns a shell, even one labelled for the ticket's UUID", () => {
  env.terminals = [shell("t1", "1000", "uuid-41")];
  expect(terminal.runTerminal("SHOP-41", "uuid-41")).toBeUndefined();
});
