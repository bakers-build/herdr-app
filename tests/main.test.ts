// The bakers mod's entry point evaluated as Herdr would: real source, stubbed globals.
import { beforeEach, expect, test } from "bun:test";
import { load, mount, reset, texts } from "./harness";

const { all, get, _resetForTests } = await import("../mods/bakers/core/registry.js");
const { registerAll } = await import("../mods/bakers/main.js");

beforeEach(reset);

test("bakers routes each placement to its controller by props().view", async () => {
  const Bakers = await load("bakers/main.js");
  const names = all("route").map((d: any) => d.id);
  expect([...names].sort()).toEqual([
    "dialog",
    "menu",
    "project.picker",
    "project.sidebar-tool",
    "shell.rail",
    "shell.sidebar",
    "shell.status",
    "shell.tabs",
    "ticket.conductor-picker",
    "ticket.context",
    "ticket.label-picker",
    "ticket.list",
    "ticket.rail",
    "ticket.search",
    "ticket.sidebar",
    "ticket.status",
    "ticket.view",
  ]);
  for (const view of names) {
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

test('an unknown view draws "bakers: unknown view"', async () => {
  const Bakers = await load("bakers/main.js");
  const copy = mount(Bakers, { view: "no.such.route" });
  expect(copy.inner).toBe(null);
  expect(texts(copy.render())).toEqual(["bakers: unknown view"]);
});

test("registerAll fills lists, forms and actions", () => {
  _resetForTests();
  registerAll();
  const ids = all("list").map((d: any) => d.id);
  for (const id of ["needs-me", "mine", "open", "state", "closed"]) expect(ids).toContain(id);
  expect(get("form", "create")).toBeTruthy();
  expect(get("form", "cancel")).toBeTruthy();
  expect(get("action", "project.choose")).toBeTruthy();
  expect(get("action", "form.open")).toBeTruthy();
  expect(get("action", "tabs.closeAll")).toBeTruthy();
});
