import { beforeEach, expect, test } from "bun:test";
import { activeSpace, backend, resetMod } from "../fixtures/shop";
import { click, env, find, flush, load, mount, reset, runs, tools } from "../harness";

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

test("New ticket creates with the project and an existing ticket's workflow, then opens it pinned", async () => {
  const copy = await open({ view: "dialog", form: "create" });
  copy.inner.inputs.input("title").type("Show stock on the product page");
  copy.inner.inputs.input("description").type("Customers ask.");
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
