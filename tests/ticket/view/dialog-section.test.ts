// The dialog with keys "inline" (cmd-Enter saves, Esc cancels, Enter types) and the section
// form that uses it: edit the description, acceptance or summary of a ticket in a popup.
import { beforeEach, expect, test } from "bun:test";
import { activeSpace, backend, list, NOW, read, resetMod } from "../../fixtures/shop";
import {
  cx,
  env,
  find,
  findText,
  flush,
  key,
  load,
  mount,
  reset,
  texts,
  tools,
} from "../../harness";

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

// --- the section form ---------------------------------------------------------------

const at = (min: number) => new Date(NOW - min * 60000).toISOString();
const OLDER = { id: "a1", type: "acceptance", author: "pg", created: at(90), body: "AC1 old." };
const NEWER = { id: "a2", type: "acceptance", author: "pg", created: at(30), body: "AC1 new." };

/** Runs fn with SHOP-41 holding an older and a newer acceptance comment, then restores it. */
async function withAcceptance(fn: () => Promise<void>) {
  const before = read.u41.comments;
  read.u41.comments = [...before, OLDER, NEWER];
  try {
    await fn();
  } finally {
    read.u41.comments = before;
  }
}

const section = (s: string, extra: Record<string, unknown> = {}) =>
  open({ view: "dialog", form: "section", ticket: "SHOP-41", section: s }, extra);
const body = (copy: any) => copy.inner.inputs.input("body");
const toasts = () => env.calls.filter((c) => c.fn === "notify").map((c: any) => c.args[0].title);

test("AC2: acceptance opens with the newest acceptance, its title, consequence and keys", async () => {
  await withAcceptance(async () => {
    const copy = await section("acceptance");
    const root = copy.render();
    expect(body(copy).value()).toBe("AC1 new.");
    expect(findText(root, "Edit acceptance of SHOP-41")).toBeDefined();
    expect(
      findText(
        root,
        "Saving posts a new acceptance comment; the panel and later runs read the newest.",
      ),
    ).toBeDefined();
    expect(texts(find(root, "dialog-footer"))).toEqual([
      "cmd-Enter saves, Esc cancels",
      "Cancel",
      "Save",
    ]);
  });
});

test("AC2: summary opens empty when there is none; description opens with the description", async () => {
  let copy = await section("summary");
  expect(body(copy).value()).toBe("");
  expect(findText(copy.render(), "Edit summary of SHOP-41")).toBeDefined();
  reset();
  resetMod();
  copy = await section("description");
  expect(body(copy).value()).toBe(read.u41.description);
  expect(findText(copy.render(), "Saving replaces the description.")).toBeDefined();
});

test("AC3: cmd-Enter posts a new acceptance comment, trimmed, closes and toasts", async () => {
  await withAcceptance(async () => {
    const copy = await section("acceptance");
    body(copy).type("  AC1 newest.\n\n");
    key(copy.render(), "cmd-enter");
    await flush();
    expect(writes()).toEqual([
      ["bakers_comment_publish", { ticket: "SHOP-41", type: "acceptance", body: "AC1 newest." }],
    ]);
    expect(closed()).toBe(true);
    expect(toasts()).toContain("Acceptance of SHOP-41 saved");
  });
});

test("AC3: cmd-Enter on the description replaces it", async () => {
  const copy = await section("description");
  body(copy).type("A shorter description.");
  key(copy.render(), "cmd-enter");
  await flush();
  expect(writes()).toEqual([
    ["bakers_ticket_update", { ticket: "SHOP-41", description: "A shorter description." }],
  ]);
  expect(toasts()).toContain("Description of SHOP-41 saved");
});

test("AC5: Esc closes the section popup and writes nothing", async () => {
  const copy = await section("summary");
  body(copy).type("Something");
  key(copy.render(), "escape");
  await flush();
  expect(writes()).toEqual([]);
  expect(closed()).toBe(true);
});

/** Types text and sends it with cmd-Enter. (Returns nothing: the harness's elements look thenable.) */
async function typeAndSave(copy: any, text: string) {
  body(copy).type(text);
  key(copy.render(), "cmd-enter");
  await flush();
}

test("AC6: an empty or whitespace-only text writes nothing and says why", async () => {
  const copy = await section("summary");
  await typeAndSave(copy, "  \n ");
  const root = copy.render();
  expect(findText(root, "Write something first.")).toBeDefined();
  expect(writes()).toEqual([]);
  expect(closed()).toBe(false);
});

test("AC6: an unchanged text, trailing spaces included, writes nothing", async () => {
  await withAcceptance(async () => {
    const copy = await section("acceptance");
    await typeAndSave(copy, "AC1 new.  \n");
    const root = copy.render();
    expect(findText(root, "Nothing changed.")).toBeDefined();
    expect(writes()).toEqual([]);
    expect(closed()).toBe(false);
  });
});

test("AC6: 3072 bytes of ä save; one byte more is refused with the size", async () => {
  let copy = await section("summary");
  await typeAndSave(copy, `${"ä".repeat(1536)}a`);
  let root = copy.render();
  expect(findText(root, "3073 bytes; the limit is 3072.")).toBeDefined();
  expect(writes()).toEqual([]);
  await typeAndSave(copy, "ä".repeat(1536));
  expect(writes()).toEqual([
    ["bakers_comment_publish", { ticket: "SHOP-41", type: "summary", body: "ä".repeat(1536) }],
  ]);
  reset();
  resetMod();
  copy = await section("description");
  await typeAndSave(copy, "x".repeat(6145));
  root = copy.render();
  expect(findText(root, "6145 bytes; the limit is 6144.")).toBeDefined();
  expect(writes()).toEqual([]);
});

