import { beforeEach, expect, test } from "bun:test";
import { bakersLayout } from "../../../scripts/layout.js";
import { activeSpace, backend, list, live, read, resetMod } from "../../fixtures/shop";
import {
  click,
  env,
  find,
  findText,
  fireTimers,
  flush,
  load,
  mount,
  reset,
  runs,
  texts,
  tools,
  walk,
} from "../../harness";

const actions: any = await import("../../../mods/bakers/core/actions.js");
const terminal: any = await import("../../../mods/bakers/ticket/terminal.js");
const { findNode }: any = await import("../../../mods/bakers/core/herdr.js");
const main = await Bun.file(new URL("../../fixtures/herdr-main.json", import.meta.url)).json();

const writes = () => tools().filter(([t]) => !/_(read|list|search)$/.test(t));

beforeEach(() => {
  reset();
  resetMod();
});

/** The panel on the selected ticket, SHOP-41 unless a test selected another; none when select is false. */
async function panel(select = true, extra: Record<string, unknown> = {}) {
  activeSpace();
  backend({ bakers_ticket_update: {}, bakers_ticket_classify: {}, ...extra });
  if (select) env.shared["bakers.selected"] ??= "SHOP-41";
  env.focused = { space: "s1", tab: "t0", pane: "p1" };
  const Bakers = await load("bakers/main.js");
  const copy = mount(Bakers, { view: "ticket.context" });
  await flush();
  copy.render();
  await flush();
  return copy;
}

test("it follows the selected ticket", async () => {
  const root = (await panel()).render();
  expect(texts(find(root, "doc-header")).slice(0, 3)).toEqual(["SHOP-41", "working", "Frozen"]);
});

test("a leftover ticket tab in front does not move the panel off the selection", async () => {
  env.shared["bakers.selected"] = "SHOP-56";
  const copy = await panel();
  env.spaces[0].tabs.push({ id: "t5", name: "SHOP-41 working", index: 2, active: true });
  env.focused = { space: "s1", tab: "t5", pane: "p1" };
  expect(texts(find(copy.render(), "doc-header")).slice(0, 2)).toEqual(["SHOP-56", "plan"]);
});

test("nothing selected says so", async () => {
  const copy = await panel(false);
  expect(texts(copy.render())).toEqual(["No ticket selected"]);
});

/** Herdr's layout with the panel shown on its ticket child. */
function onTicket() {
  env.layout = bakersLayout(main);
  findNode(env.layout, "panel").hidden = false;
  findNode(env.layout, "panel-body").active = "ticket";
}

test("Agent and conductor: the line, three actions and the key hint", async () => {
  env.terminals = [live("t7")];
  const root = (await panel()).render();
  const s = find(root, "agent-section");
  expect(texts(s)).toEqual([
    "AGENT AND CONDUCTOR",
    "Claude Code needs you",
    "on this computer, 35m",
    "Show agent",
    "Move to...",
    "Cancel run...",
    "R moves, G shows the agent.",
  ]);
  for (const id of ["show-agent", "move-to", "cancel-run"]) {
    expect(find(s, id).calls.h).toEqual([24]);
    expect(find(s, id).calls.text_size).toEqual([11]);
  }
  onTicket();
  env.calls.length = 0;
  click(find(s, "show-agent"));
  expect(runs().map(([c]) => c)).toEqual([
    "layout.select",
    "layout.show",
    "layout.set",
    "pane.focus",
  ]);
  expect(runs()[3]).toEqual(["pane.focus", { terminal: "t7" }]);
});

test("Show agent never opens a tab; it shows the panel with the run and focuses it", async () => {
  env.shared["bakers.selected"] = "SHOP-56";
  env.terminals = [live("t9", "SHOP-56")];
  const copy = await panel();
  env.layout = bakersLayout(main);
  env.calls.length = 0;
  click(find(copy.render(), "show-agent"));
  expect(runs().some(([c]) => c === "tab.new")).toBe(false);
  const set: any = runs().find(([c]) => c === "layout.set")?.[1];
  expect(findNode(set.layout, "panel").hidden).toBe(false);
  expect(findNode(set.layout, "panel-body").active).toBe("ticket");
  expect(runs().filter(([c]) => c === "pane.focus")).toEqual([["pane.focus", { terminal: "t9" }]]);
  expect(env.shared["bakers.runFocus"]).toBe(null);
});

test("Show agent after Hide shows the run again", async () => {
  env.terminals = [live("t7")];
  const copy = await panel();
  onTicket();
  terminal.syncRun();
  env.layout = (runs()[0][1] as any).layout;
  findNode(env.layout, "run").hidden = true;
  env.shared["bakers.runHidden"] = true;
  env.calls.length = 0;
  click(find(copy.render(), "show-agent"));
  expect(runs().slice(2)).toEqual([
    ["layout.show", { id: "run" }],
    ["pane.focus", { terminal: "t7" }],
  ]);
});

