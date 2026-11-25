// The Tickets list header: the project button (header.tool) and the filter bar.
import { beforeEach, expect, test } from "bun:test";
import { activeSpace, backend, list as tickets, resetMod } from "../../fixtures/shop";
import { click, cx, env, find, findText, flush, load, mount, reset, texts } from "../../harness";

const actions: any = await import("../../../mods/bakers/core/actions.js");
const registry: any = await import("../../../mods/bakers/core/registry.js");

beforeEach(() => {
  reset();
  resetMod();
});

const DEFAULT = { needsMe: false, mine: false, state: "open", label: null, type: null };
const TWO = [
  { id: "p0", name: "infra" },
  { id: "p1", name: "acme-shop" },
];

async function list(patch: any = {}, jsonapi?: any) {
  activeSpace();
  backend(jsonapi ? { jsonapi } : {});
  env.shared["bakers.filter"] = { ...DEFAULT, ...patch };
  const Bakers = await load("bakers/main.js");
  const copy = mount(Bakers, { view: "ticket.list" });
  await flush();
  return copy;
}

/** The overlay opened by a click, and only that one. */
function opened(node: any): any[] {
  env.calls.length = 0;
  click(node);
  return env.calls.filter((c) => c.fn === "openOverlay").map((c) => c.args[0]);
}

test("row 1: project button, / text field, ..., New ticket, in that order", async () => {
  const root = (await list()).render();
  const header = find(root, "list-header");
  const ids: string[] = [];
  const go = (n: any) => {
    if (n?.calls?.id) ids.push(n.calls.id[0]);
    n?.nodes?.forEach(go);
  };
  go(find(header, "list-tools"));
  expect(
    ids.filter((i) => ["project-button", "filter", "list-menu", "new-ticket"].includes(i)),
  ).toEqual(["project-button", "filter", "list-menu", "new-ticket"]);
});

test("with one project the button shows its name and a click does nothing", async () => {
  const root = (await list()).render();
  const button = find(root, "project-button");
  expect(texts(button)).toEqual(["acme-shop"]);
  expect(button.calls.on_click).toBeUndefined();
});

test("with two projects a click opens exactly the project picker", async () => {
  const root = (await list({}, { projects: TWO })).render();
  expect(opened(find(root, "project-button"))).toEqual([
    { mod: "bakers", props: { view: "project.picker" }, kind: "popup", width: 220 },
  ]);
});

test("header tools are launched once, drawn every render and stopped on close", async () => {
  const { div } = await import("gpui-kit");
  let inits = 0;
  let closes = 0;
  class Probe {
    init() {
      inits++;
    }
    render() {
      return [div().id("probe-a").child("a"), div().id("probe-b").child("b")];
    }
    close() {
      closes++;
    }
  }
  const Bakers = await load("bakers/main.js");
  registry.define("route", "ticket.probe", { view: Probe });
  registry.define("header.tool", "probe", { order: 1, route: "ticket.probe" });
  registry.define("header.tool", "typo", { order: 2, route: "ticket.missing" });
  activeSpace();
  backend();
  const copy = mount(Bakers, { view: "ticket.list" });
  await flush();
  copy.render();
  const root = copy.render();
  expect(find(root, "probe-a")).toBeDefined();
  expect(find(root, "probe-b")).toBeDefined();
  expect(find(root, "project-button")).toBeDefined();
  expect(inits).toBe(1);
  await copy.close(cx());
  expect(closes).toBe(1);
});

test("clicking Needs me sets the shared filter; the active control shows; Clear resets", async () => {
  const copy = await list();
  let root = copy.render();
  expect(find(root, "filter-clear")).toBeUndefined();
  click(find(root, "filter-needs-me"));
  expect(env.shared["bakers.filter"]).toEqual({ ...DEFAULT, needsMe: true });
  root = copy.render();
  const needs = find(root, "filter-needs-me");
  expect(needs.calls.border_color).toEqual(["accent"]);
  expect(needs.calls.bg).toEqual(["selected"]);
  expect(find(root, "filter-mine").calls.border_color).toEqual(["border"]);
  copy.inner.filter.type("delivery");
  click(find(copy.render(), "filter-clear"));
  expect(env.shared["bakers.filter"]).toEqual(DEFAULT);
  expect(copy.inner.filter.value()).toBe("");
  expect(find(copy.render(), "filter-clear")).toBeUndefined();
});

test("Clear also shows while only the / text is set", async () => {
  const copy = await list();
  copy.inner.filter.type("cart");
  expect(find(copy.render(), "filter-clear")).toBeDefined();
});

test("a second click on an active toggle turns it off", async () => {
  const copy = await list({ needsMe: true });
  click(find(copy.render(), "filter-needs-me"));
  expect(env.shared["bakers.filter"]).toEqual(DEFAULT);
});

test("the toggles carry their counts; State, Label and Type say their value", async () => {
  const root = (await list()).render();
  expect(texts(find(root, "filter-needs-me"))).toEqual(["Needs me", "2"]);
  expect(texts(find(root, "filter-mine"))).toEqual(["Mine", "0"]);
  expect(texts(find(root, "filter-state"))).toEqual(["State: Open"]);
  expect(texts(find(root, "filter-label"))).toEqual(["Label: any"]);
  expect(texts(find(root, "filter-type"))).toEqual(["Type: any"]);
});

