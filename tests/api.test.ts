import { beforeEach, expect, test } from "bun:test";
import { cli, env, reset, tools } from "./harness";

const api: any = await import("../mods/bakers/lib/api.js");

beforeEach(reset);

test("call sends bakers tools <tool> --data <json>", async () => {
  cli({ bakers_ticket_read: { identifier: "SHOP-41" } });
  const r = await api.call("bakers_ticket_read", { ticket: "SHOP-41" });
  expect(env.calls[0]).toEqual({
    fn: "exec",
    args: ["bakers", ["tools", "bakers_ticket_read", "--data", '{"ticket":"SHOP-41"}']],
  });
  expect(r).toEqual({ identifier: "SHOP-41" });
});

test("call parses plain JSON output too", async () => {
  env.exec = async () => ({ code: 0, stdout: '{"ok":true}', stderr: "" });
  expect(await api.call("bakers_ticket_read", { ticket: "X-1" })).toEqual({ ok: true });
});

test("nonzero exit throws BakersError with the CLI's message", async () => {
  cli({ bakers_ticket_read: new Error("Ticket X-9 does not exist") });
  const err: any = await api.call("bakers_ticket_read", { ticket: "X-9" }).catch((e: any) => e);
  expect(err).toBeInstanceOf(api.BakersError);
  expect(err.tool).toBe("bakers_ticket_read");
  expect(err.code).toBe(1);
  expect(err.message).toBe("Ticket X-9 does not exist");
  expect(err.offline).toBe(false);
  expect(err.unknownTool).toBe(false);
});

test("an unknown tool is flagged for the API chip", async () => {
  cli({});
  const err: any = await api.call("bakers_conductor_list", {}).catch((e: any) => e);
  expect(err.unknownTool).toBe(true);
  expect(err.code).toBe(4);
});

test("exec rejection or exit 127 is offline", async () => {
  env.exec = async () => {
    throw new Error("spawn bakers ENOENT");
  };
  const a: any = await api.call("bakers_ticket_read", { ticket: "X-1" }).catch((e: any) => e);
  expect(a.offline).toBe(true);
  env.exec = async () => ({ code: 127, stdout: "", stderr: "command not found" });
  const b: any = await api.call("bakers_ticket_read", { ticket: "X-1" }).catch((e: any) => e);
  expect(b.offline).toBe(true);
});

test("call passes a 30 s timeout to exec", async () => {
  let seen: any;
  env.exec = async (_c, _a, opts) => {
    seen = opts;
    return { code: 0, stdout: "{}", stderr: "" };
  };
  await api.call("bakers_ticket_read", { ticket: "X-1" });
  expect(seen).toEqual({ timeout: 30000 });
});

test("listTickets pages until next_offset is gone", async () => {
  cli({
    bakers_ticket_list: (a: any) =>
      a.offset === 0
        ? { tickets: [{ identifier: "A-1" }, { identifier: "A-2" }], next_offset: 2 }
        : { tickets: [{ identifier: "A-3" }], next_offset: null },
  });
  const list = await api.listTickets("p-1");
  expect(list.map((t: any) => t.identifier)).toEqual(["A-1", "A-2", "A-3"]);
  expect(tools()).toEqual([
    ["bakers_ticket_list", { project: "p-1", limit: 100, offset: 0 }],
    ["bakers_ticket_list", { project: "p-1", limit: 100, offset: 2 }],
  ]);
});

test("writes send their documented arguments", async () => {
  cli({
    bakers_comment_publish: { id: "c1" },
    bakers_ticket_update: {},
    bakers_ticket_classify: {},
    bakers_ticket_transition: {},
    bakers_run_cancel: {},
    bakers_ticket_create: { identifier: "A-9" },
    bakers_ticket_search: { tickets: [] },
  });
  await api.publishComment("A-1", "Hi");
  await api.updateTicket("A-1", { frozen: false, labels_remove: ["Question"] });
  await api.classifyTicket("A-1", { type: "bug" });
  await api.transitionTicket("A-1", "working");
  await api.cancelRun("A-1", "Moved");
  await api.createTicket({ title: "T", project: "p", workflow: "bb_work" });
  await api.searchTickets("deliv", "p");
  expect(tools()).toEqual([
    ["bakers_comment_publish", { ticket: "A-1", type: "comment", body: "Hi" }],
    ["bakers_ticket_update", { ticket: "A-1", frozen: false, labels_remove: ["Question"] }],
    ["bakers_ticket_classify", { ticket: "A-1", type: "bug" }],
    ["bakers_ticket_transition", { ticket: "A-1", state: "working" }],
    ["bakers_run_cancel", { ticket: "A-1", reason: "Moved" }],
    ["bakers_ticket_create", { title: "T", project: "p", workflow: "bb_work" }],
    ["bakers_ticket_search", { query: "deliv", project: "p" }],
  ]);
});
