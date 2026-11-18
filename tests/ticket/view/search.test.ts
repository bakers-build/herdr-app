import { beforeEach, expect, test } from "bun:test";
import { activeSpace, backend, list, resetMod } from "../../fixtures/shop";
import {
  env,
  find,
  findText,
  fireTimers,
  flush,
  key,
  load,
  mount,
  reset,
  runs,
  texts,
  fetched,
} from "../../harness";

// SHOP-38 is closed and found by its title, like SHOP-56.
const tickets = [
  ...list,
  {
    id: "u38",
    identifier: "SHOP-38",
    title: "Delivery slots for the cart",
    state: "done",
    labels: [],
    frozen: false,
    closed: true,
  },
];

beforeEach(() => {
  reset();
  resetMod();
});

async function goto() {
  activeSpace();
  env.shared["bakers.project"] = "p1";
  backend({ jsonapi: { tickets } });
  const Bakers = await load("bakers/main.js");
  const copy = mount(Bakers, { view: "ticket.search", overlay: "overlay-9" });
  await flush();
  return copy;
}

// The toast.

test("typing searches once after 200 ms of quiet", async () => {
  const copy = await goto();
  env.calls.length = 0;
  copy.inner.input.type("de");
  copy.inner.input.type("deliv");
  expect(fetched()).toEqual([]);
  fireTimers(200);
  await flush();
  const searches = fetched();
  expect(searches.length).toBe(2);
  expect(searches[0]).toContain(
    "[path]=identifier&filter[f1][condition][operator]=STARTS_WITH&filter[f1][condition][value]=DELIV",
  );
  expect(searches[1]).toContain(
    "[path]=title&filter[f1][condition][operator]=CONTAINS&filter[f1][condition][value]=deliv",
  );
  expect(
    searches.every((u) =>
      u.includes(
        "filter[f0][condition][path]=project_id.id&filter[f0][condition][operator]==&filter[f0][condition][value]=p1",
      ),
    ),
  ).toBe(true);
  expect(env.timers.find((t) => !t.every)?.ms ?? 200).toBe(200);
});

test("rows show identifier, title and state as drawn; the hint reads as product copy", async () => {
  const copy = await goto();
  copy.inner.input.type("deliv");
  fireTimers(200);
  await flush();
  const root = copy.render();
  const row = find(root, "goto-SHOP-56");
  expect(texts(row)).toEqual(["SHOP-56", "Show delivery date on the product page", "plan"]);
  expect(findText(row, "SHOP-56").calls.text_size).toEqual([11]);
  expect(row.calls.bg).toEqual(["selected"]);
  expect(texts(find(root, "goto-SHOP-38"))).toEqual([
    "SHOP-38",
    "Delivery slots for the cart",
    "done",
  ]);
  expect(texts(find(root, "goto-label"))).toEqual(["Go to ticket", "cmd-shift-O"]);
  expect(
    findText(
      root,
      "Identifier or words of the title. Enter opens it as a tab, or selects its tab if it is open.",
    ),
  ).toBeDefined();
  const field = find(root, "goto-field");
  expect(field.calls.h).toEqual([32]);
  expect(field.calls.border).toEqual([2]);
  expect(field.calls.border_color).toEqual(["accent"]);
  expect(root.calls.p).toEqual([10]);
});

test("Enter opens the ticket as a pinned tab and closes the popup", async () => {
  const copy = await goto();
  copy.inner.input.type("deliv");
  fireTimers(200);
  await flush();
  env.calls.length = 0;
  copy.inner.input.submit();
  expect(runs()).toEqual([
    [
      "tab.new",
      { mod: "bakers", props: { view: "ticket.view", ticket: "SHOP-56" }, name: "SHOP-56 plan" },
    ],
  ]);
  expect(env.calls.find((c) => c.fn === "closeOverlay")?.args).toEqual(["overlay-9"]);
});

test("Enter on an open ticket selects its tab; Down moves to the next row", async () => {
  const copy = await goto();
  env.spaces[0].tabs.push({ id: "t8", name: "SHOP-38 closed", index: 2 });
  copy.inner.input.type("deliv");
  fireTimers(200);
  await flush();
  key(copy.render(), "down");
  env.calls.length = 0;
  copy.inner.input.submit();
  expect(runs()).toEqual([["tab.select", { id: "t8" }]]);
});

test("Esc closes and writes nothing", async () => {
  const copy = await goto();
  env.calls.length = 0;
  key(copy.render(), "escape");
  expect(env.calls.map((c) => c.fn)).toEqual(["closeOverlay"]);
});
