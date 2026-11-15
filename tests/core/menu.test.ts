import { beforeEach, expect, test } from "bun:test";
import { activeSpace, backend } from "../fixtures/shop";
import { click, env, find, flush, load, mount, reset } from "../harness";

const ctx: any = await import("../../mods/bakers/core/session.js");
const tabs: any = await import("../../mods/bakers/core/tabs.js");

const writeTools = {
  bakers_comment_publish: { id: "c9" },
  bakers_ticket_transition: {},
  bakers_ticket_update: {},
  bakers_run_cancel: {},
  bakers_ticket_create: { identifier: "SHOP-70", state: "qualification" },
};

beforeEach(() => {
  reset();
  ctx._resetForTests();
  tabs._resetForTests();
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
      { label: "Refresh", action: ["refresh"] },
      { label: "Show closed tickets", action: ["list.toggleClosed"] },
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
