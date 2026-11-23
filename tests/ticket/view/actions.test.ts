// The actions palette (cmd-K): the target ticket's actions and the bakers commands, filtered by
// typing, run with Enter or a click; Change state as a second step.
import { beforeEach, expect, test } from "bun:test";
import { activeSpace, backend, list, live, resetMod } from "../../fixtures/shop";
import { click, env, find, flush, key, load, mount, reset, runs, texts, walk } from "../../harness";

const WHERE = { width: 1384, left: 56 };
const TITLE = list.find((t) => t.id === "u41")?.title as string;

beforeEach(() => {
  reset();
  resetMod();
});

async function palette(ticket: string | null = "SHOP-41", settle = true) {
  activeSpace();
  backend();
  env.keys = [
    { section: "global", keys: "cmd-shift-o", action: "bakers.goto" },
    { section: "global", keys: "cmd-shift-b", action: "bakers.tickets" },
  ];
  const Bakers = await load("bakers/main.js");
  const copy = mount(Bakers, {
    view: "ticket.actions",
    ticket,
    where: WHERE,
    overlay: "overlay-9",
  });
  if (settle) await flush();
  return copy;
}

/** The ids of the palette's rows, in order. */
function rows(root: any): string[] {
  const out: string[] = [];
  walk(root, (n) => {
    const id = n.calls.id?.[0];
    if (typeof id === "string" && /^(action|cmd|state)-|^goto-text$/.test(id)) out.push(id);
  });
  return out;
}

const row = (root: any, id: string) => find(root, id);
const opened = () => env.calls.filter((c) => c.fn === "openOverlay").map((c) => c.args[0] as any);
const closed = () => env.calls.filter((c) => c.fn === "closeOverlay").map((c) => c.args[0]);

test("the ticket's six actions, then the bakers commands, with their keys", async () => {
  const root = (await palette()).render();
  expect(texts(find(root, "actions-target"))).toEqual(["SHOP-41", TITLE, "working"]);
  expect(rows(root)).toEqual([
    "action-agent",
    "action-state",
    "action-move",
    "action-freeze",
    "action-cancel",
    "action-copy",
    "cmd-goto",
    "cmd-new",
    "cmd-tickets",
    "cmd-panel",
  ]);
  expect(texts(row(root, "action-freeze"))).toContain("Unfreeze...");
  expect(texts(row(root, "action-agent"))).toContain("G");
  expect(texts(row(root, "action-move"))).toEqual(["Move to...", "R"]);
  expect(texts(row(root, "cmd-goto"))).toEqual(["Go to ticket...", "cmd-shift-O"]);
  expect(texts(row(root, "cmd-tickets"))).toEqual(["Tickets", "cmd-shift-B"]);
  expect(texts(row(root, "cmd-new"))).toEqual(["New ticket"]);
});

test("without a ticket only the bakers commands", async () => {
  const root = (await palette(null)).render();
  expect(texts(find(root, "actions-target"))).toEqual(["No ticket in front"]);
  expect(rows(root)).toEqual(["cmd-goto", "cmd-new", "cmd-tickets", "cmd-panel"]);
});

test("Show agent without a live run says why, and Enter skips it", async () => {
  const copy = await palette();
  const root = copy.render();
  expect(texts(row(root, "action-agent"))).toContain("No live run terminal");
  expect(row(root, "action-agent").calls.on_click).toBeUndefined();
  key(root, "enter");
  expect(texts(find(copy.render(), "actions-target")).join(" ")).toContain("Change state");
  expect(closed()).toEqual([]);
});

test("Show agent with a live run closes the palette and shows the run", async () => {
  env.terminals = [live("t7")];
  const copy = await palette();
  env.calls.length = 0;
  key(copy.render(), "enter");
  expect(closed()).toEqual(["overlay-9"]);
  const focus = env.calls.find((c) => c.fn === "setShared" && c.args[0] === "bakers.runFocus");
  expect((focus?.args[1] as any)?.id).toBe("SHOP-41");
});

test("a run that ends before Enter: nothing runs, and the reason shows", async () => {
  env.terminals = [live("t7")];
  const copy = await palette();
  const root = copy.render();
  env.terminals = [];
  env.calls.length = 0;
  key(root, "enter");
  expect(closed()).toEqual([]);
  expect(opened()).toEqual([]);
  expect(texts(row(copy.render(), "action-agent"))).toContain("No live run terminal");
});

