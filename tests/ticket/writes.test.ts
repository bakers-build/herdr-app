// The writes of ticket/commands.js that the section form sends, and the rules it reads.
import { beforeEach, expect, test } from "bun:test";
import { cli, reset, tools } from "../harness";

const commands: any = await import("../../mods/bakers/ticket/commands.js");
const rules: any = await import("../../mods/bakers/ticket/rules.js");

beforeEach(reset);

test("publish posts a comment of the given type", async () => {
  cli({ bakers_comment_publish: { id: "c9" } });
  await commands.publish("SHOP-41", "acceptance", "AC1 holds.");
  expect(tools()).toEqual([
    ["bakers_comment_publish", { ticket: "SHOP-41", type: "acceptance", body: "AC1 holds." }],
  ]);
});

test("comment is a publish of type comment", async () => {
  cli({ bakers_comment_publish: { id: "c9" } });
  await commands.comment("SHOP-41", "Hello");
  expect(tools()).toEqual([
    ["bakers_comment_publish", { ticket: "SHOP-41", type: "comment", body: "Hello" }],
  ]);
});

test("describe replaces the description alone", async () => {
  cli({ bakers_ticket_update: {} });
  await commands.describe("SHOP-41", "New text");
  expect(tools()).toEqual([["bakers_ticket_update", { ticket: "SHOP-41", description: "New text" }]]);
});

test("newest is the last comment of a type, null when there is none", () => {
  const comments = [
    { id: "a1", type: "acceptance", body: "old" },
    { id: "c1", type: "comment", body: "x" },
    { id: "a2", type: "acceptance", body: "new" },
  ];
  expect(rules.newest(comments, "acceptance").id).toBe("a2");
  expect(rules.newest(comments, "summary")).toBe(null);
  expect(rules.newest(undefined, "summary")).toBe(null);
});

test("the section limits are UTF-8 bytes per section", () => {
  expect(rules.SECTION_LIMITS).toEqual({ description: 6144, acceptance: 3072, summary: 3072 });
});