test("Mine counts the signed-in user's tickets and filters to them", async () => {
  const mine = tickets.map((t) =>
    t.identifier === "SHOP-57" ? { ...t, assignee_name: "Pascal Glass" } : t,
  );
  const copy = await list({}, { tickets: mine });
  expect(texts(find(copy.render(), "filter-mine"))).toEqual(["Mine", "1"]);
  click(find(copy.render(), "filter-mine"));
  expect(env.shared["bakers.filter"]).toEqual({ ...DEFAULT, mine: true });
  const root = copy.render();
  expect(find(root, "row-SHOP-57")).toBeDefined();
  expect(find(root, "row-SHOP-41")).toBeUndefined();
});

test("without a signed-in user Mine is disabled with the API chip", async () => {
  const root = (await list({}, { users: [] })).render();
  const mine = find(root, "filter-mine");
  expect(texts(mine)).toEqual(["Mine", "API"]);
  expect(mine.calls.on_click).toBeUndefined();
  expect(mine.calls.opacity).toEqual([0.5]);
});

test("the State menu: Open and each state with counts, then Recently closed; it patches the filter", async () => {
  const root = (await list()).render();
  const [spec] = opened(find(root, "filter-state"));
  expect(spec).toMatchObject({ mod: "bakers", kind: "popup", props: { view: "menu" } });
  const items = spec.props.items;
  expect(items.map((i: any) => [i.label, i.hint ?? null])).toEqual([
    ["Open", "6"],
    ["Qualification", "2"],
    ["Plan", "1"],
    ["Working", "3"],
    ["Review", "0"],
    ["Recently closed", null],
  ]);
  expect(items[0].current).toBe(true);
  expect(items[5].separator).toBe(true);
  await actions.perform(items[3].action);
  expect(env.shared["bakers.filter"]).toEqual({ ...DEFAULT, state: "working" });
  await actions.perform(items[5].action);
  expect(env.shared["bakers.filter"]).toEqual({ ...DEFAULT, state: "closed" });
});

test("an active State, Label or Type control names its value and has the accent", async () => {
  const root = (await list({ state: "closed", label: "checkout", type: "bug" })).render();
  expect(texts(find(root, "filter-state"))).toEqual(["State: Recently closed"]);
  expect(texts(find(root, "filter-label"))).toEqual(["Label: checkout"]);
  expect(texts(find(root, "filter-type"))).toEqual(["Type: bug"]);
  for (const id of ["filter-state", "filter-label", "filter-type"])
    expect(find(root, id).calls.border_color).toEqual(["accent"]);
});

test("the Label and Type menus list Any, then the values of the open tickets, sorted", async () => {
  const copy = await list({ label: "checkout" });
  const [labels] = opened(find(copy.render(), "filter-label"));
  expect(labels.props.items.map((i: any) => i.label)).toEqual(["Any", "Question", "checkout"]);
  expect(labels.props.items[2].current).toBe(true);
  await actions.perform(labels.props.items[1].action);
  expect(env.shared["bakers.filter"]).toEqual({ ...DEFAULT, label: "Question" });
  await actions.perform(labels.props.items[0].action);
  expect(env.shared["bakers.filter"]).toEqual(DEFAULT);
  const [types] = opened(find(copy.render(), "filter-type"));
  expect(types.props.items.map((i: any) => i.label)).toEqual(["Any", "bug"]);
  await actions.perform(types.props.items[1].action);
  expect(env.shared["bakers.filter"]).toEqual({ ...DEFAULT, type: "bug" });
  const root = copy.render();
  expect(find(root, "row-SHOP-41")).toBeDefined();
  expect(find(root, "row-SHOP-56")).toBeUndefined();
  expect(findText(root, "Nothing matches these filters.")).toBeUndefined();
});

// HERDRAPP-23: the menus offer the workspace's labels and types, a reason when they cannot.
test("the Label and Type menus offer the workspace's catalog, 0 where no open ticket matches", async () => {
  const copy = await list({}, { catalog: { labels: ["idea"], types: ["chore"] } });
  const [labels] = opened(find(copy.render(), "filter-label"));
  expect(labels.props.items.map((i: any) => [i.label, i.hint])).toEqual([
    ["Any", undefined],
    ["Question", "1"],
    ["checkout", "1"],
    ["idea", "0"],
  ]);
  const [types] = opened(find(copy.render(), "filter-type"));
  expect(types.props.items.map((i: any) => [i.label, i.hint])).toEqual([
    ["Any", undefined],
    ["bug", "1"],
    ["chore", "0"],
  ]);
});

test("a menu with no value says why: the catalog could not be read", async () => {
  const bare = tickets.map((t) => ({ ...t, labels: [] }));
  const copy = await list({}, { tickets: bare, hide: ["bb_term--label", "bb_term--type"] });
  const [labels] = opened(find(copy.render(), "filter-label"));
  expect(labels.props.items.map((i: any) => [i.label, Boolean(i.disabled)])).toEqual([
    ["Any", false],
    ["No labels in this workspace", true],
  ]);
  reset();
  resetMod();
  const failing = await list(
    {},
    { tickets: bare, projects: [{ id: "p1", name: "acme-shop", key: "ACMESHOP" }] },
  );
  const [failed] = opened(find(failing.render(), "filter-label"));
  expect(failed.props.items[1]).toEqual({
    label: "Labels could not be loaded: The project's workspace could not be read.",
    disabled: true,
  });
});
