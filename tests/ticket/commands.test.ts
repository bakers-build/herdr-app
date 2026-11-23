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

// The status bar is 1440 - 56 px wide and starts at x 56 (no sidebar): centred, 480 px wide.
const AT = { x: 508, y: 120 };
const WHERE = { width: 1384, left: 56 };

test("actions on a ticket tab opens the palette for that ticket, placed like Go to ticket", async () => {
  expect(await command("actions", { tab: "t5" })).toEqual([
    {
      mod: "bakers",
      props: { view: "ticket.actions", ticket: "SHOP-41", where: WHERE },
      kind: "popup",
      width: 480,
      at: AT,
    },
  ]);
});

test("actions with the run block focused targets the ticket in front", async () => {
  const [o] = await command("actions", { tab: "t5", pane: null, terminal: "t7" });
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

test("goto with a text opens Go to ticket with that text", async () => {
  const [o] = await command("goto:deliv", { tab: "t0" });
  expect(o).toMatchObject({ props: { view: "ticket.search", query: "deliv" }, at: AT });
  reset();
  resetMod();
  const [plain] = await command("goto", { tab: "t0" });
  expect(plain.props).toEqual({ view: "ticket.search" });
});
