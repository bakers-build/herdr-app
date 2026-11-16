import { beforeEach, expect, test } from "bun:test";
import { activeSpace, backend, resetMod } from "../fixtures/shop";
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
} from "../harness";

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

test("Move to: the conductor picker lists the project's bb_conductor entities, then the dialog", async () => {
  const copy = await open(
    { view: "conductor-picker", ticket: "SHOP-41" },
    {
      jsonapi: {
        conductors: [{ id: "k2", label: "ci-box", machine: "build-vps", status: "online" }],
      },
    },
  );
  const root = copy.render();
  expect(texts(find(root, "pick-k2"))).toEqual(["ci-box", "build-vps"]);
  click(find(root, "pick-k2"));
  expect(env.calls.find((c) => c.fn === "openOverlay")?.args[0]).toMatchObject({
    props: { view: "dialog", form: "move", ticket: "SHOP-41", conductor: "k2", name: "ci-box" },
  });
});

test("Move to in a project without conductors says so", async () => {
  const copy = await open(
    { view: "conductor-picker", ticket: "SHOP-41" },
    { jsonapi: { conductors: [] } },
  );
  expect(texts(copy.render())).toEqual(["No conductor in this project."]);
});

test("Move to dialog: cancel the run, then set the conductor", async () => {
  const copy = await open({
    view: "dialog",
    form: "move",
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
  copy.inner.inputs.input("reason").type("Needs the build-vps toolchain");
  click(find(root, "primary"));
  await flush();
  expect(writes()).toEqual([
    ["bakers_run_cancel", { ticket: "SHOP-41", reason: "Needs the build-vps toolchain" }],
    ["bakers_ticket_update", { ticket: "SHOP-41", conductor: "k2" }],
  ]);
});

test("Move to: when setting the conductor fails, it says the run was cancelled", async () => {
  const copy = await open(
    { view: "dialog", form: "move", ticket: "SHOP-41", conductor: "k2", name: "ci-box" },
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
  const copy = await open({ view: "dialog", form: "cancel", ticket: "SHOP-41" });
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
