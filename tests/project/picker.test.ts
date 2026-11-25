// The project button and picker once a project is shared: each mod copy loads what it draws.
import { beforeEach, expect, test } from "bun:test";
import { activeSpace, backend, list as tickets, resetMod } from "../fixtures/shop";
import {
  click,
  cx,
  env,
  fetched,
  find,
  fireTimers,
  key,
  flush,
  load,
  mount,
  reset,
  texts,
} from "../harness";

beforeEach(() => {
  reset();
  resetMod();
});

const TWO = [
  { id: "p0", name: "infra", key: "INFRA" },
  { id: "p1", name: "acme-shop", key: "ACMESHOP" },
];
/** The shop's tickets plus one of infra. */
const BOTH = [
  ...tickets,
  { id: "u70", identifier: "INFRA-1", title: "Rotate certs", state: "plan", project: "p0" },
];

/** A copy of the mod showing `view`, with `bakers.project` already shared as p1. */
async function copyOf(view: string, jsonapi: any = { projects: TWO, tickets: BOTH }) {
  activeSpace();
  backend({ jsonapi });
  env.shared["bakers.project"] = "p1";
  const Bakers = await load("bakers/main.js");
  const copy = mount(Bakers, { view });
  await flush();
  return copy;
}

test("with a shared project and two projects the button opens exactly the picker", async () => {
  const root = (await copyOf("ticket.list")).render();
  const button = find(root, "project-button");
  expect(texts(button)).toEqual(["acme-shop"]);
  env.calls.length = 0;
  click(button);
  expect(env.calls.filter((c) => c.fn === "openOverlay").map((c) => c.args[0])).toEqual([
    { mod: "bakers", props: { view: "project.picker" }, kind: "popup", width: 220 },
  ]);
});

test("a fresh picker copy lists every project and marks the shared one", async () => {
  const root = (await copyOf("project.picker")).render();
  expect(texts(find(root, "pick-p0"))).toEqual(["infra"]);
  expect(texts(find(root, "pick-p1"))).toEqual(["acme-shop", "current"]);
});

test("choosing a project in the picker shares its uuid", async () => {
  const copy = await copyOf("project.picker");
  click(find(copy.render(), "pick-p0"));
  await flush();
  expect(env.shared["bakers.project"]).toBe("p0");
});

test("the list follows a project another copy shared, with that project's rows", async () => {
  const copy = await copyOf("ticket.list");
  expect(find(copy.render(), "row-SHOP-41")).toBeDefined();
  // The picker is another copy: only the shared value changes, this copy still holds p1.
  env.shared["bakers.project"] = "p0";
  fireTimers(300);
  await flush();
  const root = copy.render();
  expect(texts(find(root, "project-button"))[0]).toBe("infra");
  expect(find(root, "row-INFRA-1")).toBeDefined();
  expect(find(root, "row-SHOP-41")).toBeUndefined();
  expect(fetched().some((u) => u.includes("project_id.id") && u.includes("p0"))).toBe(true);
});

// HERDRAPP-21: the project picker takes the keyboard on its first layout, so Esc closes it.
test("the project picker takes the keyboard on its first layout; Esc closes it", async () => {
  const copy = await copyOf("project.picker");
  copy.inner.handle.focused = false;
  find(copy.render(), "picker").calls.on_size_change[0]({ width: 220, height: 60 }, cx());
  expect(copy.inner.handle.focused).toBe(true);
  env.calls.length = 0;
  key(copy.render(), "escape");
  expect(env.calls.some((c) => c.fn === "closeOverlay")).toBe(true);
});
