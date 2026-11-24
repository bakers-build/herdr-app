import { beforeEach, expect, test } from "bun:test";
import { activeSpace, backend, resetMod } from "../../fixtures/shop";
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
  runs,
  texts,
  fetched,
} from "../../harness";

const actions: any = await import("../../../mods/bakers/core/actions.js");

beforeEach(() => {
  reset();
  resetMod();
});

const DEFAULT = { needsMe: false, mine: false, state: "open", label: null, type: null };

async function list(patch: any = { needsMe: true }) {
  activeSpace();
  backend();
  env.shared["bakers.filter"] = { ...DEFAULT, ...patch };
  const Bakers = await load("bakers/main.js");
  const copy = mount(Bakers, { view: "ticket.list" });
  await flush();
  return copy;
}

test("header: filter, ... and New ticket as drawn; the filter bar below", async () => {
  const root = (await list()).render();
  expect(find(root, "view-menu")).toBeUndefined();
  const filter = find(root, "filter");
  expect(filter.calls.w).toEqual([220]);
  expect(filter.calls.h).toEqual([28]);
  const input = filter.nodes.find((n: any) => n.kind === "Input");
  expect(input.arg.placeholder).toBe("Filter, / focuses");
  expect(texts(find(root, "list-menu"))).toEqual(["..."]);
  const create = find(root, "new-ticket");
  expect(texts(create)).toEqual(["New ticket"]);
  expect(create.calls.bg).toEqual(["solid"]);
  expect(create.calls.px).toEqual([12]);
  expect(texts(find(root, "filter-bar"))).toEqual([
    "Needs me",
    "2",
    "Mine",
    "0",
    "State: Open",
    "Label: any",
    "Type: any",
    "Clear",
  ]);
});

test("cards of Needs me as drawn, 8 px apart, no table columns", async () => {
  const root = (await list()).render();
  expect(find(root, "columns")).toBeUndefined();
  expect(find(root, "rows").calls.gap).toEqual([8]);
  const r41 = find(root, "row-SHOP-41");
  expect(texts(r41)).toEqual([
    "SHOP-41",
    "working",
    "bug",
    "35m",
    "Checkout fails with an empty cart",
    "Asked a question",
    "Question",
    "checkout",
    "Claude Code needs you",
  ]);
  expect(r41.calls.px).toEqual([12]);
  expect(r41.calls.py).toEqual([10]);
  const why = findText(r41, "Asked a question");
  expect(why.calls.text_color).toEqual(["blocked"]);
  expect(why.calls.font_semibold).toBeDefined();
  expect(texts(find(root, "row-SHOP-56"))).toEqual([
    "SHOP-56",
    "plan",
    "",
    "12m",
    "Show delivery date on the product page",
    "Plan ready for approval",
    "No active run, no conductor",
  ]);
});

test("in every view a card shows its why only while the ticket needs you", async () => {
  const root = (await list({})).render();
  expect(texts(find(root, "row-SHOP-41"))).toContain("Asked a question");
  expect(texts(find(root, "row-SHOP-57"))).toEqual([
    "SHOP-57",
    "qualification",
    "",
    "",
    "Q one",
    "No active run, no conductor",
  ]);
});

test("the selected card has the accent outline, the selected background and its selection state", async () => {
  const root = (await list()).render();
  const r41 = find(root, "row-SHOP-41");
  expect(r41.calls.border_color).toEqual(["accent"]);
  expect(r41.calls.border).toEqual([2]);
  expect(r41.calls.bg).toEqual(["selected"]);
  expect(r41.calls.selected).toEqual([true]);
  expect(env.shared["bakers.selected"]).toBe("SHOP-41");
});

test("Down moves the selection and the panel follows; Enter opens the preview", async () => {
  const copy = await list();
  key(copy.render(), "down");
  expect(env.shared["bakers.selected"]).toBe("SHOP-56");
  key(copy.render(), "up");
  expect(env.shared["bakers.selected"]).toBe("SHOP-41");
  env.calls.length = 0;
  key(copy.render(), "enter");
  expect(runs()).toEqual([
    [
      "tab.new",
      { mod: "bakers", props: { view: "ticket.view", ticket: "SHOP-41" }, name: "SHOP-41 working" },
    ],
  ]);
  expect(env.shared["bakers.preview"]).toEqual({ id: "SHOP-41", index: null });
});

test("cmd-Enter and double-click open a pinned tab", async () => {
  const copy = await list();
  key(copy.render(), "cmd-enter");
  expect(env.shared["bakers.preview"]).toBeUndefined();
  expect(runs()[0]).toEqual([
    "tab.new",
    { mod: "bakers", props: { view: "ticket.view", ticket: "SHOP-41" }, name: "SHOP-41 working" },
  ]);
  env.calls.length = 0;
  click(find(copy.render(), "row-SHOP-56"), { click_count: 2 });
  expect(runs()).toEqual([
    [
      "tab.new",
      { mod: "bakers", props: { view: "ticket.view", ticket: "SHOP-56" }, name: "SHOP-56 plan" },
    ],
  ]);
  expect(env.shared["bakers.preview"]).toBeUndefined();
});

test("a single click selects a row", async () => {
  const copy = await list();
  click(find(copy.render(), "row-SHOP-56"));
  expect(env.shared["bakers.selected"]).toBe("SHOP-56");
  expect(runs()).toEqual([]);
});

