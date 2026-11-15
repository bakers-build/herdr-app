// The bakers mod's entry point evaluated as Herdr would: real source, stubbed globals.
import { beforeEach, expect, test } from "bun:test";
import { load, mount, reset } from "./harness";

beforeEach(reset);

test("bakers routes each placement to its view by props().view", async () => {
  const Bakers = await load("bakers/main.js");
  for (const view of ["rail", "sidebar", "status"]) {
    const copy = mount(Bakers, { view });
    expect(copy.inner).toBeDefined();
    expect(copy.render()).toBeDefined();
  }
});
