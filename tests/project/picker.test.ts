// The project button and picker once a project is shared: each mod copy loads what it draws.
import { beforeEach, expect, test } from "bun:test";
import { activeSpace, backend, list as tickets, resetMod } from "../fixtures/shop";
import {
  click,
  closingCopy,
  cx,
  env,
  fetched,
  find,
  findText,
  fireTimers,
  key,
  flush,
  load,
  mount,
  reset,
  texts,
} from "../harness";

const actions: any = await import("../../mods/bakers/core/actions.js");
const herdr: any = await import("herdr");

beforeEach(() => {
  reset();
  resetMod();
});

const W0 = { id: "w0", name: "infra-ws" };
const W1 = { id: "w1", name: "acme" };
/** Two projects in two workspaces. */
const TWO = [
  { id: "p0", name: "infra", key: "INFRA", workspace: W0 },
  { id: "p1", name: "acme-shop", key: "ACMESHOP", workspace: W1 },
];
/** Two projects sharing one workspace. */
const ONE = [
  { id: "p0", name: "infra", key: "INFRA", workspace: W1 },
  { id: "p1", name: "acme-shop", key: "ACMESHOP", workspace: W1 },
];
/** The shop's tickets plus one of infra. */
const BOTH = [
  ...tickets,
  { id: "u70", identifier: "INFRA-1", title: "Rotate certs", state: "plan", project: "p0" },
];

/** A copy of the mod showing `view`, with `bakers.project` already shared as p1. */
async function copyOf(view: string, jsonapi: any = { projects: TWO, tickets: BOTH }) {
  activeSpace();
  backend({ jsonapi });
  env.shared["bakers.project"] = "p1";
  const Bakers = await load("bakers/main.js");
  const copy = mount(Bakers, { view });
  await flush();
  return copy;
}

test("with a shared project and two projects the button opens exactly the picker", async () => {
  const root = (await copyOf("ticket.list", { projects: ONE, tickets: BOTH })).render();
  const button = find(root, "project-button");
  expect(texts(button)).toEqual(["acme-shop"]);
  env.calls.length = 0;
  click(button);
  expect(env.calls.filter((c) => c.fn === "openOverlay").map((c) => c.args[0])).toEqual([
    { mod: "bakers", props: { view: "project.picker" }, kind: "popup", width: 220 },
  ]);
});

test("a fresh picker copy lists every project and marks the shared one", async () => {
  const root = (await copyOf("project.picker", { projects: ONE, tickets: BOTH })).render();
  expect(texts(find(root, "pick-p0"))).toEqual(["infra"]);
  expect(texts(find(root, "pick-p1"))).toEqual(["acme-shop", "current"]);
});

test("choosing a project in the picker shares its uuid", async () => {
  const copy = await copyOf("project.picker", { projects: ONE, tickets: BOTH });
  click(find(copy.render(), "pick-p0"));
  await flush();
  expect(env.shared["bakers.project"]).toBe("p0");
});

test("the list follows a project another copy shared, with that project's rows", async () => {
  const copy = await copyOf("ticket.list", { projects: ONE, tickets: BOTH });
  expect(find(copy.render(), "row-SHOP-41")).toBeDefined();
  // The picker is another copy: only the shared value changes, this copy still holds p1.
  env.shared["bakers.project"] = "p0";
  fireTimers(300);
  await flush();
  const root = copy.render();
  expect(texts(find(root, "project-button"))[0]).toBe("infra");
  expect(find(root, "row-INFRA-1")).toBeDefined();
  expect(find(root, "row-SHOP-41")).toBeUndefined();
  expect(fetched().some((u) => u.includes("project_id.id") && u.includes("p0"))).toBe(true);
});

// HERDRAPP-21: the project picker takes the keyboard on its first layout, so Esc closes it.
test("the project picker takes the keyboard on its first layout; Esc closes it", async () => {
  const copy = await copyOf("project.picker");
  copy.inner.handle.focused = false;
  find(copy.render(), "picker").calls.on_size_change[0]({ width: 220, height: 60 }, cx());
  expect(copy.inner.handle.focused).toBe(true);
  env.calls.length = 0;
  key(copy.render(), "escape");
  expect(env.calls.some((c) => c.fn === "closeOverlay")).toBe(true);
});

