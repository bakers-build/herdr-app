import { expect, test } from "bun:test";
import "../harness";

const { FormState } = await import("../../mods/bakers/form/state.js");
const { submit } = await import("../../mods/bakers/form/submit.js");
const { formKey } = await import("../../mods/bakers/form/keys.js");

const def = (steps: any[], extra: any = {}) => ({
  fields: [{ name: "body", type: "textarea", value: "Hi" }],
  steps,
  ...extra,
});

test("the state starts from the fields' values and tracks changes", () => {
  const s = new FormState({
    fields: [
      { name: "a", type: "input", value: "x" },
      { name: "b", type: "checkbox", value: true },
      { name: "c", type: "textarea" },
    ],
  });
  expect(s.values).toEqual({ a: "x", b: true, c: "" });
  expect(s.dirty).toBe(false);
  s.set("c", "y");
  expect(s.dirty).toBe(true);
});

test("steps run in order; skipped steps do not run; success text returned", async () => {
  const ran: string[] = [];
  const d = def(
    [
      { run: async () => ran.push("one"), done: "One done" },
      { when: () => false, run: async () => ran.push("skip") },
      { run: async () => ran.push("two") },
    ],
    { success: (v: any) => `Sent ${v.body}` },
  );
  const r = await submit(d, new FormState(d));
  expect(ran).toEqual(["one", "two"]);
  expect(r).toMatchObject({ ok: true, success: "Sent Hi" });
});

test("a later step failing names what was done and what failed; values stay", async () => {
  const d = def([
    { run: async () => {}, done: "Comment posted" },
    {
      run: async () => {
        throw new Error("Not allowed");
      },
      failed: "unfreezing failed",
    },
  ]);
  const s = new FormState(d);
  const r = await submit(d, s);
  expect(r.ok).toBe(false);
  expect(s.message).toEqual({
    kind: "denied",
    message: "Comment posted; unfreezing failed: Not allowed",
  });
  expect(s.values.body).toBe("Hi");
  expect(s.busy).toBe(false);
});

test("a retry after a partial failure runs only the steps that did not finish", async () => {
  const ran: string[] = [];
  let failures = 1;
  const d = def(
    [
      { run: async () => ran.push("comment"), done: "Comment posted" },
      {
        run: async () => {
          ran.push("unfreeze");
          if (failures-- > 0) throw new Error("Not allowed");
        },
        failed: "unfreezing failed",
      },
    ],
    { success: "Answered" },
  );
  const s = new FormState(d);
  expect((await submit(d, s)).ok).toBe(false);
  expect(await submit(d, s)).toMatchObject({ ok: true, success: "Answered" });
  expect(ran).toEqual(["comment", "unfreeze", "unfreeze"]);
});

test("a retry after a field the step posts was edited runs the step again", async () => {
  const posted: string[] = [];
  let failures = 1;
  const d = def(
    [
      { uses: ["body"], run: async (v: any) => posted.push(v.body), done: "Comment posted" },
      {
        run: async () => {
          if (failures-- > 0) throw new Error("Not allowed");
        },
        failed: "unfreezing failed",
      },
    ],
    { success: "Answered" },
  );
  const s = new FormState(d);
  expect((await submit(d, s)).ok).toBe(false);
  s.set("body", "edited");
  expect(await submit(d, s)).toMatchObject({ ok: true, success: "Answered" });
  expect(posted).toEqual(["Hi", "edited"]);
});

test("a change event that keeps the text does not post it twice", async () => {
  const posted: string[] = [];
  let failures = 1;
  const d = def([
    { uses: ["body"], run: async (v: any) => posted.push(v.body), done: "Comment posted" },
    {
      run: async () => {
        if (failures-- > 0) throw new Error("Not allowed");
      },
      failed: "unfreezing failed",
    },
  ]);
  const s = new FormState(d);
  await submit(d, s);
  s.set("body", "Hi");
  expect((await submit(d, s)).ok).toBe(true);
  expect(posted).toEqual(["Hi"]);
});

test("a retry failing again still names the steps finished before", async () => {
  const d = def([
    { run: async () => {}, done: "Comment posted" },
    {
      run: async () => {
        throw new Error("Not allowed");
      },
      failed: "unfreezing failed",
    },
  ]);
  const s = new FormState(d);
  await submit(d, s);
  await submit(d, s);
  expect(s.message.message).toBe("Comment posted; unfreezing failed: Not allowed");
});

test("a definition may join done and failed with its own words", async () => {
  const d = def(
    [
      { run: async () => {}, done: "Run cancelled" },
      {
        run: async () => {
          throw new Error("Conductor offline");
        },
        failed: "not started on ci-box",
      },
    ],
    { join: ", " },
  );
  const s = new FormState(d);
  await submit(d, s);
  expect(s.message.message).toBe("Run cancelled, not started on ci-box: Conductor offline");
});

test("a first step failing says what failed", async () => {
  const d = def([
    {
      run: async () => {
        throw new Error("offline");
      },
      failed: "Not sent",
    },
  ]);
  const s = new FormState(d);
  await submit(d, s);
  expect(s.message.message).toBe("Not sent: offline");
});

test("validation stops before any step and marks the field", async () => {
  let ran = false;
  const d = def(
    [
      {
        run: async () => {
          ran = true;
        },
      },
    ],
    { validate: (v: any) => (v.body ? null : { body: "Write something first." }) },
  );
  const s = new FormState(d);
  s.set("body", "");
  expect((await submit(d, s)).ok).toBe(false);
  expect(s.errors).toEqual({ body: "Write something first." });
  expect(ran).toBe(false);
});

test("a conflict check warns once; the second submit writes", async () => {
  const ran: string[] = [];
  const d = def([{ run: async () => ran.push("save") }], {
    check: async () => "SHOP-41 changed since you started editing.",
  });
  const s = new FormState(d);
  expect((await submit(d, s)).ok).toBe(false);
  expect(s.message).toEqual({
    kind: "conflict",
    message: "SHOP-41 changed since you started editing.",
  });
  expect(ran).toEqual([]);
  expect((await submit(d, s)).ok).toBe(true);
  expect(ran).toEqual(["save"]);
});

test("a second submit while busy does nothing", async () => {
  let n = 0;
  let release: () => void = () => {};
  const d = def([
    {
      run: () =>
        new Promise<void>((r) => {
          n++;
          release = r;
        }),
    },
  ]);
  const s = new FormState(d);
  const first = submit(d, s);
  expect((await submit(d, s)).skipped).toBe(true);
  release();
  await first;
  expect(n).toBe(1);
});

test("keys: inline forms send on cmd-Enter and cancel on Esc; dialogs never write from a key", () => {
  expect(formKey("cmd-enter", "inline")).toBe("submit");
  expect(formKey("escape", "inline")).toBe("cancel");
  expect(formKey("enter", "inline")).toBe(null);
  expect(formKey("enter", "dialog")).toBe("cancel");
  expect(formKey("escape", "dialog")).toBe("cancel");
  expect(formKey("cmd-enter", "dialog")).toBe(null);
});
