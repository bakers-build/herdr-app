import { expect, test } from "bun:test";
import "../harness";

const herdr: any = await import("../../mods/bakers/core/herdr.js");

const tree = () => ({
  id: "root",
  children: [
    { id: "body", children: [{ id: "main" }, { id: "side", size: { px: 300 } }] },
    { id: "status" },
  ],
});

test("withNode replaces a node in place and keeps the rest", () => {
  const out = herdr.withNode(tree(), { id: "side", hidden: true }, "body", "main");
  expect(out).toEqual({
    id: "root",
    children: [
      { id: "body", children: [{ id: "main" }, { id: "side", hidden: true }] },
      { id: "status" },
    ],
  });
});

test("withNode inserts after a sibling", () => {
  const out = herdr.withNode(tree(), { id: "run" }, "body", "main");
  expect(out.children[0].children.map((c: any) => c.id)).toEqual(["main", "run", "side"]);
  expect(out.children[1]).toEqual({ id: "status" });
});

test("withNode gives null without the parent or the sibling", () => {
  expect(herdr.withNode(tree(), { id: "run" }, "nope", "main")).toBe(null);
  expect(herdr.withNode(tree(), { id: "run" }, "body", "nope")).toBe(null);
  expect(herdr.withNode({ id: "root" }, { id: "run" }, "root", "main")).toBe(null);
});

test("withNode leaves its input unchanged", () => {
  const input = tree();
  const node = { id: "run", children: [{ id: "x" }] };
  const out = herdr.withNode(input, node, "body", "main");
  expect(input).toEqual(tree());
  out.children[0].children[1].children.push({ id: "y" });
  expect(node).toEqual({ id: "run", children: [{ id: "x" }] });
});
