import { beforeEach, expect, test } from "bun:test";
import { activeSpace, backend, resetMod } from "../fixtures/shop";
import { click, env, find, flush, load, mount, reset } from "../harness";

const writeTools = {
  bakers_comment_publish: { id: "c9" },
  bakers_ticket_transition: {},
  bakers_ticket_update: {},
  bakers_run_cancel: {},
  bakers_ticket_create: { identifier: "SHOP-70", state: "qualification" },
};

beforeEach(() => {
  reset();
  resetMod();
});

async function open(props: any, extra: Record<string, unknown> = {}) {
  activeSpace();
  backend({ ...writeTools, ...extra });
  const Bakers = await load("bakers/main.js");
  const copy = mount(Bakers, { overlay: "overlay-7", ...props });
  await flush();
  env.calls.length = 0;
  return copy;
}

const closed = () => env.calls.some((c) => c.fn === "closeOverlay" && c.args[0] === "overlay-7");

test("a menu runs its item's action and closes", async () => {
  const copy = await open({
    view: "menu",
    items: [
      { label: "Refresh", action: ["ticket.refresh"] },
      { label: "Show closed tickets", action: ["ticket.toggleClosed"] },
    ],
  });
  click(find(copy.render(), "pick-1"));
  await flush();
  expect(env.shared["bakers.showClosed"]).toBe(true);
  expect(closed()).toBe(true);
});

test("a disabled menu item does nothing", async () => {
  const copy = await open({
    view: "menu",
    items: [{ label: "Mine", action: ["view", "mine"], disabled: true }],
  });
  expect(find(copy.render(), "pick-0").calls.on_click).toBeUndefined();
});

test("a menu item whose action is not registered closes the menu and does nothing", async () => {
  const copy = await open({
    view: "menu",
    items: [{ label: "Mystery", action: ["no.such.action", "x"] }],
  });
  click(find(copy.render(), "pick-0"));
  await flush();
  expect(closed()).toBe(true);
  expect(env.calls.filter((c) => c.fn !== "closeOverlay")).toEqual([]);
});

test("a registry reset and refilled by registerAll() still runs a registered menu action", async () => {
  // Bun caches main.js, so it is not loaded fresh here: the registry is emptied so nothing from
  // the harness or an earlier test is left, and registerAll() fills it again.
  const registry = await import("../../mods/bakers/core/registry.js");
  const Bakers = await load("bakers/main.js");
  const main = await import("../../mods/bakers/main.js");
  registry._resetForTests();
  main.registerAll();
  activeSpace();
  backend(writeTools);
  const copy = mount(Bakers, {
    overlay: "overlay-7",
    view: "menu",
    items: [{ label: "Mine", action: ["ticket.view", "mine"] }],
  });
  await flush();
  env.calls.length = 0;
  click(find(copy.render(), "pick-0"));
  await flush();
  expect(env.shared["bakers.view"]).toBe("mine");
  expect(closed()).toBe(true);
});
