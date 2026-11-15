// features/needs: the rail button, the toast and the status item's count.
import { beforeEach, expect, test } from "bun:test";
import { activeSpace, backend, NOW } from "../fixtures/shop";
import { click, env, find, flush, load, mount, reset, runs, texts } from "../harness";

const ctx: any = await import("../../mods/bakers/core/session.js");
const tabs: any = await import("../../mods/bakers/core/tabs.js");
const { watchNeeds } = await import("../../mods/bakers/features/needs/toast.js");

beforeEach(() => {
  reset();
  ctx._resetForTests();
  tabs._resetForTests();
});

function storeWith(asking: string[]) {
  const rows = asking.map((id) => ({ id, why: "Asked a question" }));
  return {
    view: () => rows,
    cached: (id: string) => ({
      comments: [
        {
          type: "question",
          body: `Should ${id} redirect to the shop home, or show the empty-cart page with suggestions? The spec names both, and this line is long enough to be cut at 120 characters.`,
        },
      ],
    }),
  };
}

test("rail: 56 px column with the bakers button 36x36 labelled b 2", async () => {
  const Bakers = await load("bakers/main.js");
  env.shared["bakers.needs"] = { count: 2, ids: ["SHOP-41", "SHOP-56"], updated: NOW };
  activeSpace();
  const root = mount(Bakers, { view: "rail" }).render();
  expect(root.calls.w).toEqual([56]);
  const b = find(root, "rail-bakers");
  expect(texts(b)).toEqual(["b 2"]);
  expect(b.calls.size).toEqual([36]);
  expect(b.calls.text_size).toEqual([10]);
  expect(b.calls.border_color).toEqual(["accent"]);
  expect(b.calls.accessibility_label).toEqual(["bakers, 2 tickets need you"]);
  click(b);
  expect(env.shared["bakers.view"]).toBe("needs-me");
  expect(runs()).toContainEqual(["tab.select", { id: "t0" }]);
  click(find(root, "rail-spaces"));
  expect(runs()).toContainEqual(["layout.toggle", { id: "sidebar" }]);
});

test("watchNeeds posts one toast per newly asking ticket, never on start or twice", () => {
  let asked = watchNeeds(null, storeWith(["SHOP-41"]));
  expect(env.calls.filter((c) => c.fn === "notify")).toEqual([]);
  asked = watchNeeds(asked, storeWith(["SHOP-41", "SHOP-58"]));
  const posted = env.calls.filter((c) => c.fn === "notify");
  expect(posted.length).toBe(1);
  const n: any = posted[0].args[0];
  expect(n.title).toBe("SHOP-58 asks a question");
  expect(n.body.length).toBeLessThanOrEqual(120);
  expect(n.body.startsWith("Should SHOP-58 redirect")).toBe(true);
  expect(n.level).toBe("warning");
  expect(n.action).toEqual({ name: "bakers.open", args: { ticket: "SHOP-58" } });
  watchNeeds(asked, storeWith(["SHOP-41", "SHOP-58"]));
  expect(env.calls.filter((c) => c.fn === "notify").length).toBe(1);
});

test("the toast's bakers.open opens the ticket's tab and never moves focus", async () => {
  activeSpace();
  backend();
  env.shared["bakers.toast"] = "SHOP-41";
  env.commands.push("open");
  const Bakers = await load("bakers/main.js");
  mount(Bakers, { view: "status" });
  await flush();
  expect(runs()).toContainEqual([
    "tab.new",
    { mod: "bakers", props: { view: "ticket", ticket: "SHOP-41" }, name: "SHOP-41 working" },
  ]);
  expect(runs().some((r) => String(r[0]).startsWith("pane.focus"))).toBe(false);
});