test("AC7: a failed save keeps the popup, the text and says it was not saved", async () => {
  const copy = await section("summary", {
    bakers_comment_publish: new Error("Server said no"),
  });
  await typeAndSave(copy, "My summary");
  const root = copy.render();
  expect(closed()).toBe(false);
  expect(body(copy).value()).toBe("My summary");
  expect(texts(find(root, "form-message"))[0]).toStartWith("Not saved:");
});

test("AC7: a failed conflict-check read keeps the popup, the text and says it was not saved", async () => {
  const copy = await section("summary");
  env.fetch = async () => {
    throw new Error("network down");
  };
  await typeAndSave(copy, "My summary");
  const root = copy.render();
  expect(closed()).toBe(false);
  expect(body(copy).value()).toBe("My summary");
  expect(texts(find(root, "form-message"))[0]).toStartWith("Not saved:");
  expect(writes()).toEqual([]);
});

test("AC8: a newer acceptance since opening warns once; the second cmd-Enter saves", async () => {
  await withAcceptance(async () => {
    const copy = await section("acceptance");
    const third = { id: "a3", type: "acceptance", author: "x", created: at(1), body: "Theirs." };
    read.u41.comments = [...read.u41.comments, third];
    await typeAndSave(copy, "Mine.");
    const root = copy.render();
    expect(writes()).toEqual([]);
    expect(
      findText(
        root,
        "A newer acceptance of SHOP-41 arrived since you opened this. cmd-Enter again saves over it.",
      ),
    ).toBeDefined();
    key(copy.render(), "cmd-enter");
    await flush();
    expect(writes()).toEqual([
      ["bakers_comment_publish", { ticket: "SHOP-41", type: "acceptance", body: "Mine." }],
    ]);
  });
});

test("AC8: a changed description warns once", async () => {
  const before = read.u41.description;
  try {
    const copy = await section("description");
    read.u41.description = "Someone else rewrote this.";
    await typeAndSave(copy, "Mine.");
    const root = copy.render();
    expect(writes()).toEqual([]);
    expect(
      findText(
        root,
        "A newer description of SHOP-41 arrived since you opened this. cmd-Enter again saves over it.",
      ),
    ).toBeDefined();
  } finally {
    read.u41.description = before;
  }
});

test("AC8: no summary before and none now raises no warning", async () => {
  const copy = await section("summary");
  await typeAndSave(copy, "First summary.");
  expect(writes()).toEqual([
    ["bakers_comment_publish", { ticket: "SHOP-41", type: "summary", body: "First summary." }],
  ]);
});

test("two cmd-Enter before the save finishes post once", async () => {
  const copy = await section("summary");
  body(copy).type("Once.");
  key(copy.render(), "cmd-enter");
  key(copy.render(), "cmd-enter");
  await flush();
  expect(writes()).toEqual([
    ["bakers_comment_publish", { ticket: "SHOP-41", type: "summary", body: "Once." }],
  ]);
});

test("a popup whose ticket cannot be read shows why and closes on Esc", async () => {
  const copy = await open({
    view: "dialog",
    form: "section",
    ticket: "SHOP-99",
    section: "summary",
  });
  const root = copy.render();
  expect(texts(root).join(" ")).toContain("SHOP-99");
  key(root, "escape");
  expect(closed()).toBe(true);
  expect(writes()).toEqual([]);
});

test("a ticket closed after the popup opened is not written, also on a second cmd-Enter", async () => {
  const copy = await section("summary");
  const row: any = list.find((t: any) => t.id === "u41");
  const state = row.state;
  row.state = "done";
  row.closed = true;
  try {
    await typeAndSave(copy, "Late summary.");
    expect(texts(find(copy.render(), "form-message"))[0]).toContain(
      "A closed ticket cannot be changed any more.",
    );
    key(copy.render(), "cmd-enter");
    await flush();
    expect(writes()).toEqual([]);
    expect(closed()).toBe(false);
  } finally {
    row.state = state;
    row.closed = false;
  }
});

// HERDRAPP-21: the loading frame takes the keyboard on its first layout, the ready frame gives it
// to the first field on its own first layout; Esc in that field closes without saving.
test("a dialog takes the keyboard on its loading layout, then its field on the ready layout", async () => {
  sent = 0;
  activeSpace();
  backend(writeTools);
  const Bakers = await load("bakers/main.js");
  defineTestForm();
  const copy = mount(Bakers, { overlay: "overlay-7", view: "dialog", form: "test-inline" });
  copy.inner.handle.focused = false;
  find(copy.render(), "confirm").calls.on_size_change[0]({ width: 460, height: 80 }, cx());
  expect(copy.inner.handle.focused).toBe(true);
  await flush();
  const body = copy.inner.inputs.input("body");
  body.focused = false;
  const size = find(copy.render(), "confirm").calls.on_size_change[0];
  size({ width: 460, height: 240 }, cx());
  expect(body.focused).toBe(true);
  body.focused = false;
  size({ width: 460, height: 260 }, cx());
  expect(body.focused).toBe(false);
  key(copy.render(), "escape");
  await flush();
  expect(sent).toBe(0);
  expect(closed()).toBe(true);
});
