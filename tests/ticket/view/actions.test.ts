// The actions palette (cmd-K): the target ticket's actions and the bakers commands, filtered by
// typing, run with Enter or a click; Change state as a second step.
import { beforeEach, expect, test } from "bun:test";
import { activeSpace, backend, list, live, resetMod } from "../../fixtures/shop";
import {
  click,
  cx,
  env,
  find,
  fetched,
  fireTimers,
  flush,
  key,
  load,
  mount,
  reset,
  runs,
  texts,
  walk,
} from "../../harness";

const TITLE = list.find((t) => t.id === "u41")?.title as string;
// SHOP-38 is closed: only the server search finds it, as in search.test.ts.
const withClosed = [
  ...list,
  {
    id: "u38",
    identifier: "SHOP-38",
    title: "Delivery slots for the cart",
    state: "done",
    labels: [],
    frozen: false,
    closed: true,
  },
];

beforeEach(() => {
  reset();
  resetMod();
});

async function palette(
  ticket: string | null = "SHOP-41",
  settle = true,
  data: any = {},
  extra: Record<string, unknown> = {},
) {
  activeSpace();
  env.shared["bakers.project"] = "p1";
  backend(data);
  env.keys = [
    { section: "global", keys: "cmd-shift-o", action: "bakers.goto" },
    { section: "global", keys: "cmd-shift-b", action: "bakers.tickets" },
  ];
  const Bakers = await load("bakers/main.js");
  const copy = mount(Bakers, { view: "ticket.actions", ticket, overlay: "overlay-9", ...extra });
  if (settle) await flush();
  return copy;
}

