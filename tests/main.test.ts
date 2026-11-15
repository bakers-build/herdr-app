// The bakers mod's entry point evaluated as Herdr would: real source, stubbed globals.
import { beforeEach, expect, test } from "bun:test";
import { load, mount, reset, texts } from "./harness";

beforeEach(reset);

test("bakers routes each placement to its view by props().view", async () => {
  const Bakers = await load("bakers/main.js");
  for (const view of [
    "rail",
    "sidebar",
    "status",
    "tabs",
    "panel",
    "list",
    "ticket",
    "goto",
    "menu",
    "dialog",
    "new-ticket",
    "project-picker",
    "conductor-picker",
    "label-picker",
  ]) {
    const copy = mount(Bakers, { view, ticket: "SHOP-41", items: [] });
    expect(copy.inner).toBeDefined();
    expect(copy.render()).toBeDefined();
  }
});

test("router renders a message for an unknown view", async () => {
  const Bakers = await load("bakers/main.js");
  const root = mount(Bakers, { view: "nope" }).render();
  expect(texts(root)).toEqual(["bakers: unknown view"]);
});
