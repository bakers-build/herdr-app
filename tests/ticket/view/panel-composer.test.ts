import { beforeEach, expect, test } from "bun:test";
import { ticketPanel, resetMod } from "../../fixtures/shop";
import { click, env, find, findText, flush, key, reset, texts, tools } from "../../harness";

const writes = () => tools().filter(([t]) => !/_(read|list|search)$/.test(t));

beforeEach(() => {
  reset();
  resetMod();
});

async function answering(extra: Record<string, unknown> = {}) {
  const copy = await ticketPanel("SHOP-41", {
    bakers_comment_publish: { id: "c9" },
    bakers_ticket_update: {},
    ...extra,
  });
  click(find(copy.render(), "answer-below"));
  copy.inner.doc.composer.inputs
    .input("body")
    .type("Show the empty-cart page with suggestions. The redirect was the old behavior.");
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
  expect(copy.inner.doc.composer.state.values.resume).toBe(true);
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
  expect(copy.inner.doc.composer.inputs.input("body").value()).toBe("");
  expect(copy.inner.doc.composer.mode).toBe("comment");
});

test("unchecked, Send answer only posts the comment", async () => {
  const copy = await answering();
  click(find(copy.render(), "resume"));
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
  copy.inner.doc.composer.inputs.input("body").handlers.focus({}, {});
  key(copy.render(), "escape");
  expect(copy.inner.doc.composer.mode).toBe("comment");
  expect(copy.inner.doc.composer.inputs.input("body").value()).toContain(
    "Show the empty-cart page",
  );
  expect(writes()).toEqual([]);
  click(find(copy.render(), "answer-below"));
  copy.inner.doc.composer.inputs.input("body").handlers.focus({}, {});
  key(copy.render(), "cmd-enter");
  await flush();
  expect(writes().map((w) => w[0])).toEqual(["bakers_comment_publish", "bakers_ticket_update"]);
});

test("a failed unfreeze after the comment names the step and keeps the text", async () => {
  const copy = await answering({ bakers_ticket_update: new Error("Not allowed") });
  click(find(copy.render(), "send-answer"));
  await flush();
  expect(copy.inner.doc.composer.state.message?.message).toBe(
    "Comment posted; unfreezing failed: Not allowed",
  );
  expect(findText(copy.render(), "Comment posted; unfreezing failed: Not allowed")).toBeDefined();
  expect(copy.inner.doc.composer.inputs.input("body").value()).toContain(
    "Show the empty-cart page",
  );
});

test("a retried answer after a failed unfreeze posts the comment once", async () => {
  let failures = 1;
  const copy = await answering({
    bakers_ticket_update: () => (failures-- > 0 ? new Error("Not allowed") : {}),
  });
  click(find(copy.render(), "send-answer"));
  await flush();
  click(find(copy.render(), "send-answer"));
  await flush();
  expect(writes().map((w) => w[0])).toEqual([
    "bakers_comment_publish",
    "bakers_ticket_update",
    "bakers_ticket_update",
  ]);
  const toast: any = env.calls.find((c) => c.fn === "notify")?.args[0];
  expect(toast.title).toBe("Answered SHOP-41, the run continues");
});

test("a plain comment from comment mode", async () => {
  const copy = await ticketPanel("SHOP-58", { bakers_comment_publish: { id: "c9" } });
  copy.inner.doc.composer.inputs.input("body").type("Looks good");
  env.calls.length = 0;
  click(find(copy.render(), "send-comment"));
  await flush();
  expect(writes()).toEqual([
    ["bakers_comment_publish", { ticket: "SHOP-58", type: "comment", body: "Looks good" }],
  ]);
});