test("with two workspaces the picker draws the switch and only the shown workspace's projects", async () => {
  const root = (await copyOf("project.picker")).render();
  expect(find(root, "workspace-switch")).toBeDefined();
  expect(texts(find(root, "ws-w1"))).toEqual(["acme"]);
  expect(find(root, "pick-p1")).toBeDefined();
  expect(find(root, "pick-p0")).toBeUndefined();
});

test("clicking a workspace shows its projects and keeps the project", async () => {
  const copy = await copyOf("project.picker");
  env.calls.length = 0;
  click(find(copy.render(), "ws-w0"));
  expect(env.shared["bakers.workspace"]).toBe("w0");
  const root = copy.render();
  expect(find(root, "pick-p0")).toBeDefined();
  expect(find(root, "pick-p1")).toBeUndefined();
  expect(env.shared["bakers.project"]).toBe("p1");
  expect(env.calls.some((c) => c.fn === "closeOverlay")).toBe(false);
});

/** Two projects in the shown workspace w1, so the selection can move down. */
const THREE = [...TWO, { id: "p2", name: "acme-docs", key: "ACMEDOCS", workspace: W1 }];
const picked = () => copyOf("project.picker", { projects: THREE, tickets: BOTH });

test("Right and Left switch the workspace", async () => {
  const copy = await picked();
  key(copy.render(), "right");
  expect(env.shared["bakers.workspace"]).toBe("w0");
  key(copy.render(), "left");
  expect(env.shared["bakers.workspace"]).toBe("w1");
});

test("Right and Left reset the row selection", async () => {
  const copy = await picked();
  key(copy.render(), "down");
  expect(copy.inner.at).toBe(1);
  key(copy.render(), "right"); // w1 -> w0
  expect(copy.inner.at).toBe(0);
  key(copy.render(), "left"); // w0 -> w1, which has two rows
  key(copy.render(), "down");
  expect(copy.inner.at).toBe(1);
  key(copy.render(), "left"); // w1 -> w0
  expect(copy.inner.at).toBe(0);
});

test("clicking a workspace segment resets the row selection", async () => {
  const copy = await picked();
  key(copy.render(), "down");
  expect(copy.inner.at).toBe(1);
  click(find(copy.render(), "ws-w0"));
  expect(copy.inner.at).toBe(0);
});

test("a fresh picker copy shows the shared workspace", async () => {
  activeSpace();
  backend({ jsonapi: { projects: TWO, tickets: BOTH } });
  env.shared["bakers.project"] = "p1";
  env.shared["bakers.workspace"] = "w0";
  const Bakers = await load("bakers/main.js");
  const copy = mount(Bakers, { view: "project.picker" });
  await flush();
  const root = copy.render();
  expect(find(root, "pick-p0")).toBeDefined();
  expect(find(root, "pick-p1")).toBeUndefined();
});

test("choosing a project of another workspace shares that workspace", async () => {
  const copy = await copyOf("project.picker");
  expect(env.shared["bakers.workspace"]).toBeUndefined();
  await actions.perform(["project.choose", "p0", "infra"]);
  expect(env.shared["bakers.project"]).toBe("p0");
  expect(env.shared["bakers.workspace"]).toBe("w0");
  expect(copy.inner).toBeDefined();
});

test("with one workspace there is no switch and the button shows the project alone", async () => {
  const picker = await copyOf("project.picker", { projects: ONE, tickets: BOTH });
  const root = picker.render();
  expect(find(root, "workspace-switch")).toBeUndefined();
  const shared = env.shared["bakers.workspace"];
  const at = picker.inner.at;
  key(root, "right");
  expect(env.shared["bakers.workspace"]).toEqual(shared);
  expect(picker.inner.at).toBe(at);
  expect(find(picker.render(), "pick-p0")).toBeDefined();
  expect(find(picker.render(), "pick-p1")).toBeDefined();
  const button = find(
    (await copyOf("ticket.list", { projects: ONE, tickets: BOTH })).render(),
    "project-button",
  );
  expect(texts(button)).toEqual(["acme-shop"]);
});

test("with two workspaces the button names the workspace", async () => {
  const button = find((await copyOf("ticket.list")).render(), "project-button");
  expect(texts(button)).toEqual(["acme / ", "acme-shop"]);
});

