// The key commands the ticket module answers: actions (cmd-K) and goto with a text. Each runs
// through shell.status's command loop, as a key press in Herdr does.
import { beforeEach, expect, test } from "bun:test";
import { activeSpace, backend, resetMod } from "../fixtures/shop";
import { env, flush, load, mount, reset } from "../harness";

beforeEach(() => {
  reset();
  resetMod();
});

/** Runs one key command with these tabs and this focus; returns the overlays it opened. */
async function command(c: string, focused: any, shared: Record<string, unknown> = {}) {
  activeSpace();
  backend();
  env.spaces[0].tabs.push(
    { id: "t5", name: "SHOP-41 working", index: 2, active: false },
    { id: "t6", name: "3", index: 3, active: false },
  );
  env.focused = { space: "s1", pane: "p1", ...focused };
  Object.assign(env.shared, shared);
  env.commands.push(c);
  const Bakers = await load("bakers/main.js");
  mount(Bakers, { view: "shell.status" });
  await flush();
  return env.calls.filter((x) => x.fn === "openOverlay").map((x) => x.args[0] as any);
}

const PANEL = {
  id: "root",
  type: "row",
  children: [
    { id: "work-body", type: "row", children: [{ id: "main", type: "tabs" }] },
    {
      id: "panel",
      type: "column",
      children: [{ id: "panel-body", type: "stack", active: "ticket", children: [] }],
    },
  ],
};

test("actions while the panel shows a ticket opens the palette for it, centred by Herdr as one window", async () => {
  env.layout = PANEL;
  expect(await command("actions", { tab: "t6" }, { "bakers.selected": "SHOP-41" })).toEqual([
    {
      mod: "bakers",
      props: { view: "ticket.actions", ticket: "SHOP-41" },
      kind: "window",
      key: "bakers.actions",
      width: 480,
      height: 490,
    },
  ]);
});

test("actions with the run focused targets the ticket the panel shows", async () => {
  env.layout = PANEL;
  const [o] = await command(
    "actions",
    { tab: "t6", pane: null, terminal: "t7" },
    { "bakers.selected": "SHOP-41" },
  );
  expect(o.props.ticket).toBe("SHOP-41");
});

test("actions on the Tickets tab targets the selected row, or none", async () => {
  const [o] = await command("actions", { tab: "t0" }, { "bakers.selected": "SHOP-56" });
  expect(o.props.ticket).toBe("SHOP-56");
  reset();
  resetMod();
  const [none] = await command("actions", { tab: "t0" });
  expect(none.props.ticket).toBeNull();
});

test("actions on any other tab targets no ticket", async () => {
  const [o] = await command("actions", { tab: "t6" }, { "bakers.selected": "SHOP-56" });
  expect(o.props.ticket).toBeNull();
});

test("goto opens the palette on its tickets page, with a text when given", async () => {
  env.layout = PANEL;
  const [o] = await command("goto:deliv", { tab: "t6" }, { "bakers.selected": "SHOP-41" });
  expect(o).toEqual({
    mod: "bakers",
    props: { view: "ticket.actions", ticket: "SHOP-41", page: "tickets", query: "deliv" },
    kind: "window",
    key: "bakers.actions",
    width: 480,
    height: 490,
  });
  reset();
  resetMod();
  const [plain] = await command("goto", { tab: "t0" });
  expect(plain.props).toEqual({ view: "ticket.actions", ticket: null, page: "tickets" });
});
