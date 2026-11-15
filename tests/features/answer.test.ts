import { beforeEach, expect, test } from "bun:test";
import { ticketTab } from "../fixtures/shop";
import { click, env, find, findText, flush, key, reset, texts, tools } from "../harness";

const ctx: any = await import("../../mods/bakers/core/session.js");
const tabs: any = await import("../../mods/bakers/core/tabs.js");

const writes = () => tools().filter(([t]) => !/_(read|list|search)$/.test(t));

beforeEach(() => {
  reset();
  ctx._resetForTests();
  tabs._resetForTests();
});

async function answering(extra: Record<string, unknown> = {}) {
  const copy = await ticketTab("SHOP-41", {
    bakers_comment_publish: { id: "c9" },
    bakers_ticket_update: {},
    ...extra,
  });
  click(find(copy.render(), "answer-below"));
  copy.inner.composer.text.type(
    "Show the empty-cart page with suggestions. The redirect was the old behavior.",
  );
  env.calls.length = 0;
  return copy;
}

test("answer mode shows its label, the checked checkbox, the hint and both buttons", async () => {
  const copy = await answering();
  const root = find(copy.render(), "composer");
  expect(texts(root)).toEqual([
    "Answer to the agent's question",
    "Unfreeze and remove the label Question",
    "cmd-Enter sends, Esc back to a plain comment",
    "Just comment",
    "Send answer",
  ]);
  expect(copy.inner.composer.unfreeze).toBe(true);
  expect(root.calls.border_color).toEqual(["accent"]);
});

test("Send answer posts the comment, then unfreezes and removes Question, then toasts", async () => {
  const copy = await answering();
  click(find(copy.render(), "send-answer"));
  await flush();
  expect(writes()).toEqual([
    [
      "bakers_comment_publish",
      {
        ticket: "SHOP-41",
        type: "comment",
        body: "Show the empty-cart page with suggestions. The redirect was the old behavior.",
      },
    ],
    ["bakers_ticket_update", { ticket: "SHOP-41", frozen: false, labels_remove: ["Question"] }],
  ]);
  const toast: any = env.calls.find((c) => c.fn === "notify")?.args[0];
  expect(toast.title).toBe("Answered SHOP-41, the run continues");
  expect(copy.inner.composer.text.value()).toBe("");
  expect(copy.inner.composer.mode).toBe("comment");
});

test("unchecked, Send answer only posts the comment", async () => {
  const copy = await answering();
  click(find(copy.render(), "unfreeze"));
  click(find(copy.render(), "send-answer"));
  await flush();
  expect(writes().map((w) => w[0])).toEqual(["bakers_comment_publish"]);
});

test("Just comment only posts the comment", async () => {
  const copy = await answering();
  click(find(copy.render(), "just-comment"));
  await flush();
  expect(writes()).toEqual([
    [
      "bakers_comment_publish",
      {
        ticket: "SHOP-41",
        type: "comment",
        body: "Show the empty-cart page with suggestions. The redirect was the old behavior.",
      },
    ],
  ]);
});

test("cmd-Enter sends the answer; Esc goes back to a plain comment and keeps the text", async () => {
  const copy = await answering();
  copy.inner.composer.text.handlers.focus({}, {});
  key(copy.render(), "escape");
  expect(copy.inner.composer.mode).toBe("comment");
  expect(copy.inner.composer.text.value()).toContain("Show the empty-cart page");
  expect(writes()).toEqual([]);
  click(find(copy.render(), "answer-below"));
  copy.inner.composer.text.handlers.focus({}, {});
  key(copy.render(), "cmd-enter");
  await flush();
  expect(writes().map((w) => w[0])).toEqual(["bakers_comment_publish", "bakers_ticket_update"]);
});

test("a failed unfreeze after the comment names the step and keeps the text", async () => {
  const copy = await answering({ bakers_ticket_update: new Error("Not allowed") });
  click(find(copy.render(), "send-answer"));
  await flush();
  expect(copy.inner.composer.error).toBe("Comment posted; unfreezing failed: Not allowed");
  expect(findText(copy.render(), "Comment posted; unfreezing failed: Not allowed")).toBeDefined();
  expect(copy.inner.composer.text.value()).toContain("Show the empty-cart page");
});

test("the first keystroke in the composer pins the preview tab", async () => {
  env.shared["bakers.preview"] = { id: "SHOP-41", index: null };
  const copy = await ticketTab("SHOP-41");
  env.shared["bakers.preview"] = { id: "SHOP-41", index: null };
  copy.inner.composer.text.type("H");
  expect(env.shared["bakers.preview"]).toBe(null);
});

test("a plain comment from comment mode", async () => {
  const copy = await ticketTab("SHOP-58", { bakers_comment_publish: { id: "c9" } });
  copy.inner.composer.text.type("Looks good");
  env.calls.length = 0;
  click(find(copy.render(), "send-comment"));
  await flush();
  expect(writes()).toEqual([
    ["bakers_comment_publish", { ticket: "SHOP-58", type: "comment", body: "Looks good" }],
  ]);
});
