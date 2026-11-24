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
  fireTimers,
  walk,
} from "../../harness";

const actions: any = await import("../../../mods/bakers/core/actions.js");

beforeEach(() => {
  reset();
  resetMod();
});

async function list(view = "needs-me") {
  activeSpace();
  backend();
  env.shared["bakers.view"] = view;
  const Bakers = await load("bakers/main.js");
  const copy = mount(Bakers, { view: "ticket.list" });
  await flush();
  return copy;
}

test("header: view menu, filter, ... and New ticket as drawn", async () => {
  const root = (await list()).render();
  const menu = find(root, "view-menu");
  expect(texts(menu)).toEqual(["Needs me"]);
  expect(menu.calls.h).toEqual([28]);
  expect(menu.calls.font_semibold).toBeDefined();
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
});

test("columns and rows of Needs me as drawn", async () => {
  const root = (await list()).render();
  const head = find(root, "columns");
  expect(texts(head)).toEqual(["TICKET", "TITLE", "WHY", "AGENT", "AGE"]);
  expect(head.calls.text_size).toEqual([11]);
  expect(head.nodes.map((n: any) => n.calls.w?.[0] ?? "flex")).toEqual([76, "flex", 170, 150, 44]);
  expect(head.calls.gap).toEqual([12]);
  const r41 = find(root, "row-SHOP-41");
  expect(texts(r41)).toEqual([
    "SHOP-41",
    "Checkout fails with an empty cart",
    "Asked a question",
    "Claude Code needs you",
    "35m",
  ]);
  expect(r41.calls.px).toEqual([12]);
  expect(r41.calls.py).toEqual([10]);
  const why = findText(r41, "Asked a question");
  expect(why.calls.text_color).toEqual(["blocked"]);
  expect(why.calls.font_semibold).toBeDefined();
  expect(texts(find(root, "row-SHOP-56"))).toEqual([
    "SHOP-56",
    "Show delivery date on the product page",
    "Plan ready for approval",
    "No active run, no conductor",
    "12m",
  ]);
});

test("WHY becomes STATE outside Needs me", async () => {
  const root = (await list("open")).render();
  expect(texts(find(root, "columns"))).toEqual(["TICKET", "TITLE", "STATE", "AGENT", "AGE"]);
  expect(texts(find(root, "row-SHOP-57"))[2]).toBe("qualification");
});

test("the selected row has the accent outline, the selected background and its selection state", async () => {
  const root = (await list()).render();
  const r41 = find(root, "row-SHOP-41");
  expect(r41.calls.border_color).toEqual(["accent"]);
  expect(r41.calls.border).toEqual([2]);
  expect(r41.calls.bg).toEqual(["selected"]);
  expect(r41.calls.selected).toEqual([true]);
  expect(env.shared["bakers.selected"]).toBe("SHOP-41");
});

const PANEL_SHOW = [
  ["layout.select", { stack: "panel-body", child: "ticket" }],
  ["layout.show", { id: "panel" }],
];

test("Down moves the selection and the panel follows; Enter shows the ticket in the panel", async () => {
  const copy = await list();
  key(copy.render(), "down");
  expect(env.shared["bakers.selected"]).toBe("SHOP-56");
  key(copy.render(), "up");
  expect(env.shared["bakers.selected"]).toBe("SHOP-41");
  env.calls.length = 0;
  key(copy.render(), "enter");
  expect(runs()).toEqual(PANEL_SHOW);
  expect(env.shared["bakers.preview"]).toBeUndefined();
});

test("cmd-Enter and double-click show the ticket in the panel, no tab", async () => {
  const copy = await list();
  key(copy.render(), "cmd-enter");
  expect(runs()).toEqual(PANEL_SHOW);
  env.calls.length = 0;
  click(find(copy.render(), "row-SHOP-56"), { click_count: 2 });
  expect(env.shared["bakers.selected"]).toBe("SHOP-56");
  expect(runs()).toEqual(PANEL_SHOW);
  expect(runs().some((r) => r[0] === "tab.new")).toBe(false);
});

test("a selection made outside the list (goto, create) survives a refresh of its rows", async () => {
  const copy = await list();
  env.shared["bakers.selected"] = "SHOP-70";
  copy.render();
  expect(env.shared["bakers.selected"]).toBe("SHOP-70");
  expect(copy.inner.selected).toBe("SHOP-70");
  key(copy.render(), "down");
  expect(env.shared["bakers.selected"]).toBe("SHOP-56");
});

test("a single click selects a row", async () => {
  const copy = await list();
  click(find(copy.render(), "row-SHOP-56"));
  expect(env.shared["bakers.selected"]).toBe("SHOP-56");
  expect(runs()).toEqual([]);
});

test("/ focuses the filter; typing filters; Esc clears it", async () => {
  const copy = await list("open");
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

test("the ... menu lists Refresh and Show closed tickets and each one acts", async () => {
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
  expect(spec.props.items.map((i: any) => i.label)).toEqual(["Refresh", "Show closed tickets"]);
  env.calls.length = 0;
  const [refresh, closed] = spec.props.items;
  await actions.perform(refresh.action);
  expect(fetched().some((u) => u.includes("/jsonapi/bb_ticket/bb_ticket?"))).toBe(true);
  await actions.perform(closed.action);
  expect(env.shared["bakers.showClosed"]).toBe(true);
});

test("Show closed tickets lists done tickets in Open by state", async () => {
  const copy = await list("open");
  expect(find(copy.render(), "row-SHOP-49")).toBeUndefined();
  env.shared["bakers.showClosed"] = true;
  fireTimers();
  await flush();
  expect(find(copy.render(), "row-SHOP-49")).toBeDefined();
});

test("a closed ticket open as a tab shows once with Show closed tickets", async () => {
  activeSpace();
  env.spaces[0].tabs.push({ id: "t6", name: "SHOP-49 closed", index: 2 });
  backend();
  env.shared["bakers.view"] = "open";
  const Bakers = await load("bakers/main.js");
  const copy = mount(Bakers, { view: "ticket.list" });
  await flush();
  expect(find(copy.render(), "row-SHOP-49")).toBeUndefined();
  env.shared["bakers.showClosed"] = true;
  fireTimers();
  await flush();
  let rows = 0;
  walk(copy.render(), (n: any) => {
    if (n?.calls?.id?.[0] === "row-SHOP-49") rows++;
  });
  expect(rows).toBe(1);
});

test("the view menu offers the sidebar's views and switches", async () => {
  const copy = await list();
  env.calls.length = 0;
  click(find(copy.render(), "view-menu"));
  const spec: any = env.calls.find((c) => c.fn === "openOverlay")?.args[0];
  expect(spec.props.items.map((i: any) => i.label)).toEqual([
    "Needs me",
    "Mine",
    "Open by state",
    "Qualification",
    "Plan",
    "Working",
    "Review",
    "Recently closed",
  ]);
  expect(spec.props.items[1].disabled).toBe(true);
  await actions.perform(spec.props.items[2].action);
  expect(env.shared["bakers.view"]).toBe("open");
  expect(texts(find(copy.render(), "view-menu"))).toEqual(["Open by state"]);
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
  expect(
    findText(root, "Nothing else needs you. Switch the view for Mine or Open by state."),
  ).toBeDefined();
  const hint = findText(
    root,
    "Enter or a double click shows the ticket in the panel, N a new ticket, / the filter, R refreshes, cmd-K the actions of the selected ticket. Up and down move the selection; the panel, when shown, follows it.",
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
  expect(
    findText(root, "Nothing else needs you. Switch the view for Mine or Open by state."),
  ).toBeDefined();
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