// HERDRAPP-28: the picker is a popup copy; Herdr ends its tasks once it closes, so it only
// chooses and the long-lived list loads the new project.
const { default: TicketStatus } = await import("../../mods/bakers/ticket/view/status.js");

/** A list copy on p1 and a picker copy, both of one workspace. */
async function listAndPicker() {
  const list = await copyOf("ticket.list", { projects: ONE, tickets: BOTH });
  expect(find(list.render(), "row-SHOP-41")).toBeDefined();
  const Bakers = await load("bakers/main.js");
  const picker = mount(Bakers, { view: "project.picker" });
  await flush();
  return { list, picker };
}

/** Holds every request for p0 until release() is called. */
function holdP0() {
  const real = env.fetch;
  const held: (() => void)[] = [];
  env.fetch = (url, opts) =>
    decodeURIComponent(String(url)).includes("p0")
      ? new Promise((ok, no) => held.push(() => real(url, opts).then(ok, no)))
      : real(url, opts);
  return () => {
    env.fetch = real;
    for (const go of held.splice(0)) go();
  };
}

test("T1: after a picker switch the list shows the new project's tickets, no R needed", async () => {
  const { list, picker } = await listAndPicker();
  const restore = closingCopy();
  click(find(picker.render(), "pick-p0"));
  await flush();
  restore();
  expect(env.shared["bakers.project"]).toBe("p0");
  fireTimers(300); // the list's poll
  await flush();
  const root = list.render();
  expect(find(root, "row-INFRA-1")).toBeDefined();
  expect(find(root, "row-SHOP-41")).toBeUndefined();
});

test("T2: R loads the shown project although a closed copy's load never answers", async () => {
  const { list } = await listAndPicker();
  const restore = closingCopy();
  await actions.perform(["project.choose", "p0", "infra"]);
  // A popup's refresh (the actions palette's) that its closing strands.
  void actions.perform(["ticket.refresh"]);
  herdr.closeOverlay();
  await flush();
  restore();
  env.calls.length = 0;
  key(list.render(), "r");
  await flush();
  const root = list.render();
  expect(find(root, "row-INFRA-1")).toBeDefined();
  expect(fetched().some((u) => u.includes("project_id.id") && u.includes("p0"))).toBe(true);
});

test("T5: while the new project loads the list says so, not that there are no tickets", async () => {
  const { list, picker } = await listAndPicker();
  const release = holdP0();
  click(find(picker.render(), "pick-p0"));
  await flush();
  fireTimers(300);
  await flush();
  const root = list.render();
  expect(findText(root, "Loading infra…")).toBeDefined();
  expect(findText(root, "No other open tickets.")).toBeUndefined();
  expect(find(root, "row-SHOP-41")).toBeUndefined();
  expect(
    new TicketStatus()
      .render()
      .flatMap((d: any) => texts(d))
      .some((t) => t.startsWith("updated")),
  ).toBe(false);
  release();
  await flush();
  expect(find(list.render(), "row-INFRA-1")).toBeDefined();
});

test("T6: after the switch the status names the new project and its load time", async () => {
  const { list, picker } = await listAndPicker();
  const restore = closingCopy();
  click(find(picker.render(), "pick-p0"));
  await flush();
  restore();
  const switched = Date.now();
  fireTimers(300);
  await flush();
  list.render();
  const status = new TicketStatus().render().flatMap((d: any) => texts(d));
  expect(status[0]).toBe("infra");
  expect(status.at(-1)).toMatch(/^updated .* ago$/);
  // The time is the new load's, not the previous project's.
  const { getStore } = await import("../../mods/bakers/ticket/store.js");
  expect(getStore().updated).toBeGreaterThanOrEqual(switched);
});

test("T7: a ticket selected in the previous project is dropped; the new list selects its first row", async () => {
  const { list, picker } = await listAndPicker();
  env.shared["bakers.selected"] = "SHOP-41";
  click(find(picker.render(), "pick-p0"));
  await flush();
  fireTimers(300);
  await flush();
  list.render();
  expect(env.shared["bakers.selected"]).toBe("INFRA-1");
});

test("T8: R on the current project reads its list again", async () => {
  const { list } = await listAndPicker();
  env.calls.length = 0;
  key(list.render(), "r");
  await flush();
  expect(fetched().some((u) => u.includes("project_id.id") && u.includes("p1"))).toBe(true);
});

