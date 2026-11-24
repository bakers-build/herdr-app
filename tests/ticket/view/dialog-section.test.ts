// The dialog with keys "inline" (cmd-Enter saves, Esc cancels, Enter types) and the section
// form that uses it: edit the description, acceptance or summary of a ticket in a popup.
import { beforeEach, expect, test } from "bun:test";
import { activeSpace, backend, resetMod } from "../../fixtures/shop";
import { env, flush, key, load, mount, reset, tools } from "../../harness";

const { define } = await import("../../../mods/bakers/core/registry.js");
const { openForm } = await import("../../../mods/bakers/ui/form/dialog.js");

const writes = () => tools().filter(([t]) => !/_(read|list|search)$/.test(t));
const writeTools = { bakers_comment_publish: { id: "c9" }, bakers_ticket_update: {} };

beforeEach(() => {
  reset();
  resetMod();
});

async function open(props: any, extra: Record<string, unknown> = {}) {
  activeSpace();
  backend({ ...writeTools, ...extra });
  const Bakers = await load("bakers/main.js");
  defineTestForm();
  const copy = mount(Bakers, { overlay: "overlay-7", ...props });
  await flush();
  env.calls.length = 0;
  return copy;
}

const closed = () => env.calls.some((c) => c.fn === "closeOverlay" && c.args[0] === "overlay-7");

let sent = 0;
// reset() refills the registry, so the test-only form is defined after it, per test.
const defineTestForm = () =>
  define("form", "test-inline", {
    build: () => ({
    kind: "dialog",
    keys: "inline",
    title: "Inline",
    fields: [{ name: "body", type: "textarea", value: "x" }],
    keep: "Cancel",
    submit: "Save",
    steps: [{ run: async () => void sent++ }],
  }),
  });

test("an inline dialog saves on cmd-Enter, once", async () => {
  sent = 0;
  const copy = await open({ view: "dialog", form: "test-inline" });
  key(copy.render(), "cmd-enter");
  await flush();
  expect(sent).toBe(1);
  expect(closed()).toBe(true);
});

test("Enter in an inline dialog neither saves nor closes", async () => {
  sent = 0;
  const copy = await open({ view: "dialog", form: "test-inline" });
  key(copy.render(), "enter");
  await flush();
  expect(sent).toBe(0);
  expect(closed()).toBe(false);
});

test("Esc closes an inline dialog without saving", async () => {
  sent = 0;
  const copy = await open({ view: "dialog", form: "test-inline" });
  key(copy.render(), "escape");
  await flush();
  expect(sent).toBe(0);
  expect(closed()).toBe(true);
});

test("openForm passes per-call overlay fields, such as the width", async () => {
  activeSpace();
  backend();
  await load("bakers/main.js");
  openForm("section", { ticket: "SHOP-41" }, { width: 640 });
  const spec: any = env.calls.find((c) => c.fn === "openOverlay")?.args[0];
  expect(spec).toMatchObject({
    props: { view: "dialog", form: "section", ticket: "SHOP-41" },
    kind: "dialog",
    modal: true,
    width: 640,
  });
});