test("Move to... opens the conductor picker", async () => {
  const copy = await palette();
  key(copy.render(), "down");
  env.calls.length = 0;
  key(copy.render(), "enter");
  expect(closed()).toEqual(["overlay-9"]);
  expect(opened()[0].props).toEqual({ view: "ticket.conductor-picker", ticket: "SHOP-41" });
});

test("Unfreeze... and Cancel run... open their dialogs", async () => {
  const copy = await palette();
  env.calls.length = 0;
  click(row(copy.render(), "action-freeze"));
  click(row(copy.render(), "action-cancel"));
  expect(opened().map((o) => o.props)).toEqual([
    { view: "dialog", form: "unfreeze", ticket: "SHOP-41" },
    { view: "dialog", form: "cancel", ticket: "SHOP-41" },
  ]);
});

test("Copy identifier copies", async () => {
  const copy = await palette();
  env.calls.length = 0;
  click(row(copy.render(), "action-copy"));
  expect(env.calls.filter((c) => c.fn === "clipboard").map((c) => c.args)).toEqual([["SHOP-41"]]);
});

test("typing keeps the entries with every word, then Go to ticket with the text", async () => {
  const copy = await palette();
  copy.inner.input.type("run");
  const root = copy.render();
  expect(rows(root)).toEqual(["action-cancel", "goto-text"]);
  expect(texts(row(root, "goto-text"))).toEqual(['Go to ticket "run"...']);
  copy.inner.input.type("CANCEL run");
  expect(rows(copy.render())).toEqual(["action-cancel", "goto-text"]);
});

test("nothing matches: Go to ticket with the text is chosen and opens the search", async () => {
  const copy = await palette();
  copy.inner.input.type("zzz");
  const root = copy.render();
  expect(rows(root)).toEqual(["goto-text"]);
  env.calls.length = 0;
  key(root, "enter");
  expect(closed()).toEqual(["overlay-9"]);
  expect(opened()[0]).toMatchObject({
    props: { view: "ticket.search", query: "zzz" },
    at: { x: 508, y: 120 },
  });
});

test("Change state lists every state, the current one marked, and opens the state dialog", async () => {
  const copy = await palette();
  key(copy.render(), "enter");
  let root = copy.render();
  expect(rows(root)).toEqual([
    "state-qualification",
    "state-plan",
    "state-working",
    "state-review",
    "state-done",
    "state-cancelled",
  ]);
  expect(texts(row(root, "state-working"))).toEqual(["Working", "current"]);
  expect(row(root, "state-working").calls.on_click).toBeUndefined();
  expect(texts(root)).toContain("All states shown; the server refuses what the workflow forbids.");
  key(root, "down");
  key(copy.render(), "down");
  root = copy.render();
  env.calls.length = 0;
  key(root, "enter");
  expect(closed()).toEqual(["overlay-9"]);
  expect(opened()[0].props).toEqual({
    view: "dialog",
    form: "state",
    ticket: "SHOP-41",
    from: "working",
    to: "review",
  });
});

test("Backspace in the empty field goes back from Change state to the actions", async () => {
  const copy = await palette();
  key(copy.render(), "enter");
  key(copy.render(), "backspace");
  expect(rows(copy.render())[0]).toBe("action-agent");
});

test("a bakers command runs as its key does", async () => {
  const copy = await palette();
  env.calls.length = 0;
  click(row(copy.render(), "cmd-tickets"));
  expect(closed()).toEqual(["overlay-9"]);
  expect(runs()).toEqual([["tab.select", { id: "t0" }]]);
});

test("Esc closes and does nothing else", async () => {
  const copy = await palette();
  env.calls.length = 0;
  key(copy.render(), "escape");
  expect(env.calls.map((c) => c.fn)).toEqual(["closeOverlay"]);
});

test("while the ticket loads, and when it fails, the bakers commands still work", async () => {
  const loadingRoot = (await palette("SHOP-41", false)).render();
  expect(texts(loadingRoot)).toContain("Loading SHOP-41...");
  reset();
  resetMod();
  activeSpace();
  const Bakers = await load("bakers/main.js");
  const copy = mount(Bakers, {
    view: "ticket.actions",
    ticket: "SHOP-41",
    where: WHERE,
    overlay: "o",
  });
  await flush();
  const root = copy.render();
  expect(row(root, "action-failure")).toBeDefined();
  expect(rows(root)).toEqual(["action-failure", "cmd-goto", "cmd-new", "cmd-tickets", "cmd-panel"]);
  expect(row(root, "cmd-goto").calls.on_click).toBeDefined();
});
