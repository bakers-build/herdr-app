// The bakers mod's entry point evaluated as Herdr would: real source, stubbed globals.
import { beforeEach, expect, test } from "bun:test";
import { load, mount, reset, texts } from "./harness";

beforeEach(reset);

test("bakers routes each placement to its controller by props().view", async () => {
  const Bakers = await load("bakers/main.js");
  const { ROUTES } = await import("../mods/bakers/main.js");
  expect(Object.keys(ROUTES).sort()).toEqual([
    "dialog",
    "menu",
    "project.picker",
    "shell.rail",
    "shell.sidebar",
    "shell.status",
    "shell.tabs",
    "ticket.conductor-picker",
    "ticket.context",
    "ticket.label-picker",
    "ticket.list",
    "ticket.search",
    "ticket.view",
  ]);
  for (const view of Object.keys(ROUTES)) {
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
