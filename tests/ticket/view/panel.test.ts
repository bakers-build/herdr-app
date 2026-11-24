import { beforeEach, expect, test } from "bun:test";
import { list, live, ticketPanel, resetMod } from "../../fixtures/shop";
import { bakersLayout } from "../../../scripts/layout.js";
import {
  click,
  closest,
  env,
  find,
  findText,
  fireTimers,
  flush,
  key,
  reset,
  runs,
  texts,
  walk,
} from "../../harness";

const main = await Bun.file(new URL("../../fixtures/herdr-main.json", import.meta.url)).json();
const { findNode }: any = await import("../../../mods/bakers/core/herdr.js");

beforeEach(() => {
  reset();
  resetMod();
});

test("header: identifier, state pill, Frozen, agent line, Edit, Actions and ...", async () => {
  env.terminals = [live("studio-mac/t7")];
  const root = (await ticketPanel()).render();
  const head = find(root, "doc-header");
  expect(texts(head)).toEqual([
    "SHOP-41",
    "working",
    "Frozen",
    "Claude Code needs you on studio-mac, 35m",
    "Edit",
    "Actions",
    "...",
  ]);
  const id = findText(head, "SHOP-41");
  expect(id.calls.font_family).toEqual(["JetBrains Mono"]);
  expect(id.calls.text_size).toEqual([12]);
  const pill = find(root, "state-pill");
  expect(pill.calls.h).toEqual([24]);
  expect(pill.calls.rounded).toEqual([12]);
  expect(pill.calls.text_size).toEqual([11]);
  expect(
    findText(head, "Claude Code needs you on studio-mac, 35m").calls.text_color ??
      closest(head, "Claude Code needs you on studio-mac, 35m", "text_color"),
  ).toBeDefined();
  expect(find(root, "agent-line").calls.text_color).toEqual(["blocked"]);
});

test("the agent line says this computer for a local run terminal", async () => {
  env.terminals = [live("t7")];
  const root = (await ticketPanel()).render();
  expect(texts(find(root, "agent-line"))).toEqual(["Claude Code needs you on this computer, 35m"]);
});

test("title at 18 px, 600", async () => {
  const root = (await ticketPanel()).render();
  const title = findText(root, "Checkout fails with an empty cart");
  expect(title.calls.text_size).toEqual([18]);
  expect(title.calls.font_semibold).toBeDefined();
});

test("the Needs-you card shows the question with its two answers", async () => {
  const root = (await ticketPanel()).render();
  const card = find(root, "needs-card");
  expect(texts(card)).toEqual([
    "NEEDS YOU",
    "Asked a question, 35m ago",
    "Should an empty cart redirect to the shop home, or show the empty-cart page with suggestions?",
    "Answer below",
    "Answer in the run",
    "A acts on this card",
  ]);
  expect(card.calls.border_color).toEqual(["accent"]);
  expect(card.calls.rounded).toEqual([8]);
  expect(find(card, "answer-below").calls.bg).toEqual(["solid"]);
});

test("no card when nothing needs you", async () => {
  const root = (await ticketPanel("SHOP-58")).render();
  expect(find(root, "needs-card")).toBeUndefined();
});

test("the description renders Markdown, then the edit hint", async () => {
  const root = (await ticketPanel()).render();
  const section = find(root, "description");
  expect(texts(section)[0]).toBe("DESCRIPTION");
  let md: any;
  walk(section, (n) => {
    if (n.kind === "markdown") md = n;
  });
  expect(md.arg.text).toContain("**Acceptance**");
  expect(findText(section, "Click or E to edit.").calls.text_size).toEqual([11]);
});

test("comments in order with author, type and age; plan, spec and summary fold to their first line", async () => {
  const root = (await ticketPanel()).render();
  const section = find(root, "comments");
  expect(texts(section)).toEqual([
    "COMMENTS 3, NEWEST LAST",
    "Claude Code",
    "qualification",
    "2h",
    "Reproduced: POST /checkout with the id of an empty cart returns 500 from CheckoutController::start.",
    "You",
    "comment",
    "1h",
    "Agreed, fix it in the checkout controller, not in the cart.",
    "Claude Code",
    "question",
    "35m",
    "Should an empty cart redirect to the shop home, or show the empty-cart page with suggestions?",
  ]);
  expect(find(section, "comment-c3").calls.border_color).toEqual(["accent"]);
});

test("a plan comment shows only its first line until clicked", async () => {
  const copy = await ticketPanel("SHOP-56");
  let section = find(copy.render(), "comments");
  expect(texts(section)).toContain("Plan");
  expect(texts(section)).not.toContain("Show the date.");
  click(find(section, "comment-p1"));
  section = find(copy.render(), "comments");
  let md: any;
  walk(section, (n) => {
    if (n.kind === "markdown") md = n;
  });
  expect(md.arg.text).toContain("Show the date.");
});

test("the document fills the panel, scrolling with 12 px padding", async () => {
  const root = (await ticketPanel()).render();
  const scroll = find(root, "panel-scroll");
  expect(scroll.calls.p).toEqual([12]);
  expect(scroll.calls.overflow_y_scrollbar).toBeDefined();
  expect(find(root, "doc")).toBeUndefined();
});

