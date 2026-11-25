import { beforeEach, expect, test } from "bun:test";
import { activeSpace, backend, list as tickets, resetMod } from "../../fixtures/shop";
import { cx, env, fetched, find, flush, key, load, mount, reset, tools } from "../../harness";

const writes = () => tools().filter(([t]) => !/_(read|list|search)$/.test(t));
const writeTools = {
  bakers_comment_publish: { id: "c9" },
  bakers_ticket_transition: {},
  bakers_ticket_update: {},
  bakers_run_cancel: {},
  bakers_ticket_create: { identifier: "SHOP-70", state: "qualification" },
};

beforeEach(() => {
  reset();
  resetMod();
});

async function open(props: any, extra: Record<string, unknown> = {}) {
  activeSpace();
  backend({ ...writeTools, ...extra });
  const Bakers = await load("bakers/main.js");
  const copy = mount(Bakers, { overlay: "overlay-7", ...props });
  await flush();
  env.calls.length = 0;
  return copy;
}

test("the label picker adds a typed label at once", async () => {
  const copy = await open({ view: "ticket.label-picker", ticket: "SHOP-41" });
  copy.inner.input.type("ui");
  copy.inner.input.submit();
  await flush();
  expect(writes()).toEqual([["bakers_ticket_update", { ticket: "SHOP-41", labels_add: ["ui"] }]]);
});

// HERDRAPP-21: the filter takes the keyboard on the first layout; Esc there closes, adding nothing.
test("the label picker focuses its filter on its first layout; Esc closes and adds nothing", async () => {
  const copy = await open({ view: "ticket.label-picker", ticket: "SHOP-41" });
  copy.inner.input.focused = false;
  copy.inner.handle.focused = false;
  find(copy.render(), "picker").calls.on_size_change[0]({ width: 220, height: 80 }, cx());
  expect(copy.inner.input.focused).toBe(true);
  expect(copy.inner.typing).toBe(true);
  copy.inner.input.type("ui");
  key(copy.render(), "escape");
  await flush();
  expect(env.calls.some((c) => c.fn === "closeOverlay")).toBe(true);
  expect(writes()).toEqual([]);
});

// HERDRAPP-23: the picker offers the workspace's labels, minus the ticket's own, by typed text.
const labelsOf = (copy: any) => copy.inner.items().map((i: any) => i.label);

test("the label picker offers the catalog's labels the ticket lacks, filtered by the text", async () => {
  const copy = await open(
    { view: "ticket.label-picker", ticket: "SHOP-41" },
    { jsonapi: { catalog: { labels: ["auto", "idea", "runtime:system"] } } },
  );
  // SHOP-41 carries Question and checkout
  expect(labelsOf(copy)).toEqual(["auto", "idea", "runtime:system"]);
  copy.inner.input.type("I");
  expect(labelsOf(copy)).toEqual(["idea", "runtime:system"]);
  copy.inner.items()[0].choose(cx());
  await flush();
  expect(writes()).toEqual([["bakers_ticket_update", { ticket: "SHOP-41", labels_add: ["idea"] }]]);
});

test("without a catalog a typed name still adds", async () => {
  const copy = await open(
    { view: "ticket.label-picker", ticket: "SHOP-41" },
    { jsonapi: { projects: [{ id: "p1", name: "acme-shop", key: "ACMESHOP" }] } },
  );
  copy.inner.input.type("idea");
  copy.inner.input.submit();
  await flush();
  expect(writes()).toEqual([["bakers_ticket_update", { ticket: "SHOP-41", labels_add: ["idea"] }]]);
});

test("a label added in the picker re-reads the tickets, so the list and the panel follow", async () => {
  const copy = await open(
    { view: "ticket.label-picker", ticket: "SHOP-41" },
    { jsonapi: { catalog: { labels: ["auto"] } } },
  );
  const updated = () => (env.shared["bakers.needs"] as { updated?: number } | undefined)?.updated;
  const before = updated() ?? null;
  env.calls.length = 0;
  copy.inner.items()[0].choose(cx());
  await flush();
  expect(writes()).toEqual([["bakers_ticket_update", { ticket: "SHOP-41", labels_add: ["auto"] }]]);
  expect(fetched().some((u) => u.includes("/bb_ticket/bb_ticket?"))).toBe(true);
  // the panel reloads when the shared refresh time changes (ticket/view/context.js check)
  expect(updated()).not.toBe(before);
});

test("when the ticket has every label of the workspace the picker says so", async () => {
  const copy = await open({ view: "ticket.label-picker", ticket: "SHOP-41" });
  expect(copy.inner.items()).toEqual([
    { key: "none", label: "The ticket has every label", disabled: true },
  ]);
});

// Review R3: a failed catalog read does not hide that the ticket already has every loaded label.
test("without a catalog, a ticket with every loaded label says so, and why the catalog is missing", async () => {
  const copy = await open(
    { view: "ticket.label-picker", ticket: "SHOP-41" },
    { jsonapi: { projects: [{ id: "p1", name: "acme-shop", key: "ACMESHOP" }] } },
  );
  // SHOP-41 carries Question and checkout, the only labels on the loaded tickets
  expect(labelsOf(copy)).toEqual([
    "The ticket has every label",
    "Labels could not be loaded: The project's workspace could not be read.",
  ]);
});

// Review R4: the labels sort without regard to case, and a long catalog scrolls.
test("the picker sorts labels without regard to case", async () => {
  const copy = await open(
    { view: "ticket.label-picker", ticket: "SHOP-41" },
    { jsonapi: { catalog: { labels: ["idea", "Zeta", "auto", "Beta"] } } },
  );
  expect(labelsOf(copy)).toEqual(["auto", "Beta", "idea", "Zeta"]);
});

test("the picker's rows scroll inside a bounded height", async () => {
  const copy = await open(
    { view: "ticket.label-picker", ticket: "SHOP-41" },
    { jsonapi: { catalog: { labels: ["auto"] } } },
  );
  const rows = find(copy.render(), "rows");
  expect(rows.calls.max_h).toBeDefined();
  expect(rows.calls.overflow_y_scrollbar).toBeDefined();
});

test("without a catalog and with no label on any loaded ticket, the picker shows only why", async () => {
  const bare = tickets.map((t) => ({ ...t, labels: [] }));
  const copy = await open(
    { view: "ticket.label-picker", ticket: "SHOP-41" },
    { jsonapi: { tickets: bare, projects: [{ id: "p1", name: "acme-shop", key: "ACMESHOP" }] } },
  );
  expect(labelsOf(copy)).toEqual([
    "Labels could not be loaded: The project's workspace could not be read.",
  ]);
});
