// The ticket's form definitions: their texts, fields and the actions their steps call, in
// order. The handling itself (steps, partial failures, keys) is tested in tests/form.
import { beforeEach, expect, test } from "bun:test";
import { backend, activeSpace, resetMod } from "../fixtures/shop";
import { reset, tools } from "../harness";

const F = "../../mods/bakers/ticket/form";
const { commentForm } = await import(`${F}/comment.js`);
const { editForm } = await import(`${F}/edit.js`);
const { stateForm, freezeForm, moveForm, cancelForm, consequence } = await import(
  `${F}/confirm.js`
);
const { createForm } = await import(`${F}/create.js`);
const { FormState } = await import("../../mods/bakers/form/state.js");
const { submit } = await import("../../mods/bakers/form/submit.js");

const writes = () => tools().filter(([t]) => !/_(read|list|search)$/.test(t));

beforeEach(() => {
  reset();
  resetMod();
  activeSpace();
  backend({
    bakers_comment_publish: {},
    bakers_ticket_update: {},
    bakers_ticket_transition: {},
    bakers_run_cancel: {},
    bakers_ticket_create: { identifier: "SHOP-70" },
  });
});

async function send(def: any, values: Record<string, any>) {
  const s = new FormState(def);
  Object.assign(s.values, values);
  const r = await submit(def, s);
  return { r, s };
}

test("comment form: answer mode sends the answer, then resumes the run", async () => {
  const def = commentForm("SHOP-41", "answer");
  expect(def.label).toBe("Answer to the agent's question");
  expect(def.fields.map((f: any) => [f.name, f.type, f.value])).toEqual([
    ["body", "textarea", ""],
    ["resume", "checkbox", true],
  ]);
  expect(def.buttons.map((b: any) => b.label)).toEqual(["Just comment", "Send answer"]);
  const { r } = await send(def, { body: " Show the page. ", variant: "answer" });
  expect(r.success).toBe("Answered SHOP-41, the run continues");
  expect(writes()).toEqual([
    ["bakers_comment_publish", { ticket: "SHOP-41", type: "comment", body: "Show the page." }],
    ["bakers_ticket_update", { ticket: "SHOP-41", frozen: false, labels_remove: ["Question"] }],
  ]);
});

test("comment form: Just comment and an unchecked box only comment; empty text is refused", async () => {
  await send(commentForm("SHOP-41", "answer"), { body: "Hi", variant: "comment" });
  await send(commentForm("SHOP-41", "answer"), { body: "Hi", variant: "answer", resume: false });
  expect(writes().map((w) => w[0])).toEqual(["bakers_comment_publish", "bakers_comment_publish"]);
  const { s } = await send(commentForm("SHOP-41", "comment"), { body: "  " });
  expect(s.errors).toEqual({ body: "Write something first." });
});

async function failingOnce(tool: string, rest: Record<string, any> = {}) {
  let failures = 1;
  backend({
    bakers_comment_publish: {},
    bakers_run_cancel: {},
    ...rest,
    [tool]: () => (failures-- > 0 ? new Error("Not allowed") : {}),
  });
}

test("answer retry: unchecking the box, or typing and deleting, does not post the answer twice", async () => {
  for (const edit of [
    (s: any) => s.set("resume", false),
    (s: any) => {
      s.set("body", "Hix");
      s.set("body", "Hi");
    },
  ]) {
    reset();
    await failingOnce("bakers_ticket_update");
    const def = commentForm("SHOP-41", "answer");
    const s = new FormState(def);
    Object.assign(s.values, { body: "Hi", variant: "answer" });
    expect((await submit(def, s)).ok).toBe(false);
    edit(s);
    expect((await submit(def, s)).ok).toBe(true);
    expect(writes().filter((w) => w[0] === "bakers_comment_publish").length).toBe(1);
  }
});

test("answer retry: an edited answer is posted again", async () => {
  await failingOnce("bakers_ticket_update");
  const def = commentForm("SHOP-41", "answer");
  const s = new FormState(def);
  Object.assign(s.values, { body: "Hi", variant: "answer" });
  await submit(def, s);
  s.set("body", "Hi, the page is /shop");
  expect((await submit(def, s)).ok).toBe(true);
  expect(
    writes()
      .filter((w) => w[0] === "bakers_comment_publish")
      .map((w) => w[1].body),
  ).toEqual(["Hi", "Hi, the page is /shop"]);
});

test("Move to... retry: an edited reason does not cancel the run again", async () => {
  await failingOnce("bakers_ticket_update");
  const def = await moveForm({ ticket: "SHOP-41", conductor: "c2", name: "ci-box" });
  const s = new FormState(def);
  await submit(def, s);
  s.set("reason", "wrong box");
  await submit(def, s);
  expect(writes().filter((w) => w[0] === "bakers_run_cancel").length).toBe(1);
});

test("edit form: fields from the ticket; warns when it changed meanwhile", async () => {
  const def = editForm({ identifier: "SHOP-41", title: "Old", description: "Was" });
  expect(def.fields.map((f: any) => [f.name, f.value])).toEqual([
    ["title", "Old"],
    ["description", "Was"],
  ]);
  expect(await def.check()).toBe(
    "SHOP-41 changed since you started editing. cmd-Enter again saves over it.",
  );
});

test("state form: texts of frame 4 and comment then transition", async () => {
  const def = await stateForm({ ticket: "SHOP-41", from: "review", to: "working" });
  expect(def).toMatchObject({
    title: "Move SHOP-41 to working?",
    pills: ["review", "working"],
    text: "A conductor picks SHOP-41 up and the agent starts coding on branch shop-41-checkout-empty-cart. You can move it back to review later.",
    hint: "Esc keeps it in review",
    keep: "Keep in review",
    submit: "Move to working",
    submitFirst: false,
  });
  await send(def, { comment: "Go." });
  expect(writes()).toEqual([
    ["bakers_comment_publish", { ticket: "SHOP-41", type: "comment", body: "Go." }],
    ["bakers_ticket_transition", { ticket: "SHOP-41", state: "working" }],
  ]);
  expect(consequence("SHOP-56", "plan", "done", null)).toBe(
    "This closes SHOP-56. A closed ticket cannot be changed any more.",
  );
});

test("freeze, move and cancel forms call their actions in order", async () => {
  const freeze = freezeForm({ ticket: "SHOP-41" });
  expect([freeze.keep, freeze.submit, freeze.keepSolid]).toEqual(["Keep", "Freeze", true]);
  await send(freeze, {});
  await send(await moveForm({ ticket: "SHOP-41", conductor: "k2", name: "ci-box" }), {
    reason: "",
  });
  await send(cancelForm({ ticket: "SHOP-41" }), { reason: "Stop" });
  expect(writes()).toEqual([
    ["bakers_ticket_update", { ticket: "SHOP-41", frozen: true }],
    ["bakers_run_cancel", { ticket: "SHOP-41", reason: "Moved to ci-box" }],
    ["bakers_ticket_update", { ticket: "SHOP-41", conductor: "k2" }],
    ["bakers_run_cancel", { ticket: "SHOP-41", reason: "Stop" }],
  ]);
});

test("create form: a title is required", async () => {
  const { s } = await send(createForm(), { title: " " });
  expect(s.errors).toEqual({ title: "A ticket needs a title." });
  expect(writes()).toEqual([]);
});