test("A on a plan card asks before moving to working; nothing is sent before", async () => {
  const copy = await ticketPanel("SHOP-56");
  env.calls.length = 0;
  key(copy.render(), "a");
  const spec: any = env.calls.find((c) => c.fn === "openOverlay")?.args[0];
  expect(spec).toMatchObject({
    props: { view: "dialog", form: "state", ticket: "SHOP-56", to: "working" },
    kind: "dialog",
  });
  expect(env.calls.some((c) => c.fn === "exec")).toBe(false);
});

test("A with a question puts the composer in answer mode and focuses it", async () => {
  const copy = await ticketPanel();
  key(copy.render(), "a");
  expect(copy.inner.doc.composer.mode).toBe("answer");
  expect(copy.inner.doc.composer.inputs.input("body").focused).toBe(true);
});

test("Answer in the run and G show and focus the run", async () => {
  env.terminals = [live("t7")];
  const copy = await ticketPanel();
  env.layout = bakersLayout(main);
  findNode(env.layout, "panel").hidden = false;
  findNode(env.layout, "panel-body").active = "ticket";
  env.shared["bakers.runHidden"] = true;
  env.calls.length = 0;
  click(find(copy.render(), "answer-in-run"));
  key(copy.render(), "g");
  expect(runs().filter(([c]) => c === "pane.focus")).toEqual([
    ["pane.focus", { terminal: "t7" }],
    ["pane.focus", { terminal: "t7" }],
  ]);
  expect(runs().filter(([c]) => c === "layout.set")).toHaveLength(1);
  expect(runs().filter(([c]) => c === "agent.focus")).toEqual([]);
  expect(env.shared["bakers.runHidden"]).toBe(false);
});

test("without a live run Answer in the run is disabled and says where the run is", async () => {
  const tickets = list.map((t) => (t.id === "u41" ? { ...t, claim_machine: "studio-mac" } : t));
  const away = find(
    (await ticketPanel("SHOP-41", { jsonapi: { tickets } })).render(),
    "answer-in-run",
  );
  expect(away.calls.disabled).toEqual([true]);
  expect(away.calls.tooltip).toEqual(["The run is on studio-mac, which Herdr is not connected to"]);
  expect(away.calls.on_click).toBeUndefined();
  reset();
  resetMod();
  env.terminals = [live("t7", "SHOP-41", { state: "exited" })];
  const ended = find((await ticketPanel()).render(), "answer-in-run");
  expect(ended.calls.disabled).toEqual([true]);
  expect(ended.calls.tooltip).toEqual(["No live run terminal"]);
});

test("the state pill opens the state menu", async () => {
  const copy = await ticketPanel();
  env.calls.length = 0;
  click(find(copy.render(), "state-pill"));
  const spec: any = env.calls.find((c) => c.fn === "openOverlay")?.args[0];
  expect(spec.props.view).toBe("menu");
  expect(spec.props.items.map((i: any) => i.label)).toEqual([
    "Qualification...",
    "Plan...",
    "Working",
    "Review...",
    "Done...",
    "Cancelled...",
  ]);
  expect(spec.props.items[2]).toMatchObject({ current: true, disabled: true });
});

test("R starts Move to... on the palette's conductors page", async () => {
  const copy = await ticketPanel();
  env.calls.length = 0;
  key(copy.render(), "r");
  expect(env.calls.find((c) => c.fn === "openOverlay")?.args[0]).toMatchObject({
    props: { view: "ticket.actions", ticket: "SHOP-41", page: "move" },
  });
  expect(env.calls.find((c) => c.fn === "openOverlay")?.args[0]).toEqual({
    mod: "bakers",
    props: { view: "ticket.actions", ticket: "SHOP-41", page: "move" },
    kind: "window",
    key: "bakers.actions",
    width: 480,
    height: 490,
  });
});

test("the Actions button opens the actions palette as cmd-K does", async () => {
  const copy = await ticketPanel();
  env.calls.length = 0;
  click(find(copy.render(), "actions"));
  expect(runs()).toEqual([["bakers.actions"]]);
});

test("the panel draws the whole ticket in order, the composer pinned below the scroll", async () => {
  const root = (await ticketPanel()).render();
  const order: string[] = [];
  const want = [
    "doc-header",
    "title",
    "needs-card",
    "agent-section",
    "description",
    "properties",
    "comments",
    "activity",
    "runs",
    "composer",
  ];
  walk(root, (n: any) => {
    const id = n?.calls?.id?.[0];
    if (want.includes(id) && !order.includes(id)) order.push(id);
  });
  expect(order).toEqual(want);
  expect(find(root, "composer").calls.flex_none).toBeDefined();
  expect(find(find(root, "panel-scroll"), "composer")).toBeUndefined();
});

test("a new selection loads that ticket and never takes the focus", async () => {
  const copy = await ticketPanel();
  expect(texts(find(copy.render(), "doc-header"))[0]).toBe("SHOP-41");
  env.shared["bakers.selected"] = "SHOP-56";
  fireTimers();
  await flush();
  copy.render();
  await flush();
  expect(texts(find(copy.render(), "doc-header"))[0]).toBe("SHOP-56");
  expect(env.calls.filter((c) => c.fn === "focus")).toEqual([]);
  expect(copy.inner.handle.focused).toBeFalsy();
});
