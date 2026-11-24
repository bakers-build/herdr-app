// The ticket card: four rows (id, state, type, age / title / why / labels, assignee, agent).
import { expect, test } from "bun:test";
import { click, find, texts } from "../harness";

const { ticketCard }: any = await import("../../mods/bakers/ui/components/card.js");

const vm = {
  key: "SHOP-41",
  selected: false,
  id: "SHOP-41",
  state: "plan",
  type: "feature",
  age: "2h",
  title: "Ticket list: filters and cards",
  why: "Plan ready for approval",
  labels: ["auto", "ui"],
  assignee: "pg",
  agent: { tone: "working", ring: false, text: "Claude Code working, MBP" },
};

test("a card shows its four rows in order", () => {
  expect(texts(ticketCard(vm, () => {}))).toEqual([
    "SHOP-41",
    "plan",
    "feature",
    "2h",
    "Ticket list: filters and cards",
    "Plan ready for approval",
    "auto",
    "ui",
    "pg",
    "Claude Code working, MBP",
  ]);
});

test("a card without a why, labels or assignee leaves those out", () => {
  const out = texts(ticketCard({ ...vm, why: null, labels: [], assignee: "" }, () => {}));
  expect(out).toEqual([
    "SHOP-41",
    "plan",
    "feature",
    "2h",
    "Ticket list: filters and cards",
    "Claude Code working, MBP",
  ]);
});

test("the title is clamped to two lines", () => {
  const title = (() => {
    let hit: any;
    const go = (n: any) => {
      if (n?.nodes) {
        if (n.nodes.includes(vm.title)) hit = n;
        n.nodes.forEach(go);
      }
    };
    go(ticketCard(vm, () => {}));
    return hit;
  })();
  expect(title.calls.max_h).toEqual([36]);
  expect(title.calls.overflow_hidden).toBeDefined();
});

test("a click selects; the selected card is outlined in accent, every card with the same border width", () => {
  let clicked = 0;
  const card = ticketCard({ ...vm, selected: true }, () => {
    clicked++;
  });
  expect(card.calls.id).toEqual(["row-SHOP-41"]);
  expect(card.calls.selected).toEqual([true]);
  expect(card.calls.border).toEqual([2]);
  click(find(card, "row-SHOP-41"));
  expect(clicked).toBe(1);
  const plain = ticketCard(vm, () => {});
  expect(plain.calls.border).toEqual([2]);
  expect(plain.calls.border_color).toEqual(["border"]);
  expect(card.calls.border_color).toEqual(["accent"]);
});

test("hover fills a plain card and keeps the selected card's fill", () => {
  const hoverBg = (card: any) => {
    const bg: string[] = [];
    const style: any = {
      bg: (c: string) => {
        bg.push(c);
        return style;
      },
    };
    card.calls.hover[0](style);
    return bg;
  };
  expect(hoverBg(ticketCard(vm, () => {}))).toEqual(["hover"]);
  expect(hoverBg(ticketCard({ ...vm, selected: true }, () => {}))).toEqual([]);
});
