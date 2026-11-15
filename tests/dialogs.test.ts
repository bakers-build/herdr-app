import { beforeEach, expect, test } from "bun:test";
import { activeSpace, backend } from "./fixtures/shop";
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
  runs,
  texts,
  tools,
} from "./harness";

const ctx: any = await import("../mods/bakers/lib/context.js");
const tabs: any = await import("../mods/bakers/lib/tabs.js");

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

// State menu and change-state dialog (frame 4).

test("the state menu lists every state, marks the current one and says what the API cannot", async () => {
  const copy = await open({ view: "picker", kind: "state", ticket: "SHOP-56", current: "plan" });
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
    props: { view: "confirm", kind: "state", ticket: "SHOP-56", from: "plan", to: "working" },
    kind: "dialog",
    modal: true,
  });
  expect(closed()).toBe(true);
  expect(writes()).toEqual([]);
});

test("Move to working: from and to, the consequence, an optional comment, and Keep as the default", async () => {
  const copy = await open({
    view: "confirm",
    kind: "state",
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
    view: "confirm",
    kind: "state",
    ticket: "SHOP-56",
    from: "plan",
    to: "working",
  });
  copy.inner.comment.type("Plan approved. Keep the cache at 1 h.");
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
  ctx._resetForTests();
  copy = await open({
    view: "confirm",
    kind: "state",
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
    view: "confirm",
    kind: "state",
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
    view: "confirm",
    kind: "state",
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

// Freeze and unfreeze (frame 4).

test("Freeze: Keep is the default; Freeze writes frozen true", async () => {
  const copy = await open({ view: "confirm", kind: "freeze", ticket: "SHOP-41" });
  const root = copy.render();
  expect(findText(root, "Freeze SHOP-41?").calls.text_size).toEqual([15]);
  expect(
    findText(
      root,
      "No conductor picks it up while it is frozen. A run that is already running continues until it ends.",
    ),
  ).toBeDefined();
  expect(texts(find(root, "dialog-footer"))).toEqual(["Freeze", "Keep"]);
  expect(find(root, "secondary").calls.bg).toEqual(["solid"]);
  key(root, "enter");
  expect(writes()).toEqual([]);
  click(find(copy.render(), "primary"));
  await flush();
  expect(writes()).toEqual([["bakers_ticket_update", { ticket: "SHOP-41", frozen: true }]]);
});

test("Unfreeze writes frozen false only after its button", async () => {
  const copy = await open({ view: "confirm", kind: "unfreeze", ticket: "SHOP-41" });
  key(copy.render(), "escape");
  expect(writes()).toEqual([]);
  click(find(copy.render(), "primary"));
  await flush();
  expect(writes()).toEqual([["bakers_ticket_update", { ticket: "SHOP-41", frozen: false }]]);
});

// Move to and Cancel run (R3-2).

test("Move to: the conductor picker from conductor_list, then the dialog", async () => {
  const copy = await open(
    { view: "picker", kind: "conductor", ticket: "SHOP-41" },
    {
      bakers_conductor_list: {
        conductors: [{ uuid: "k2", name: "ci-box", machine: "build-vps", online: true }],
      },
    },
  );
  const root = copy.render();
  expect(texts(find(root, "pick-k2"))).toEqual(["ci-box", "build-vps"]);
  click(find(root, "pick-k2"));
  expect(env.calls.find((c) => c.fn === "openOverlay")?.args[0]).toMatchObject({
    props: { view: "confirm", kind: "move", ticket: "SHOP-41", conductor: "k2", name: "ci-box" },
  });
});

test("Move to without conductor_list says it needs the API", async () => {
  const copy = await open({ view: "picker", kind: "conductor", ticket: "SHOP-41" });
  const t = texts(copy.render());
  expect(t).toContain("API");
  expect(t).toContain("The conductor list needs the bakers API.");
});

test("Move to dialog: cancel the run, then set the conductor", async () => {
  const copy = await open({
    view: "confirm",
    kind: "move",
    ticket: "SHOP-41",
    conductor: "k2",
    name: "ci-box",
  });
  const root = copy.render();
  expect(findText(root, "Move SHOP-41 to ci-box?")).toBeDefined();
  expect(texts(find(root, "dialog-footer"))).toEqual([
    "Esc keeps it on its conductor",
    "Keep on its conductor",
    "Cancel and run on ci-box",
  ]);
  copy.inner.reason.type("Needs the build-vps toolchain");
  click(find(root, "primary"));
  await flush();
  expect(writes()).toEqual([
    ["bakers_run_cancel", { ticket: "SHOP-41", reason: "Needs the build-vps toolchain" }],
    ["bakers_ticket_update", { ticket: "SHOP-41", conductor: "k2" }],
  ]);
});

test("Move to: when setting the conductor fails, it says the run was cancelled", async () => {
  const copy = await open(
    { view: "confirm", kind: "move", ticket: "SHOP-41", conductor: "k2", name: "ci-box" },
    { bakers_ticket_update: new Error("Conductor offline") },
  );
  click(find(copy.render(), "primary"));
  await flush();
  expect(
    findText(copy.render(), "Run cancelled, not started on ci-box: Conductor offline"),
  ).toBeDefined();
  expect(closed()).toBe(false);
});

test("Cancel run: the dialog, then run_cancel with the reason", async () => {
  const copy = await open({ view: "confirm", kind: "cancel", ticket: "SHOP-41" });
  const root = copy.render();
  expect(findText(root, "Cancel the run of SHOP-41?")).toBeDefined();
  key(root, "enter");
  expect(writes()).toEqual([]);
  click(find(copy.render(), "primary"));
  await flush();
  expect(writes()).toEqual([
    ["bakers_run_cancel", { ticket: "SHOP-41", reason: "Cancelled from Herdr" }],
  ]);
});

// Menus and pickers.

test("a menu runs its item's action and closes", async () => {
  const copy = await open({
    view: "picker",
    kind: "menu",
    items: [
      { label: "Refresh", action: ["refresh"] },
      { label: "Show closed tickets", action: ["toggleClosed"] },
    ],
  });
  click(find(copy.render(), "pick-1"));
  await flush();
  expect(env.shared["bakers.showClosed"]).toBe(true);
  expect(closed()).toBe(true);
});

test("a disabled menu item does nothing", async () => {
  const copy = await open({
    view: "picker",
    kind: "menu",
    items: [{ label: "Mine", action: ["view", "mine"], disabled: true }],
  });
  expect(find(copy.render(), "pick-0").calls.on_click).toBeUndefined();
});

test("the label picker adds a typed label at once", async () => {
  const copy = await open({ view: "picker", kind: "labels", ticket: "SHOP-41" });
  copy.inner.input.type("ui");
  copy.inner.input.submit();
  await flush();
  expect(writes()).toEqual([["bakers_ticket_update", { ticket: "SHOP-41", labels_add: ["ui"] }]]);
});

// New ticket.

test("New ticket creates with the project and an existing ticket's workflow, then opens it pinned", async () => {
  const copy = await open({ view: "new-ticket" });
  copy.inner.title.type("Show stock on the product page");
  copy.inner.description.type("Customers ask.");
  click(find(copy.render(), "type-feature"));
  click(find(copy.render(), "primary"));
  await flush();
  expect(writes()).toEqual([
    [
      "bakers_ticket_create",
      {
        title: "Show stock on the product page",
        project: "p1",
        workflow: "bb_work",
        type: "feature",
        description: "Customers ask.",
      },
    ],
  ]);
  expect(runs()).toContainEqual([
    "tab.new",
    { mod: "bakers", props: { view: "ticket", ticket: "SHOP-70" }, name: "SHOP-70 qualification" },
  ]);
  expect(closed()).toBe(true);
});