test("without a live run Show agent is disabled and says where the run is", async () => {
  const tickets = list.map((t) => (t.id === "u41" ? { ...t, claim_machine: "studio-mac" } : t));
  const away = find((await panel(true, { jsonapi: { tickets } })).render(), "show-agent");
  expect(away.calls.disabled).toEqual([true]);
  expect(away.calls.tooltip).toEqual(["The run is on studio-mac, which Herdr is not connected to"]);
  reset();
  resetMod();
  env.terminals = [live("t7", "SHOP-41", { state: "exited" })];
  const ended = find((await panel()).render(), "show-agent");
  expect(ended.calls.disabled).toEqual([true]);
  expect(ended.calls.tooltip).toEqual(["No live run terminal"]);
});

test("Properties as drawn; assignee and reviewers come from JSON:API", async () => {
  const root = (await panel()).render();
  expect(texts(find(root, "properties"))).toEqual([
    "PROPERTIES",
    "Type",
    "bug",
    "Recipe",
    "matt",
    "Labels",
    "Question",
    "×",
    "checkout",
    "×",
    "+",
    "Frozen",
    "Yes, 35m",
    "Unfreeze...",
    "Assignee",
    "-",
    "Reviewers",
    "-",
    "Branch",
    "shop-41-checkout-empty-cart",
    "Parent",
    "-",
    "Links",
    "MR !91",
  ]);
  expect(findText(root, "shop-41-checkout-empty-cart").calls.font_family).toEqual([
    "JetBrains Mono",
  ]);
});

test("Type and Recipe save at once through ticket_classify", async () => {
  const copy = await panel();
  env.calls.length = 0;
  click(find(copy.render(), "prop-type"));
  const spec: any = env.calls.find((c) => c.fn === "openOverlay")?.args[0];
  expect(spec.props).toMatchObject({ view: "menu" });
  const feature = spec.props.items.find((i: any) => i.label === "feature");
  env.calls.length = 0;
  await actions.perform(feature.action);
  expect(writes()).toEqual([["bakers_ticket_classify", { ticket: "SHOP-41", type: "feature" }]]);
});

// Developer live check: the server refuses label changes on a closed ticket, so its panel offers none.
test("a closed ticket's labels have no × and no +", async () => {
  const tickets = list.map((t) =>
    t.identifier === "SHOP-41" ? { ...t, state: "done", closed: true } : t,
  );
  const copy = await panel(true, { jsonapi: { tickets } });
  const root = copy.render();
  expect(findText(root, "Question")).toBeDefined();
  expect(find(root, "label-add")).toBeUndefined();
  expect(find(root, "label-x-Question")).toBeUndefined();
});

test("a label's × removes it at once; + opens the label picker", async () => {
  const copy = await panel();
  env.calls.length = 0;
  click(find(copy.render(), "label-x-checkout"));
  await flush();
  expect(writes()).toEqual([
    ["bakers_ticket_update", { ticket: "SHOP-41", labels_remove: ["checkout"] }],
  ]);
  env.calls.length = 0;
  click(find(copy.render(), "label-add"));
  expect(env.calls.find((c) => c.fn === "openOverlay")?.args[0]).toMatchObject({
    props: { view: "ticket.label-picker", ticket: "SHOP-41" },
  });
  expect(env.calls.find((c) => c.fn === "openOverlay")?.args[0]).toEqual({
    mod: "bakers",
    props: { view: "ticket.label-picker", ticket: "SHOP-41" },
    kind: "popup",
    width: 220,
  });
  env.calls.length = 0;
  await actions.perform(["ticket.labels", "SHOP-41", { labels_add: ["ui"] }]);
  expect(writes()).toEqual([["bakers_ticket_update", { ticket: "SHOP-41", labels_add: ["ui"] }]]);
});

test("Unfreeze..., Move to... and Cancel run... ask first and send nothing", async () => {
  const copy = await panel();
  env.calls.length = 0;
  click(find(copy.render(), "unfreeze"));
  click(find(copy.render(), "cancel-run"));
  click(find(copy.render(), "move-to"));
  const opened = env.calls.filter((c) => c.fn === "openOverlay").map((c: any) => c.args[0].props);
  expect(opened[0]).toMatchObject({ view: "dialog", form: "unfreeze", ticket: "SHOP-41" });
  expect(opened[1]).toMatchObject({ view: "dialog", form: "cancel", ticket: "SHOP-41" });
  expect(opened[2]).toMatchObject({ view: "ticket.actions", ticket: "SHOP-41", page: "move" });
  expect(env.calls.filter((c) => c.fn === "openOverlay")[2].args[0]).toEqual({
    mod: "bakers",
    props: { view: "ticket.actions", ticket: "SHOP-41", page: "move" },
    kind: "window",
    key: "bakers.actions",
    width: 480,
    height: 490,
  });
  expect(writes()).toEqual([]);
});

