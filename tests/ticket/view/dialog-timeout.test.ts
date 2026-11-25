// A dialog's build never keeps it on "..." for good. After FORM_TIMEOUT_MS, or when the build
// fails, a form that can draw itself from what it has (`now`) shows that; any other shows an
// error the person can read, and Esc closes it.
import { beforeEach, expect, test } from "bun:test";
import { define } from "../../../mods/bakers/core/registry.js";
import { activeSpace, backend, resetMod } from "../../fixtures/shop";
import {
  env,
  find,
  findText,
  fireTimers,
  flush,
  key,
  load,
  mount,
  reset,
  texts,
} from "../../harness";

const { FORM_TIMEOUT_MS } = await import("../../../mods/bakers/ui/form/dialog.js");

beforeEach(() => {
  reset();
  resetMod();
});

/** Mounts a dialog with `props` while every request stays unanswered. */
async function hanging(props: Record<string, unknown>) {
  activeSpace();
  backend({});
  const Bakers = await load("bakers/main.js");
  env.fetch = () => new Promise(() => {});
  env.exec = () => new Promise(() => {});
  const dialog = mount(Bakers, { view: "dialog", overlay: "overlay-7", ...props });
  await flush();
  return dialog;
}

const closed = () => env.calls.some((c) => c.fn === "closeOverlay" && c.args[0] === "overlay-7");
const never = () => new Promise(() => {});
const form = (title: string) => ({
  kind: "dialog",
  title,
  fields: [],
  keep: "Keep",
  submit: "Go",
  steps: [{ run: async () => {} }],
});

test("the bound is a few seconds at most", () => {
  expect(FORM_TIMEOUT_MS).toBeGreaterThan(0);
  expect(FORM_TIMEOUT_MS).toBeLessThanOrEqual(3000);
});

test("State whose ticket read never answers shows its form from the opener's state at once", async () => {
  const dialog = await hanging({ form: "state", ticket: "SHOP-41", from: "done", to: "review" });
  const root = dialog.render();
  expect(dialog.inner.error).toBeNull();
  expect(texts(root)).toContain("Move SHOP-41 to review?");
  expect(texts(find(root, "pills"))).toEqual(["done", "review"]);
  expect(find(root, "field-comment")).toBeDefined();
});

test("Move whose ticket read never answers shows its form after the bound, without a branch", async () => {
  const dialog = await hanging({
    form: "move",
    ticket: "SHOP-41",
    conductor: "k2",
    name: "ci-box",
  });
  fireTimers(FORM_TIMEOUT_MS);
  await flush();
  const root = dialog.render();
  expect(texts(root)).toContain("Move SHOP-41 to ci-box?");
  expect(
    findText(
      root,
      "First the running run is cancelled; its work stays in the worktree. Then a run starts on ci-box. The agent there begins from the branch, not from the old run's conversation.",
    ),
  ).toBeDefined();
});

test("a form with no fallback shows a readable error after the bound, and Esc closes it", async () => {
  define("form", "zz-hang", { build: never });
  const dialog = await hanging({ form: "zz-hang", title: "Hang" });
  fireTimers(FORM_TIMEOUT_MS);
  await flush();
  const root = dialog.render();
  expect(dialog.inner.error).toMatch(/could not load/);
  expect(dialog.inner.error).toMatch(/Esc closes it/);
  expect(texts(root)).toEqual([dialog.inner.error]);
  key(root, "escape");
  expect(closed()).toBe(true);
});

test("a failed build uses the form's fallback when it has one", async () => {
  define("form", "zz-fails", {
    build: async () => {
      throw new Error("offline");
    },
    now: () => form("From what is known"),
  });
  const dialog = await hanging({ form: "zz-fails" });
  expect(dialog.inner.error).toBeNull();
  expect(texts(dialog.render())).toContain("From what is known");
});

test("a failed build with no fallback shows its reason", async () => {
  define("form", "zz-fails-bare", {
    build: async () => {
      throw new Error("offline");
    },
  });
  const dialog = await hanging({ form: "zz-fails-bare" });
  expect(dialog.inner.error).toMatch(/offline/);
});

test("a build that answers after the known form was drawn refines its texts, not its inputs", async () => {
  let answer: (d: any) => void = () => {};
  define("form", "zz-late", {
    build: () => new Promise((ok) => (answer = ok)),
    now: () => form("Fallback"),
  });
  const dialog = await hanging({ form: "zz-late" });
  expect(texts(dialog.render())).toContain("Fallback");
  const inputs = dialog.inner.inputs;
  const state = dialog.inner.state;
  answer({ ...form("Late"), fields: [{ name: "x", type: "input" }] });
  await flush();
  expect(texts(dialog.render())).toContain("Late");
  expect(dialog.inner.inputs).toBe(inputs);
  expect(dialog.inner.state).toBe(state);
  expect(dialog.inner.def.fields).toEqual([]);
});

test("a build that answers in time leaves no fallback to fire later", async () => {
  define("form", "zz-quick", { build: async () => form("Quick"), now: () => form("Fallback") });
  const dialog = await hanging({ form: "zz-quick" });
  expect(texts(dialog.render())).toContain("Quick");
  fireTimers(FORM_TIMEOUT_MS);
  await flush();
  expect(texts(dialog.render())).toContain("Quick");
  expect(dialog.inner.error).toBeNull();
});
