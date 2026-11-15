import { beforeEach, expect, test } from "bun:test";
import { activeSpace, backend } from "./fixtures/shop";
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
  tools,
} from "./harness";

const ctx: any = await import("../mods/bakers/lib/context.js");
const tabs: any = await import("../mods/bakers/lib/tabs.js");
const { watchNeeds } = await import("../mods/bakers/lib/notify.js");

const search = {
  bakers_ticket_search: (a: any) => ({
    tickets:
      a.query === "deliv"
        ? [
            {
              identifier: "SHOP-56",
              title: "Show delivery date on the product page",
              state: "plan",
            },
            { identifier: "SHOP-38", title: "Delivery slots for the cart", state: "done" },
          ]
        : [],
  }),
};

beforeEach(() => {
  reset();
  ctx._resetForTests();
  tabs._resetForTests();
});

async function goto() {
  activeSpace();
  backend(search);
  env.shared["bakers.project"] = "p1";
  backend({ ...search, bakers_project_read: { uuid: "p1", name: "acme-shop" } });
  const Bakers = await load("bakers/main.js");
  const copy = mount(Bakers, { view: "goto", overlay: "overlay-9" });
  await flush();
  return copy;
}

test("typing searches once after 200 ms of quiet", async () => {
  const copy = await goto();
  env.calls.length = 0;
  copy.inner.input.type("de");
  copy.inner.input.type("deliv");
  expect(tools()).toEqual([]);
  fireTimers(200);
  await flush();
  expect(tools()).toEqual([["bakers_ticket_search", { query: "deliv", project: "p1" }]]);
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
      { mod: "bakers", props: { view: "ticket", ticket: "SHOP-56" }, name: "SHOP-56 plan" },
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

// The toast.

function storeWith(asking: string[]) {
  const rows = asking.map((id) => ({ id, why: "Asked a question" }));
  return {
    view: () => rows,
    cached: (id: string) => ({
      comments: [
        {
          type: "question",
          body: `Should ${id} redirect to the shop home, or show the empty-cart page with suggestions? The spec names both, and this line is long enough to be cut at 120 characters.`,
        },
      ],
    }),
  };
}

test("watchNeeds posts one toast per newly asking ticket, never on start or twice", () => {
  let asked = watchNeeds(null, storeWith(["SHOP-41"]));
  expect(env.calls.filter((c) => c.fn === "notify")).toEqual([]);
  asked = watchNeeds(asked, storeWith(["SHOP-41", "SHOP-58"]));
  const posted = env.calls.filter((c) => c.fn === "notify");
  expect(posted.length).toBe(1);
  const n: any = posted[0].args[0];
  expect(n.title).toBe("SHOP-58 asks a question");
  expect(n.body.length).toBeLessThanOrEqual(120);
  expect(n.body.startsWith("Should SHOP-58 redirect")).toBe(true);
  expect(n.level).toBe("warning");
  expect(n.action).toEqual({ name: "bakers.open", args: { ticket: "SHOP-58" } });
  watchNeeds(asked, storeWith(["SHOP-41", "SHOP-58"]));
  expect(env.calls.filter((c) => c.fn === "notify").length).toBe(1);
});

test("the toast's bakers.open opens the ticket's tab and never moves focus", async () => {
  activeSpace();
  backend();
  env.shared["bakers.toast"] = "SHOP-41";
  env.commands.push("open");
  const Bakers = await load("bakers/main.js");
  mount(Bakers, { view: "status" });
  await flush();
  expect(runs()).toContainEqual([
    "tab.new",
    { mod: "bakers", props: { view: "ticket", ticket: "SHOP-41" }, name: "SHOP-41 working" },
  ]);
  expect(runs().some((r) => String(r[0]).startsWith("pane.focus"))).toBe(false);
});
