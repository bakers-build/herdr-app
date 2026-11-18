import { beforeEach, expect, test } from "bun:test";
import { read, ticketTab, resetMod } from "../../fixtures/shop";
import { click, env, find, findText, flush, key, reset, tools } from "../../harness";

const writes = () => tools().filter(([t]) => !/_(read|list|search)$/.test(t));

beforeEach(() => {
  reset();
  resetMod();
});

test("E edits title and description; cmd-Enter saves both", async () => {
  const copy = await ticketTab("SHOP-41", { bakers_ticket_update: {} });
  key(copy.render(), "e");
  const ed = copy.inner.editor;
  expect(ed.inputs.input("title").value()).toBe("Checkout fails with an empty cart");
  expect(ed.inputs.input("description").value()).toContain("**Acceptance**");
  expect(findText(copy.render(), "cmd-Enter saves, Esc cancels")).toBeDefined();
  ed.inputs.input("title").type("Checkout fails on an empty cart");
  env.calls.length = 0;
  key(copy.render(), "cmd-enter");
  await flush();
  expect(writes()).toEqual([
    [
      "bakers_ticket_update",
      {
        ticket: "SHOP-41",
        title: "Checkout fails on an empty cart",
        description: read.u41.description,
      },
    ],
  ]);
  expect(copy.inner.editor).toBe(null);
});

test("a click on the description edits too; Esc cancels without a write", async () => {
  const copy = await ticketTab("SHOP-41", { bakers_ticket_update: {} });
  click(find(copy.render(), "description-body"));
  expect(copy.inner.editor).not.toBe(null);
  env.calls.length = 0;
  key(copy.render(), "escape");
  expect(copy.inner.editor).toBe(null);
  expect(writes()).toEqual([]);
});

test("saving warns once when the ticket changed since editing began", async () => {
  const copy = await ticketTab("SHOP-41", { bakers_ticket_update: {} });
  key(copy.render(), "e");
  const before = read.u41.description;
  read.u41.description = "Someone else rewrote this.";
  try {
    copy.inner.editor.inputs.input("description").type("Mine");
    env.calls.length = 0;
    key(copy.render(), "cmd-enter");
    await flush();
    expect(writes()).toEqual([]);
    expect(
      findText(
        copy.render(),
        "SHOP-41 changed since you started editing. cmd-Enter again saves over it.",
      ),
    ).toBeDefined();
    key(copy.render(), "cmd-enter");
    await flush();
    expect(writes()).toEqual([
      [
        "bakers_ticket_update",
        { ticket: "SHOP-41", title: "Checkout fails with an empty cart", description: "Mine" },
      ],
    ]);
  } finally {
    read.u41.description = before;
  }
});
