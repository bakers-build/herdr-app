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

test("Freeze: Keep is the default; Freeze writes frozen true", async () => {
  const copy = await open({ view: "dialog", form: "freeze", ticket: "SHOP-41" });
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
  const copy = await open({ view: "dialog", form: "unfreeze", ticket: "SHOP-41" });
  key(copy.render(), "escape");
  expect(writes()).toEqual([]);
  click(find(copy.render(), "primary"));
  await flush();
  expect(writes()).toEqual([["bakers_ticket_update", { ticket: "SHOP-41", frozen: false }]]);
});