test("T4: a load still waiting for the previous project does not hold up the new one", async () => {
  activeSpace();
  backend({ jsonapi: { projects: ONE, tickets: BOTH } });
  env.shared["bakers.project"] = "p1";
  const real = env.fetch;
  // The first list read of p1 never answers.
  env.fetch = (url, opts) => {
    const u = decodeURIComponent(String(url));
    return u.includes("project_id.id") && u.includes("p1")
      ? new Promise(() => {})
      : real(url, opts);
  };
  const Bakers = await load("bakers/main.js");
  const list = mount(Bakers, { view: "ticket.list" });
  await flush();
  expect(find(list.render(), "row-SHOP-41")).toBeUndefined();
  await actions.perform(["project.choose", "p0", "infra"]);
  fireTimers(300);
  await flush();
  expect(find(list.render(), "row-INFRA-1")).toBeDefined();
});

test("a load of the current project older than PROJECT_TIMEOUT_MS is replaced by a new one", async () => {
  activeSpace();
  backend({ jsonapi: { projects: ONE, tickets: BOTH } });
  env.shared["bakers.project"] = "p1";
  const real = env.fetch;
  let stranded = true; // the first load's list read never answers
  env.fetch = (url, opts) => {
    const u = decodeURIComponent(String(url));
    return stranded && u.includes("project_id.id") ? new Promise(() => {}) : real(url, opts);
  };
  const Bakers = await load("bakers/main.js");
  mount(Bakers, { view: "ticket.list" });
  await flush();
  const store: any = await import("../../mods/bakers/ticket/store.js");
  const { PROJECT_TIMEOUT_MS } = await import("../../mods/bakers/project/state.js");
  const later = Date.now() + PROJECT_TIMEOUT_MS + 1000;
  const now = Date.now;
  Date.now = () => later;
  try {
    stranded = false;
    const answer = await Promise.race([
      store.ready().then((p: any) => p?.uuid),
      new Promise((r) => setTimeout(() => r("held"), 50)),
    ]);
    expect(answer).toBe("p1");
    expect(store.getStore().records().length).toBeGreaterThan(0);
  } finally {
    Date.now = now;
  }
});

// Review fixes: a stranded load of the current project heals without R; the switch publishes
// the needs count; a switch back to a project the list followed before still loads.
test("a closed copy's stranded load of the new project heals by the list's poll, no R", async () => {
  const { list } = await listAndPicker();
  const restore = closingCopy();
  await actions.perform(["project.choose", "p0", "infra"]);
  void actions.perform(["ticket.refresh"]);
  herdr.closeOverlay();
  await flush();
  restore();
  const { PROJECT_TIMEOUT_MS } = await import("../../mods/bakers/project/state.js");
  const later = Date.now() + PROJECT_TIMEOUT_MS + 1000;
  const now = Date.now;
  Date.now = () => later;
  try {
    fireTimers(300);
    await flush();
    expect(find(list.render(), "row-INFRA-1")).toBeDefined();
  } finally {
    Date.now = now;
  }
});

test("after the list follows a switch, the needs count is the new project's", async () => {
  const { list, picker } = await listAndPicker();
  env.shared["bakers.needs"] = undefined;
  click(find(picker.render(), "pick-p0"));
  await flush();
  const switched = Date.now();
  fireTimers(300);
  await flush();
  list.render();
  expect((env.shared["bakers.needs"] as any)?.updated).toBeGreaterThanOrEqual(switched);
});

test("a switch back to a project the list followed before loads it", async () => {
  const { list, picker } = await listAndPicker();
  const store: any = await import("../../mods/bakers/ticket/store.js");
  click(find(picker.render(), "pick-p0"));
  await flush();
  fireTimers(300);
  await flush();
  expect(find(list.render(), "row-INFRA-1")).toBeDefined();
  // Another copy loads p1 before the list polls.
  await actions.perform(["project.choose", "p1", "acme-shop"]);
  await store.ready();
  await actions.perform(["project.choose", "p0", "infra"]);
  fireTimers(300);
  await flush();
  expect(find(list.render(), "row-INFRA-1")).toBeDefined();
});
