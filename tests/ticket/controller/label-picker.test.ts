import { beforeEach, expect, test } from "bun:test";
import { activeSpace, backend, resetMod } from "../../fixtures/shop";
import { env, flush, load, mount, reset, tools } from "../../harness";

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

test("the label picker adds a typed label at once", async () => {
  const copy = await open({ view: "ticket.label-picker", ticket: "SHOP-41" });
  copy.inner.input.type("ui");
  copy.inner.input.submit();
  await flush();
  expect(writes()).toEqual([["bakers_ticket_update", { ticket: "SHOP-41", labels_add: ["ui"] }]]);
});
