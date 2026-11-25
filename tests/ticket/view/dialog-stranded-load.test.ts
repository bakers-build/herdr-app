// Dialogs opened while another copy's project load or project resolution never answers. Herdr ends
// a closed copy's pending calls, so a promise that copy started never settles; a dialog that waits
// for it stays on "..." for good. Every dialog kind shows its form from what it is given and, at
// most, a read of its one ticket, never the whole project.
import { beforeEach, expect, test } from "bun:test";
import { activeSpace, backend, resetMod } from "../../fixtures/shop";
import {
  asCopy,
  click,
  closingCopy,
  env,
  fetched,
  find,
  flush,
  hostCall,
  load,
  mount,
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

/** Mounts the copy the last openOverlay asked for, in a call of its own copy, as Herdr does. */
function openRequested(Bakers: any) {
  const spec = env.calls.filter((c) => c.fn === "openOverlay").at(-1)?.args[0] as any;
  if (!spec) throw new Error("nothing asked for an overlay");
  return asCopy("dialog", () => mount(Bakers, { ...spec.props, overlay: "overlay-d" }));
}

/** A fresh window, no list loaded: the palette opens and starts the project load, the person picks
 *  before it answers, the palette closes and Herdr ends its pending calls. */
async function fromPalette(
  pick: (palette: any) => void,
  { ticket = "SHOP-41", page = null as any, data = {} as any } = {},
) {
  activeSpace();
  env.shared["bakers.project"] = "p1";
  backend(data);
  const Bakers = await load("bakers/main.js");
  const restore = closingCopy();
  let palette: any;
  await hostCall("palette", () => {
    palette = mount(Bakers, { view: "ticket.actions", ticket, overlay: "overlay-9" });
  });
  if (page) await hostCall("palette", () => page(palette));
  let dialog: any;
  await hostCall("palette", () => {
    pick(palette);
    dialog = openRequested(Bakers);
  });
  retire("palette");
  restore();
  await flush();
  return dialog;
}

/** A fresh window whose project resolution a closed menu copy started; the panel then opens a
 *  dialog with `props`. */
async function fromPanel(props: Record<string, unknown>) {
  activeSpace();
  env.shared["bakers.project"] = "p1";
  backend({});
  const Bakers = await load("bakers/main.js");
  const { ensureProject } = await import("../../../mods/bakers/project/state.js");
  const restore = closingCopy();
  await hostCall("menu", () => {
    void ensureProject();
    env.calls.push({ fn: "closeOverlay", args: ["overlay-m"] });
  });
  retire("menu");
  restore();
  env.calls.length = 0;
  const dialog = asCopy("dialog", () =>
    mount(Bakers, { view: "dialog", overlay: "overlay-d", ...props }),
  );
  await flush();
  return dialog;
}

const row = (palette: any, id: string) => find(palette.render(), id);

test("State from the palette shows its form although the palette's load never answers", async () => {
  const dialog = await fromPalette((p) => click(row(p, "state-review")), {
    page: (p: any) => click(row(p, "action-state")),
  });
  const root = dialog.render();
  expect(dialog.inner.error).toBeNull();
  expect(texts(root)).toContain("Move SHOP-41 to review?");
  expect(find(root, "field-comment")).toBeDefined();
});

test("State from the panel shows its form although a closed copy owns the project resolution", async () => {
  const dialog = await fromPanel({ form: "state", ticket: "SHOP-41", from: "done", to: "review" });
  const root = dialog.render();
  expect(dialog.inner.error).toBeNull();
  expect(texts(root)).toContain("Move SHOP-41 to review?");
  expect(texts(find(root, "pills"))).toEqual(["done", "review"]);
  expect(find(root, "field-comment")).toBeDefined();
});

test("State opened in a fresh copy reads at most its one ticket, never the list", async () => {
  await fromPanel({ form: "state", ticket: "SHOP-41", from: "done", to: "review" });
  const urls = fetched();
  expect(urls.length).toBeGreaterThan(0);
  expect(urls.every((u) => /SHOP-41/.test(u))).toBe(true);
});

test("Move from the palette shows its form although the palette's load never answers", async () => {
  const dialog = await fromPalette((p) => click(row(p, "conductor-k2")), {
    data: ciBox,
    page: (p: any) => click(row(p, "action-move")),
  });
  const root = dialog.render();
  expect(dialog.inner.error).toBeNull();
  expect(texts(root)).toContain("Move SHOP-41 to ci-box?");
  expect(find(root, "field-reason")).toBeDefined();
});

test("Move from the panel shows its form although a closed copy owns the project resolution", async () => {
  const dialog = await fromPanel({ form: "move", ticket: "SHOP-41", conductor: "k2", name: "ci-box" });
  const root = dialog.render();
  expect(dialog.inner.error).toBeNull();
  expect(texts(root)).toContain("Move SHOP-41 to ci-box?");
  expect(find(root, "field-reason")).toBeDefined();
});

test("Freeze from the palette shows its form although the palette's load never answers", async () => {
  const dialog = await fromPalette((p) => click(row(p, "action-freeze")), { ticket: "SHOP-56" });
  expect(texts(dialog.render())).toContain("Freeze SHOP-56?");
});

test("Freeze, Unfreeze and Cancel run from the panel show their forms with no project", async () => {
  for (const [form, title] of [
    ["freeze", "Freeze SHOP-56?"],
    ["unfreeze", "Unfreeze SHOP-56?"],
    ["cancel", "Cancel the run of SHOP-56?"],
  ]) {
    reset();
    resetMod();
    const dialog = await fromPanel({ form, ticket: "SHOP-56" });
    expect(dialog.inner.error).toBeNull();
    expect(texts(dialog.render())).toContain(title);
  }
});