test("a ticket without activity shows only the heading", async () => {
  const root = (await panel()).render();
  expect(texts(find(root, "activity"))).toEqual(["ACTIVITY"]);
});

test("Activity lists bb_activity entries, newest first, with their ages", async () => {
  const now = Date.now();
  const root = (
    await panel(true, {
      jsonapi: {
        activity: [
          { id: "a1", kind: "created", created: new Date(now - 180 * 60000).toISOString() },
          {
            id: "a2",
            kind: "status_changed",
            previous_state: "qualification",
            new_state: "working",
            created: new Date(now - 60 * 60000).toISOString(),
          },
        ],
      },
    })
  ).render();
  expect(texts(find(root, "activity"))).toEqual([
    "ACTIVITY",
    "qualification to working",
    "1h",
    "Created",
    "3h",
  ]);
});

test("Runs are collapsed and expand on click", async () => {
  const copy = await panel();
  expect(texts(find(copy.render(), "runs"))).toEqual(["Runs 1"]);
  click(find(copy.render(), "runs-toggle"));
  expect(texts(find(copy.render(), "runs"))).toEqual(["Runs 1", "running", "Claude Code", "1h"]);
});

test("the panel holds the document: title, description and comments", async () => {
  const t = texts((await panel()).render());
  expect(t).toContain("Checkout fails with an empty cart");
  expect(t).toContain("DESCRIPTION");
  expect(t.some((x) => x.startsWith("COMMENTS"))).toBe(true);
});

const markdownOf = (node: any) => {
  let text: string | undefined;
  walk(node, (n: any) => {
    if (text === undefined && n.kind === "markdown") text = n.arg?.text;
  });
  return text;
};

test("Description, Acceptance and Summary sit between Properties and the comments, each with Edit...", async () => {
  const root = (await panel()).render();
  const body = find(root, "panel-content");
  const ids = body.nodes.map((n: any) => n.calls.id?.[0]);
  const at = (id: string) => ids.indexOf(id);
  expect(at("properties")).toBeGreaterThan(-1);
  expect([
    at("section-description"),
    at("section-acceptance"),
    at("section-summary"),
    at("comments"),
  ]).toEqual([1, 2, 3, 4].map((i) => at("properties") + i));
  expect(texts(find(root, "section-acceptance"))).toEqual(["ACCEPTANCE", "Edit...", "None yet."]);
  expect(texts(find(root, "section-summary"))).toEqual(["SUMMARY", "Edit...", "None yet."]);
  expect(texts(find(root, "section-description")).slice(0, 2)).toEqual(["DESCRIPTION", "Edit..."]);
  expect(markdownOf(find(root, "section-description"))).toBe(read.u41.description);
  const edit = find(root, "edit-acceptance");
  expect(edit.calls.h).toEqual([20]);
  expect(edit.calls.text_size).toEqual([11]);
});

test("Edit... opens the section popup 640 wide and writes nothing", async () => {
  const copy = await panel();
  env.calls.length = 0;
  click(find(copy.render(), "edit-acceptance"));
  const spec: any = env.calls.find((c) => c.fn === "openOverlay")?.args[0];
  expect(spec).toMatchObject({
    props: { view: "dialog", form: "section", ticket: "SHOP-41", section: "acceptance" },
    kind: "dialog",
    width: 640,
  });
  expect(writes()).toEqual([]);
});

test("AC4: after a save and the refresh, the panel shows the newest acceptance", async () => {
  const copy = await panel();
  expect(texts(find(copy.render(), "section-acceptance"))).toContain("None yet.");
  const before = read.u41.comments;
  read.u41.comments = [
    ...before,
    {
      id: "a9",
      type: "acceptance",
      author: "pg",
      created: new Date().toISOString(),
      body: "Saved.",
    },
  ];
  try {
    env.shared["bakers.needs"] = { count: 0, ids: [], updated: Date.now() };
    fireTimers();
    await flush();
    expect(markdownOf(find(copy.render(), "section-acceptance"))).toBe("Saved.");
  } finally {
    read.u41.comments = before;
  }
});

test("a click on a link opens it with the system's opener", async () => {
  const copy = await panel();
  env.calls.length = 0;
  click(find(copy.render(), "link-0"));
  expect(env.calls.find((c) => c.fn === "exec")?.args).toEqual([
    "open",
    ["https://git.example/acme/shop/merge_requests/91"],
  ]);
});
