// Dialogs whose opener closes as it opens them: the cmd-K palette, a menu popup. The opener's call
// mounts the dialog. Live, the one frame Herdr reliably draws for such a dialog is its first,
// after init. A later redraw asked for from a task or timer (cx.notify) did not reach it: at
// 87a9696 Freeze... stayed on "..." although its build is synchronous, while New ticket showed its
// form only because focusing its text field redrew it; at 93fb7b5 every dialog stayed on "...".
// So each case takes the dialog's first frame, drawn once the opener's call returned and before any
// task, timer or redraw, and expects the form in it.
import { beforeEach, expect, test } from "bun:test";
import { get } from "../../../mods/bakers/core/registry.js";
import { activeSpace, backend, resetMod } from "../../fixtures/shop";
import {
  click,
  asCopy,
  env,
  find,
  fireTimers,
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

const { FORM_TIMEOUT_MS } = await import("../../../mods/bakers/ui/form/dialog.js");
const { getStore } = await import("../../../mods/bakers/ticket/store.js");

beforeEach(() => {
  reset();
  resetMod();
});

const ciBox = {
  jsonapi: { conductors: [{ id: "k2", label: "ci-box", machine: "build-vps", status: "online" }] },
};

type Opened = { dialog: any; first: string[] };

/** In one call of `opener`, `choose` closes the opener and asks for a dialog; Herdr mounts the
 *  dialog's copy inside that call. Returns the dialog and its first frame, drawn after that call
 *  and before any timer runs. Then the opener retires, unless it stays open (a panel). */
async function open(
  opener: string,
  choose: () => void,
  { hang = false, retires = true } = {},
): Promise<Opened> {
  const Bakers = await load("bakers/main.js");
  if (hang) {
    env.fetch = () => new Promise(() => {});
    env.exec = () => new Promise(() => {});
  }
  let dialog: any;
  await hostCall(opener, () => {
    choose();
    const spec = env.calls.filter((c) => c.fn === "openOverlay").at(-1)?.args[0] as any;
    if (!spec) throw new Error("nothing asked for an overlay");
    dialog = asCopy("dialog", () => mount(Bakers, { ...spec.props, overlay: "overlay-d" }));
  });
  const first = asCopy("dialog", () => texts(dialog.render()));
  if (retires) retire(opener);
  await flush();
  return { dialog, first };
}

function world(data: any = {}) {
  activeSpace();
  env.shared["bakers.project"] = "p1";
  backend(data);
}

/** The palette on `ticket`, optionally on a page; returns it. */
async function palette({ ticket = "SHOP-41" as string | null, page = null as string | null } = {}) {
  const Bakers = await load("bakers/main.js");
  let p: any;
  await hostCall("palette", () => {
    p = mount(Bakers, { view: "ticket.actions", ticket, overlay: "overlay-9" });
  });
  await flush();
  if (page) {
    await hostCall("palette", () => click(find(p.render(), page)));
    await flush();
  }
  return p;
}

/** A menu popup with one item, as the panel's state pill opens it. */
async function menu(action: unknown[]) {
  const Bakers = await load("bakers/main.js");
  let m: any;
  await hostCall("menu", () => {
    m = mount(Bakers, { view: "menu", overlay: "overlay-m", items: [{ label: "x", action }] });
  });
  await flush();
  return m;
}

/** The form is in the first frame, and its text fields are the dialog's own. */
function expectForm({ dialog, first }: Opened, title: string) {
  expect(
    first.join(" "),
    'the first frame shows only "...": the form came from a task or timer after init, and Herdr does not redraw a dialog for those',
  ).toContain(title);
  expect(dialog.inner.error).toBeNull();
  for (const input of Object.values(dialog.inner.inputs?.inputs ?? {}))
    expect(ownerOf(input)).toBe("dialog");
}

const fromPalette: [string, string, string | null, string | null, string, any][] = [
  ["New ticket", "cmd-new", null, null, "New ticket", {}],
  ["Freeze...", "action-freeze", "SHOP-56", null, "Freeze SHOP-56?", {}],
  ["Unfreeze...", "action-freeze", "SHOP-41", null, "Unfreeze SHOP-41?", {}],
  ["Cancel run...", "action-cancel", "SHOP-41", null, "Cancel the run of SHOP-41?", {}],
  [
    "Change state -> review",
    "state-review",
    "SHOP-41",
    "action-state",
    "Move SHOP-41 to review?",
    {},
  ],
  ["Move to -> ci-box", "conductor-k2", "SHOP-41", "action-move", "Move SHOP-41 to ci-box?", ciBox],
];

for (const [name, row, ticket, page, title, data] of fromPalette) {
  test(`AC1/AC2 palette click, ${name}: the first frame shows the form`, async () => {
    world(data);
    const p = await palette({ ticket, page });
    expectForm(await open("palette", () => click(find(p.render(), row))), title);
  });
}

test("AC2 palette Enter, New ticket: the first frame shows the form", async () => {
  world();
  const p = await palette({ ticket: null });
  await hostCall("palette", () => key(p.render(), "down"));
  const opened = await open("palette", () => key(p.render(), "enter"));
  expectForm(opened, "New ticket");
  expect(find(opened.dialog.render(), "field-title")).toBeDefined();
});

test("AC2 panel state menu -> Review...: the first frame shows the form", async () => {
  world();
  const m = await menu(["form.open", "state", { ticket: "SHOP-41", from: "done", to: "review" }]);
  const opened = await open("menu", () => click(find(m.render(), "pick-0")));
  expectForm(opened, "Move SHOP-41 to review?");
  expect(find(opened.dialog.render(), "field-comment")).toBeDefined();
});

for (const [name, form, p, title] of [
  ["Freeze...", "freeze", { ticket: "SHOP-56" }, "Freeze SHOP-56?"],
  ["Cancel run...", "cancel", { ticket: "SHOP-41" }, "Cancel the run of SHOP-41?"],
  [
    "Edit section",
    "section",
    { ticket: "SHOP-41", section: "description" },
    "Edit description of SHOP-41",
  ],
] as const) {
  test(`AC2 panel button ${name}: the first frame shows the form`, async () => {
    world();
    // The panel shows the ticket, so its detail is read before any of its buttons.
    await getStore().ticket("SHOP-41");
    const { openForm } = await import("../../../mods/bakers/ui/form/dialog.js");
    const opened = await open("panel", () => openForm(form, p), { retires: false });
    expectForm(opened, title);
  });
}

test("AC2 command bakers.new: the first frame shows the form", async () => {
  world();
  const opened = await open(
    "window",
    () => void get("command", "new")?.run("", { width: 0, left: 0 }),
    { retires: false },
  );
  expectForm(opened, "New ticket");
});

test("AC2 state from the palette: the build's answer refines the text of the drawn form", async () => {
  world();
  const p = await palette({ page: "action-state" });
  const { dialog, first } = await open("palette", () => click(find(p.render(), "state-review")));
  expect(first.join(" ")).toContain("Move SHOP-41 to review?");
  const typed = dialog.inner.inputs.inputs.comment;
  await flush();
  expect(dialog.inner.inputs.inputs.comment).toBe(typed);
  expect(dialog.inner.error).toBeNull();
});

test("AC4 Esc closes a dialog the palette opened, once the palette retired", async () => {
  world();
  const p = await palette({ ticket: "SHOP-56" });
  const { dialog } = await open("palette", () => click(find(p.render(), "action-freeze")));
  key(dialog.render(), "escape");
  expect(env.calls.some((c) => c.fn === "closeOverlay" && c.args[0] === "overlay-d")).toBe(true);
});

// AC3: the build never answers and the opener retired. A form that can draw itself from what is
// known does so at once; one that cannot shows a readable error at FORM_TIMEOUT_MS.
for (const [name, page, row, title, data] of [
  ["state", "action-state", "state-review", "Move SHOP-41 to review?", {}],
  ["move", "action-move", "conductor-k2", "Move SHOP-41 to ci-box?", ciBox],
] as const) {
  test(`AC3 ${name} from the palette, build never answers: the first frame shows the known form`, async () => {
    world(data);
    const p = await palette({ page });
    const opened = await open("palette", () => click(find(p.render(), row)), { hang: true });
    expectForm(opened, title);
  });
}

for (const [name, row, ticket, title] of [
  ["Freeze...", "action-freeze", "SHOP-56", "Freeze SHOP-56?"],
  ["Cancel run...", "action-cancel", "SHOP-41", "Cancel the run of SHOP-41?"],
] as const) {
  test(`AC3 ${name} from the palette, network hangs: the first frame shows the form`, async () => {
    world();
    const p = await palette({ ticket });
    const opened = await open("palette", () => click(find(p.render(), row)), { hang: true });
    expectForm(opened, title);
  });
}

test("AC3 section never read and the read never answers: a readable error at FORM_TIMEOUT_MS", async () => {
  world();
  const { openForm } = await import("../../../mods/bakers/ui/form/dialog.js");
  const { dialog } = await open(
    "panel",
    () => openForm("section", { ticket: "SHOP-41", section: "summary" }),
    { hang: true, retires: false },
  );
  fireTimers(FORM_TIMEOUT_MS);
  await flush();
  expect(texts(dialog.render()).join(" ")).toMatch(/could not load: no answer within 3 s/);
});