/** The ids of the palette's rows, in order. */
function rows(root: any): string[] {
  const out: string[] = [];
  walk(root, (n) => {
    const id = n.calls.id?.[0];
    if (typeof id === "string" && /^(action|cmd|state|ticket|conductor)-/.test(id)) out.push(id);
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

const ciBox = {
  jsonapi: { conductors: [{ id: "k2", label: "ci-box", machine: "build-vps", status: "online" }] },
};

test("Move to opens the conductors page; choosing one asks in the move dialog", async () => {
  const copy = await palette("SHOP-41", true, ciBox);
  key(copy.render(), "down");
  env.calls.length = 0;
  key(copy.render(), "enter");
  await flush();
  const root = copy.render();
  expect(closed()).toEqual([]);
  expect(texts(find(root, "actions-target")).join(" ")).toContain("Move to");
  expect(texts(row(root, "conductor-k2"))).toEqual(["ci-box", "build-vps"]);
  expect(texts(root)).toContain("↵ Move · Esc Back");
  key(root, "enter");
  expect(closed()).toEqual(["overlay-9"]);
  expect(opened()[0].props).toEqual({
    view: "dialog",
    form: "move",
    ticket: "SHOP-41",
    conductor: "k2",
    name: "ci-box",
  });
});

test("the conductors page of a project without conductors says so", async () => {
  const copy = await palette("SHOP-41", true, { jsonapi: { conductors: [] } }, { page: "move" });
  expect(texts(copy.render())).toContain("No conductor in this project.");
});

test("Esc goes back a page and restores its text; Esc on the first page closes", async () => {
  const copy = await palette();
  copy.inner.input.type("mov");
  key(copy.render(), "enter");
  expect(copy.inner.input.value()).toBe("");
  key(copy.render(), "escape");
  expect(copy.inner.input.value()).toBe("mov");
  expect(rows(copy.render())[0]).toBe("action-move");
  expect(closed()).toEqual([]);
  key(copy.render(), "escape");
  expect(closed()).toEqual(["overlay-9"]);
});

test("Tab on a ticket opens its actions page; Backspace in the empty field goes back", async () => {
  const copy = await palette();
  copy.inner.input.type("shop-56");
  expect(texts(copy.render())).toContain("↵ Open ticket · Tab Actions · Esc Close");
  key(copy.render(), "tab");
  await flush();
  const root = copy.render();
  expect(texts(find(root, "actions-target"))).toContain("SHOP-56");
  expect(rows(root)).toEqual([
    "action-agent",
    "action-state",
    "action-move",
    "action-freeze",
    "action-cancel",
    "action-copy",
  ]);
  key(root, "backspace");
  expect(copy.inner.input.value()).toBe("shop-56");
});

test("the footer says what Enter does", async () => {
  expect(texts((await palette()).render())).toContain("↵ Open · Esc Close");
});

test("Go to ticket in the palette opens the tickets page", async () => {
  const copy = await palette();
  env.calls.length = 0;
  click(row(copy.render(), "cmd-goto"));
  const root = copy.render();
  expect(closed()).toEqual([]);
  expect(texts(find(root, "actions-target")).join(" ")).toContain("Go to ticket");
  expect(rows(root).every((r) => r.startsWith("ticket-"))).toBe(true);
});

test("the tickets page searches the server once after 200 ms of quiet", async () => {
  const copy = await palette("SHOP-41", true, {}, { page: "tickets" });
  env.calls.length = 0;
  copy.inner.input.type("de");
  copy.inner.input.type("deliv");
  expect(fetched()).toEqual([]);
  fireTimers(200);
  await flush();
  const searches = fetched();
  expect(searches.length).toBe(2);
  expect(searches[0]).toContain(
    "[path]=identifier&filter[f1][condition][operator]=STARTS_WITH&filter[f1][condition][value]=DELIV",
  );
  expect(searches[1]).toContain(
    "[path]=title&filter[f1][condition][operator]=CONTAINS&filter[f1][condition][value]=deliv",
  );
  expect(rows(copy.render()).every((r) => r.startsWith("ticket-"))).toBe(true);
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

test("typing matches fuzzily and sorts by the best match", async () => {
  const copy = await palette();
  copy.inner.input.type("chst");
  expect(rows(copy.render()).filter((r) => !r.startsWith("ticket-"))).toEqual(["action-state"]);
  copy.inner.input.type("can");
  const actions = rows(copy.render()).filter((r) => r.startsWith("action-"));
  expect(actions.slice(0, 2)).toEqual(["action-cancel", "action-state"]);
});

test("with text typed, matching tickets follow: the store's at once, the server's after 200 ms", async () => {
  const copy = await palette("SHOP-41", true, { jsonapi: { tickets: withClosed } });
  copy.inner.input.type("deliv");
  let ids = rows(copy.render()).filter((r) => r.startsWith("ticket-"));
  expect(ids).toContain("ticket-SHOP-56");
  expect(ids).not.toContain("ticket-SHOP-38");
  fireTimers(200);
  await flush();
  ids = rows(copy.render()).filter((r) => r.startsWith("ticket-"));
  expect(ids).toContain("ticket-SHOP-38");
  expect(ids.filter((r) => r === "ticket-SHOP-56")).toHaveLength(1);
  expect(texts(row(copy.render(), "ticket-SHOP-56"))).toEqual([
    "SHOP-56",
    "Show delivery date on the product page",
    "plan",
  ]);
});

test("an exact identifier comes first and Enter shows it in the panel, no tab", async () => {
  const copy = await palette();
  copy.inner.input.type("shop-56");
  const root = copy.render();
  expect(rows(root).find((r) => r.startsWith("ticket-"))).toBe("ticket-SHOP-56");
  env.calls.length = 0;
  key(root, "enter");
  expect(closed()).toEqual(["overlay-9"]);
  expect(env.shared["bakers.selected"]).toBe("SHOP-56");
  expect(runs()).toContainEqual(["layout.show", { id: "panel" }]);
  expect(runs().some(([c]: any) => c === "tab.new")).toBe(false);
});

test("an empty field lists no tickets", async () => {
  const root = (await palette()).render();
  expect(rows(root).some((r) => r.startsWith("ticket-"))).toBe(false);
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
    overlay: "o",
  });
  await flush();
  const root = copy.render();
  expect(row(root, "action-failure")).toBeDefined();
  expect(rows(root)).toEqual(["action-failure", "cmd-goto", "cmd-new", "cmd-tickets", "cmd-panel"]);
  expect(row(root, "cmd-goto").calls.on_click).toBeDefined();
});

test("each page has its own field and placeholder", async () => {
  const copy = await palette();
  expect(copy.inner.input.placeholder).toBe("Search actions and tickets...");
  click(row(copy.render(), "cmd-goto"));
  expect(copy.inner.input.placeholder).toBe("Search tickets...");
  expect(copy.inner.input.focused).toBe(true);
});

test("the highlight lands on the first action once the ticket has loaded", async () => {
  env.terminals = [live("t7")];
  const copy = await palette("SHOP-41", false);
  copy.render();
  await flush();
  const root = copy.render();
  expect(row(root, "action-agent").calls.bg).toBeDefined();
  expect(texts(root)).toContain("↵ Run · Esc Close");
});

test("a press on the palette does not drag the window", async () => {
  const root = (await palette()).render();
  const c = cx();
  find(root, "actions").calls["on_mouse_down:left"][1]({}, c);
  expect(c.stopped).toBe(true);
});
