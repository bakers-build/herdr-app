import { beforeEach, expect, test } from "bun:test";
import { activeSpace, backend, resetMod } from "../../fixtures/shop";
import {
  click,
  env,
  find,
  findText,
  flush,
  key,
  load,
  mount,
  reset,
  texts,
  tools,
} from "../../harness";

const { stateItems } = await import("../../../mods/bakers/ticket/operations/state.js");

const writes = () => tools().filter(([t]) => !/_(read|list|search)$/.test(t));
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

test("the state menu lists every state, marks the current one and says what the API cannot", async () => {
  const copy = await open({
    view: "menu",
    items: stateItems("SHOP-56", "plan"),
    footer: "All states shown; the server refuses what the workflow forbids.",
    footerApi: true,
  });
  const root = copy.render();
  expect(texts(root)).toEqual([
    "Qualification...",
    "Plan",
    "current",
    "Working...",
    "Review...",
    "Done...",
    "Cancelled...",
    "All states shown; the server refuses what the workflow forbids.",
    "API",
  ]);
  click(find(root, "pick-working"));
  const spec: any = env.calls.find((c) => c.fn === "openOverlay")?.args[0];
  expect(spec).toMatchObject({
    props: { view: "dialog", form: "state", ticket: "SHOP-56", from: "plan", to: "working" },
    kind: "dialog",
    modal: true,
  });
  expect(closed()).toBe(true);
  expect(writes()).toEqual([]);
});

test("Move to working: from and to, the consequence, an optional comment, and Keep as the default", async () => {
  const copy = await open({
    view: "dialog",
    form: "state",
    ticket: "SHOP-41",
    from: "review",
    to: "working",
  });
  const root = copy.render();
  expect(findText(root, "Move SHOP-41 to working?").calls.text_size).toEqual([16]);
  expect(texts(find(root, "pills"))).toEqual(["review", "working"]);
  expect(
    findText(
      root,
      "A conductor picks SHOP-41 up and the agent starts coding on branch shop-41-checkout-empty-cart. You can move it back to review later.",
    ),
  ).toBeDefined();
  expect(findText(root, "Comment, optional, posted with the change")).toBeDefined();
  expect(texts(find(root, "dialog-footer"))).toEqual([
    "Esc keeps it in review",
    "Keep in review",
    "Move to working",
  ]);
  key(root, "enter");
  expect(writes()).toEqual([]);
  expect(closed()).toBe(true);
});

test("confirming posts the comment, then the transition; an empty comment is not posted", async () => {
  let copy = await open({
    view: "dialog",
    form: "state",
    ticket: "SHOP-56",
    from: "plan",
    to: "working",
  });
  copy.inner.inputs.input("comment").type("Plan approved. Keep the cache at 1 h.");
  click(find(copy.render(), "primary"));
  await flush();
  expect(writes()).toEqual([
    [
      "bakers_comment_publish",
      { ticket: "SHOP-56", type: "comment", body: "Plan approved. Keep the cache at 1 h." },
    ],
    ["bakers_ticket_transition", { ticket: "SHOP-56", state: "working" }],
  ]);
  expect(closed()).toBe(true);
  reset();
  resetMod();
  copy = await open({
    view: "dialog",
    form: "state",
    ticket: "SHOP-56",
    from: "plan",
    to: "working",
  });
  click(find(copy.render(), "primary"));
  await flush();
  expect(writes()).toEqual([["bakers_ticket_transition", { ticket: "SHOP-56", state: "working" }]]);
});

test("Esc and Keep in plan write nothing", async () => {
  const copy = await open({
    view: "dialog",
    form: "state",
    ticket: "SHOP-56",
    from: "plan",
    to: "working",
  });
  key(copy.render(), "escape");
  click(find(copy.render(), "secondary"));
  expect(writes()).toEqual([]);
  expect(closed()).toBe(true);
});

test("Done and Cancelled say the ticket closes and put the primary button first", async () => {
  const copy = await open({
    view: "dialog",
    form: "state",
    ticket: "SHOP-56",
    from: "plan",
    to: "done",
  });
  const root = copy.render();
  expect(
    findText(root, "This closes SHOP-56. A closed ticket cannot be changed any more."),
  ).toBeDefined();
  expect(texts(find(root, "dialog-footer"))).toEqual([
    "Esc keeps it in plan",
    "Move to done",
    "Keep in plan",
  ]);
});
