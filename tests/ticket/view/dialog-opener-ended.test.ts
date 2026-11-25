// Dialogs whose opener closes as it opens them: the cmd-K palette, a menu popup. The opener's call
// mounts the dialog, and the dialog's build settles while that call still runs. A task or timer made
// then without an owner belongs to the running view, the opener (gpui-kit TaskOptions.owner); Herdr
// retires the closed opener and ends its timers, so a dialog whose "ready" and timeout timers the
// opener owned stayed on "..." for good. Each case retires the opener and expects the form without
// waiting for any timer, and every timer the dialog made to be the dialog's own.
import { beforeEach, expect, test } from "bun:test";
import { get } from "../../../mods/bakers/core/registry.js";
import { activeSpace, backend, resetMod } from "../../fixtures/shop";
import {
  asCopy,
  click,
  env,
  find,
  fireTimers,
  flush,
  hostCall,
  key,
  load,
  mount,
  reset,
  retire,
  texts,
} from "../../harness";

const { FORM_TIMEOUT_MS } = await import("../../../mods/bakers/ui/form/dialog.js");

beforeEach(() => {
  reset();
  resetMod();
});

const ciBox = {
  jsonapi: { conductors: [{ id: "k2", label: "ci-box", machine: "build-vps", status: "online" }] },
};

type Opened = { dialog: any; owners: string[] };

/** In one call of `opener`, `choose` closes the opener and asks for a dialog; Herdr mounts the
 *  dialog's copy inside that call. Then the opener retires, unless it stays open (a panel). Returns
 *  the dialog and the owner of every timer made during that call, as "<ms>ms:<copy>". */
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
  const before = new Set(env.timers);
  let dialog: any;
  await hostCall(opener, () => {
    choose();
    const spec = env.calls.filter((c) => c.fn === "openOverlay").at(-1)?.args[0] as any;
    if (!spec) throw new Error("nothing asked for an overlay");
    dialog = asCopy("dialog", () => mount(Bakers, { ...spec.props, overlay: "overlay-d" }));
  });
  const owners = env.timers.filter((t) => !before.has(t)).map((t) => `${t.ms}ms:${t.owner}`);
  if (retires) retire(opener);
  await flush();
  return { dialog, owners };
}

function world(data: any = {}) {
  activeSpace();
  env.shared["bakers.project"] = "p1";
  backend(data);
}

/** The palette on `ticket`, optionally on a page; returns a function that picks a row. */
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

/** The form is drawn, and only the dialog's own copy owns what the dialog left to run. */
function expectForm({ dialog, owners }: Opened, title: string, opener: string) {
  const foreign = owners.filter((o) => !o.endsWith(":dialog")).join(", ");
  expect(
    foreign,
    `dialog timers owned by the opener (${opener}), which Herdr ends when it closes: they were made without TaskOptions.owner`,
  ).toBe("");
  expect(dialog.inner.error).toBeNull();
  expect(texts(dialog.render())).toContain(title);
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
  test(`AC1/AC2 palette click, ${name}: the form renders after the palette retired`, async () => {
    world(data);
    const p = await palette({ ticket, page });
    expectForm(await open("palette", () => click(find(p.render(), row))), title, "palette");
  });
}

test("AC2 palette Enter, New ticket: the form renders after the palette retired", async () => {
  world();
  const p = await palette({ ticket: null });
  await hostCall("palette", () => key(p.render(), "down"));
  const opened = await open("palette", () => key(p.render(), "enter"));
  expectForm(opened, "New ticket", "palette");
  expect(find(opened.dialog.render(), "field-title")).toBeDefined();
});

test("AC2 panel state menu -> Review...: the form renders after the menu retired", async () => {
  world();
  const m = await menu(["form.open", "state", { ticket: "SHOP-41", from: "done", to: "review" }]);
  const opened = await open("menu", () => click(find(m.render(), "pick-0")));
  expectForm(opened, "Move SHOP-41 to review?", "menu");
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
  test(`AC2 panel button ${name}: the form renders`, async () => {
    world();
    const { openForm } = await import("../../../mods/bakers/ui/form/dialog.js");
    const opened = await open("panel", () => openForm(form, p), { retires: false });
    expectForm(opened, title, "panel");
  });
}

test("AC2 command bakers.new: the form renders", async () => {
  world();
  const opened = await open(
    "window",
    () => void get("command", "new")?.run("", { width: 0, left: 0 }),
    { retires: false },
  );
  expectForm(opened, "New ticket", "window");
});

test("AC4 Esc closes a dialog the palette opened, once the palette retired", async () => {
  world();
  const p = await palette({ ticket: "SHOP-56" });
  const { dialog } = await open("palette", () => click(find(p.render(), "action-freeze")));
  key(dialog.render(), "escape");
  expect(env.calls.some((c) => c.fn === "closeOverlay" && c.args[0] === "overlay-d")).toBe(true);
});

// AC3: the build never answers and the opener retired; the bound still holds.
test("AC3 state from the palette, build never answers: the now() form after FORM_TIMEOUT_MS", async () => {
  world();
  const p = await palette({ page: "action-state" });
  const { dialog } = await open("palette", () => click(find(p.render(), "state-review")), {
    hang: true,
  });
  fireTimers(FORM_TIMEOUT_MS);
  await flush();
  expect(dialog.inner.error).toBeNull();
  expect(texts(dialog.render())).toContain("Move SHOP-41 to review?");
});

test("AC3 move from the palette, build never answers: the now() form after FORM_TIMEOUT_MS", async () => {
  world(ciBox);
  const p = await palette({ page: "action-move" });
  const { dialog } = await open("palette", () => click(find(p.render(), "conductor-k2")), {
    hang: true,
  });
  fireTimers(FORM_TIMEOUT_MS);
  await flush();
  expect(dialog.inner.error).toBeNull();
  expect(texts(dialog.render())).toContain("Move SHOP-41 to ci-box?");
});

for (const [name, row, ticket] of [
  ["Freeze...", "action-freeze", "SHOP-56"],
  ["Cancel run...", "action-cancel", "SHOP-41"],
] as const) {
  test(`AC3 ${name} from the palette, build never answers: a readable error after FORM_TIMEOUT_MS`, async () => {
    world();
    const p = await palette({ ticket });
    const { dialog } = await open("palette", () => click(find(p.render(), row)), { hang: true });
    fireTimers(FORM_TIMEOUT_MS);
    await flush();
    const shown = texts(dialog.render()).join(" ");
    expect(shown).not.toBe("...");
    expect(shown).toMatch(/could not load|Freeze SHOP-56\?|Cancel the run of SHOP-41\?/);
  });
}
