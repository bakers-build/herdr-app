import { beforeEach, expect, test } from "bun:test";
import { click, env, find, load, reset, texts } from "./harness";

beforeEach(reset);

test("harness evaluates a view and records run()", async () => {
  const Click = await load("../tests/fixtures/click/main.js");
  const root = new Click().render();
  expect(texts(root)).toEqual(["Go"]);
  click(find(root, "go"));
  expect(env.calls).toContainEqual({ fn: "run", args: ["tab.select", { index: 1 }] });
});
