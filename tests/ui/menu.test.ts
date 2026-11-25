import { beforeEach, expect, test } from "bun:test";
import { activeSpace, backend, resetMod } from "../fixtures/shop";
import { click, cx, env, find, fireTimers, flush, key, load, mount, reset } from "../harness";

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
      { label: "Needs me", action: ["ticket.filter", { needsMe: true }] },
    ],
  });
  click(find(copy.render(), "pick-1"));
  await flush();
  expect(env.shared["bakers.filter"]).toMatchObject({ needsMe: true, state: "open" });
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
    items: [{ label: "Mine", action: ["ticket.filter", { mine: true }] }],
  });
  await flush();
  env.calls.length = 0;
  click(find(copy.render(), "pick-0"));
  await flush();
  expect(env.shared["bakers.filter"]).toMatchObject({ mine: true });
  expect(closed()).toBe(true);
});

test("openMenu opens exactly the menu popup, at the given point when there is one", async () => {
  await open({ view: "none" });
  const { openMenu }: any = await import("../../mods/bakers/ui/components/menu.js");
  const items = [{ label: "Refresh", action: ["ticket.refresh"] }];
  env.calls.length = 0;
  openMenu(items, { footer: "via API", footerApi: true });
  openMenu(items, { footer: "via API", footerApi: true, at: { x: 5, y: 6 } });
  const specs = env.calls.filter((c) => c.fn === "openOverlay").map((c: any) => c.args[0]);
  const base = {
    mod: "bakers",
    props: { view: "menu", items, footer: "via API", footerApi: true },
    kind: "popup",
    width: 220,
  };
  expect(specs[0]).toEqual(base);
  expect(specs[1]).toEqual({ ...base, at: { x: 5, y: 6 } });
});

// HERDRAPP-21: init's focus comes before the first frame and can land on nothing; the first layout
// takes the keyboard so Esc reaches the menu, not the pane behind.
test("a menu takes the keyboard on its first layout; a resize leaves it; Esc closes", async () => {
  const copy = await open({
    view: "menu",
    items: [{ label: "Refresh", action: ["ticket.refresh"] }],
  });
  copy.inner.handle.focused = false;
  const size = find(copy.render(), "picker").calls.on_size_change[0];
  size({ width: 220, height: 40 }, cx());
  expect(copy.inner.handle.focused).toBe(true);
  copy.inner.handle.focused = false;
  size({ width: 220, height: 60 }, cx());
  expect(copy.inner.handle.focused).toBe(false);
  key(copy.render(), "escape");
  expect(closed()).toBe(true);
});

// HERDRAPP-29: after a Herdr start or after R, init's and the first layout's claims both come before
// the popup holds the keyboard, and Esc went to the Tickets list. A late claim takes it, as the
// palette's does.
function missEarlyClaims(copy: any) {
  copy.inner.handle.focused = false;
  find(copy.render(), "picker").calls.on_size_change[0]({ width: 220, height: 40 }, cx());
  copy.inner.handle.focused = false;
}

test("a menu takes the keyboard at its late claim when the early ones missed; Esc closes", async () => {
  const copy = await open({
    view: "menu",
    items: [{ label: "Refresh", action: ["ticket.refresh"] }],
  });
  missEarlyClaims(copy);
  fireTimers();
  expect(copy.inner.handle.focused).toBe(true);
  key(copy.render(), "escape");
  expect(closed()).toBe(true);
});

test("the project picker takes the keyboard at its late claim when the early ones missed", async () => {
  const copy = await open({ view: "project.picker" });
  missEarlyClaims(copy);
  fireTimers();
  expect(copy.inner.handle.focused).toBe(true);
});

test("a closed menu's late claim takes nothing", async () => {
  const copy = await open({
    view: "menu",
    items: [{ label: "Refresh", action: ["ticket.refresh"] }],
  });
  missEarlyClaims(copy);
  key(copy.render(), "escape");
  fireTimers();
  expect(copy.inner.handle.focused).toBe(false);
});

test("after a press inside the menu, its late claim leaves the keyboard where the press put it", async () => {
  const copy = await open({
    view: "menu",
    items: [{ label: "Refresh", action: ["ticket.refresh"] }],
  });
  missEarlyClaims(copy);
  const c = cx();
  find(copy.render(), "picker").calls["on_mouse_down:left"][1]({}, c);
  // The press goes on to the row under it, so a row's click still chooses.
  expect(c.stopped).toBeFalsy();
  fireTimers();
  expect(copy.inner.handle.focused).toBe(false);
});
