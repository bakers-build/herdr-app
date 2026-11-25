// Dialogs opened from the cmd-K palette. The palette closes itself, then runs the choice, all in one
// of its own calls; Herdr mounts the dialog's copy and then retires the palette's, releasing every
// text state the palette owns. A dialog whose fields belonged to the palette could not render
// ("this input state has been released"), so each case renders the dialog after the palette retired.
import { beforeEach, expect, test } from "bun:test";
import { get } from "../../../mods/bakers/core/registry.js";
import { activeSpace, backend, resetMod } from "../../fixtures/shop";
import {
  asCopy,
  click,
  env,
  find,
  flush,
  hostCall,
  key,
  load,
  mount,
  ownerOf,
  reset,
  retire,
  texts,
} from "../../harness";

beforeEach(() => {
  reset();
  resetMod();
});

const ciBox = {
  jsonapi: { conductors: [{ id: "k2", label: "ci-box", machine: "build-vps", status: "online" }] },
};

/** Mounts the copy the last openOverlay asked for, as Herdr does: its init runs in a call of its
 *  own copy, "dialog". */
function openRequested(Bakers: any) {
  const spec = env.calls.filter((c) => c.fn === "openOverlay").at(-1)?.args[0] as any;
  if (!spec) throw new Error("nothing asked for an overlay");
  return asCopy("dialog", () => mount(Bakers, { ...spec.props, overlay: "overlay-d" }));
}

type Opened = { dialog: any; order: string[]; error: string | null; root: any };

/** Opens the palette (on `ticket`), optionally goes to a page in a palette call of its own, then in
 *  one palette call runs `choose`, which closes the palette and asks for a dialog. The palette
 *  retires, the dialog's work settles, and the dialog renders. */
async function fromPalette(
  choose: (palette: any) => void,
  { ticket = "SHOP-41" as string | null, data = {} as any, page = null as any } = {},
): Promise<Opened> {
  activeSpace();
  env.shared["bakers.project"] = "p1";
  backend(data);
  const Bakers = await load("bakers/main.js");
  let palette: any;
  await hostCall("palette", () => {
    palette = mount(Bakers, { view: "ticket.actions", ticket, overlay: "overlay-9" });
  });
  await flush();
  if (page) {
    await hostCall("palette", () => page(palette));
    await flush();
  }
  env.calls.length = 0;
  let dialog: any;
  await hostCall("palette", () => {
    choose(palette);
    dialog = openRequested(Bakers);
  });
  const order = env.calls
    .filter((c) => c.fn === "closeOverlay" || c.fn === "openOverlay")
    .map((c) => (c.fn === "closeOverlay" ? `close ${c.args[0]}` : "open"));
  retire("palette");
  await flush();
  let error: string | null = null;
  let root: any = null;
  try {
    root = dialog.render();
  } catch (e: any) {
    error = e.message;
  }
  return { dialog, order, error, root };
}

const row = (palette: any, id: string) => find(palette.render(), id);

test("New ticket by click: the palette closes before the dialog renders, and the form renders", async () => {
  const { order, error, root, dialog } = await fromPalette((p) => click(row(p, "cmd-new")), {
    ticket: null,
  });
  expect(order).toEqual(["close overlay-9", "open"]);
  expect(error).toBeNull();
  expect(dialog.inner.error).toBeNull();
  expect(texts(root)).toContain("New ticket");
  expect(find(root, "field-title")).toBeDefined();
  expect(find(root, "field-description")).toBeDefined();
});

test("New ticket by Enter on its highlighted row renders the form", async () => {
  const { order, error, root } = await fromPalette(
    (p) => {
      key(p.render(), "down");
      key(p.render(), "enter");
    },
    { ticket: null },
  );
  expect(order).toEqual(["close overlay-9", "open"]);
  expect(error).toBeNull();
  expect(texts(root)).toContain("New ticket");
  expect(find(root, "field-title")).toBeDefined();
  expect(find(root, "field-description")).toBeDefined();
});

test("Cancel run... renders its form with the reason field", async () => {
  const { order, error, root } = await fromPalette((p) => click(row(p, "action-cancel")));
  expect(order).toEqual(["close overlay-9", "open"]);
  expect(error).toBeNull();
  expect(texts(root)).toContain("Cancel the run of SHOP-41?");
  expect(find(root, "field-reason")).toBeDefined();
});

test("Change state... then a state renders the state dialog and its text field", async () => {
  const { order, error, root, dialog } = await fromPalette((p) => click(row(p, "state-review")), {
    page: (p: any) => click(row(p, "action-state")),
  });
  expect(order).toEqual(["close overlay-9", "open"]);
  expect(error).toBeNull();
  expect(dialog.inner.error).toBeNull();
  expect(texts(root)).toContain("Move SHOP-41 to review?");
  expect(find(root, "field-comment")).toBeDefined();
});

test("Move to... then a conductor renders the move dialog and its field", async () => {
  const { order, error, root, dialog } = await fromPalette((p) => click(row(p, "conductor-k2")), {
    data: ciBox,
    page: (p: any) => click(row(p, "action-move")),
  });
  expect(order).toEqual(["close overlay-9", "open"]);
  expect(error).toBeNull();
  expect(texts(root)).toContain("Move SHOP-41 to ci-box?");
  expect(Object.keys(dialog.inner.inputs.inputs).length).toBeGreaterThan(0);
  for (const name of Object.keys(dialog.inner.inputs.inputs))
    expect(find(root, `field-${name}`)).toBeDefined();
});

test("Freeze... on a ticket that is not frozen renders its dialog", async () => {
  const { order, error, root, dialog } = await fromPalette((p) => click(row(p, "action-freeze")), {
    ticket: "SHOP-56",
  });
  expect(order).toEqual(["close overlay-9", "open"]);
  expect(error).toBeNull();
  expect(dialog.inner.error).toBeNull();
  expect(texts(root)).toContain("Freeze SHOP-56?");
});

test("Unfreeze... renders its dialog", async () => {
  const { order, error, root, dialog } = await fromPalette((p) => click(row(p, "action-freeze")));
  expect(order).toEqual(["close overlay-9", "open"]);
  expect(error).toBeNull();
  expect(dialog.inner.error).toBeNull();
  expect(texts(root)).toContain("Unfreeze SHOP-41?");
});

test("a dialog's text states belong to the dialog, not to the copy that opened it", async () => {
  activeSpace();
  env.shared["bakers.project"] = "p1";
  backend({});
  const Bakers = await load("bakers/main.js");
  let dialog: any;
  await hostCall("window", () => {
    void get("command", "new")?.run("", { width: 0, left: 0 });
    dialog = openRequested(Bakers);
  });
  await flush();
  expect(() => dialog.render()).not.toThrow();
  const states = Object.values(dialog.inner.inputs.inputs);
  expect(states.length).toBe(2);
  expect(states.map(ownerOf)).toEqual(["dialog", "dialog"]);
});