test("/ focuses the filter; typing filters; Esc clears it", async () => {
  const copy = await list({});
  key(copy.render(), "/");
  expect(copy.inner.filter.focused).toBe(true);
  copy.inner.filter.handlers.focus({}, {});
  copy.inner.filter.type("delivery");
  let root = copy.render();
  expect(find(root, "row-SHOP-56")).toBeDefined();
  expect(find(root, "row-SHOP-41")).toBeUndefined();
  key(root, "escape");
  root = copy.render();
  expect(copy.inner.filter.value()).toBe("");
  expect(find(root, "row-SHOP-41")).toBeDefined();
});

test("N opens New ticket and R refreshes", async () => {
  const copy = await list();
  env.calls.length = 0;
  key(copy.render(), "n");
  expect(env.calls.find((c) => c.fn === "openOverlay")?.args[0]).toMatchObject({
    props: { view: "dialog", form: "create" },
    kind: "dialog",
  });
  env.calls.length = 0;
  key(copy.render(), "r");
  await flush();
  expect(fetched().some((u) => u.includes("/jsonapi/bb_ticket/bb_ticket?"))).toBe(true);
});

test("letters typed into the filter do not act as keys", async () => {
  const copy = await list();
  copy.inner.filter.handlers.focus({}, {});
  env.calls.length = 0;
  key(copy.render(), "n");
  expect(env.calls.find((c) => c.fn === "openOverlay")).toBeUndefined();
});

test("the ... menu lists the three items in order and each one acts", async () => {
  const copy = await list();
  env.calls.length = 0;
  click(find(copy.render(), "list-menu"));
  const spec: any = env.calls.find((c) => c.fn === "openOverlay")?.args[0];
  expect(spec).toMatchObject({
    mod: "bakers",
    kind: "popup",
    width: 220,
    props: { view: "menu" },
  });
  expect(spec.props.items.map((i: any) => i.label)).toEqual([
    "Refresh",
    "Close finished ticket tabs",
    "Close all ticket tabs",
  ]);
  env.spaces[0].tabs.push(
    { id: "t5", name: "SHOP-41 working", index: 2 },
    { id: "t6", name: "SHOP-49 closed", index: 3 },
  );
  env.calls.length = 0;
  const [refresh, finished, all] = spec.props.items;
  await actions.perform(refresh.action);
  expect(fetched().some((u) => u.includes("/jsonapi/bb_ticket/bb_ticket?"))).toBe(true);
  env.calls.length = 0;
  await actions.perform(finished.action);
  expect(runs()).toEqual([["tab.close", { id: "t6" }]]);
  env.calls.length = 0;
  await actions.perform(all.action);
  expect(runs()).toEqual([
    ["tab.close", { id: "t5" }],
    ["tab.close", { id: "t6" }],
  ]);
});

test("the closed state lists the server's closed tickets", async () => {
  const copy = await list({ state: "closed" });
  const root = copy.render();
  expect(find(root, "row-SHOP-49")).toBeDefined();
  expect(find(root, "row-SHOP-41")).toBeUndefined();
});

test("filters narrow the rows; with nothing left the hint says so", async () => {
  const copy = await list({ state: "plan" });
  let root = copy.render();
  expect(find(root, "row-SHOP-56")).toBeDefined();
  expect(find(root, "row-SHOP-41")).toBeUndefined();
  env.shared["bakers.filter"] = { ...DEFAULT, mine: true }; // the signed-in user has no ticket
  root = copy.render();
  expect(find(root, "row-SHOP-56")).toBeUndefined();
  expect(findText(root, "Nothing matches these filters.")).toBeDefined();
});

test("New ticket button opens the dialog", async () => {
  const copy = await list();
  env.calls.length = 0;
  click(find(copy.render(), "new-ticket"));
  expect(env.calls.find((c) => c.fn === "openOverlay")?.args[0]).toMatchObject({
    props: { view: "dialog", form: "create" },
  });
});

test("empty hint and key hint as drawn", async () => {
  const root = (await list()).render();
  expect(findText(root, "Nothing else needs you.")).toBeDefined();
  const hint = findText(
    root,
    "Enter opens the preview tab, cmd-Enter a pinned tab, N a new ticket, / the filter, R refreshes, cmd-K the actions of the selected ticket. The filter bar narrows the list. Up and down move the selection; the Ticket panel, when shown, follows it.",
  );
  expect(hint.calls.text_size).toEqual([11]);
});

test("an empty project shows the hint, no rows and nothing selected", async () => {
  activeSpace();
  backend({ jsonapi: { tickets: [] } });
  const Bakers = await load("bakers/main.js");
  const copy = mount(Bakers, { view: "ticket.list" });
  await flush();
  const root = copy.render();
  expect(findText(root, "No other open tickets.")).toBeDefined();
  expect(texts(root).some((t) => /^SHOP-/.test(t))).toBe(false);
  expect(env.shared["bakers.selected"]).toBe(null);
});

test("offline: the CLI's message inline with Retry", async () => {
  activeSpace();
  const Bakers = await load("bakers/main.js");
  const copy = mount(Bakers, { view: "ticket.list" });
  await flush();
  const root = copy.render();
  expect(texts(root).some((t) => t.startsWith("bakers offline"))).toBe(true);
  backend();
  click(find(root, "retry"));
  await flush();
  expect(find(copy.render(), "row-SHOP-41")).toBeDefined();
});
