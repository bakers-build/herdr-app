// Herdr-style mod test: load the mod's plain-JS source, evaluate it over
// stubbed globals and assert on the element tree it renders. No window, no
// Herdr core. Pattern from Herdr's scripts/picker.test.ts (v0.1.15).
import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

class Element {
  nodes: unknown[] = [];

  child(node: unknown): this {
    this.nodes.push(node);
    return this;
  }
}

// Any other chained builder call (style setters and the like) is recorded as
// a no-op that keeps the chain going.
function element(): Element {
  return new Proxy(new Element(), {
    get(target, key, receiver) {
      if (key in target) return Reflect.get(target, key, receiver);
      return () => receiver;
    },
  });
}

async function loadMod(name: string) {
  const path = new URL(`../mods/${name}/main.js`, import.meta.url);
  const src = (await readFile(path, "utf8"))
    .replace(/^import .*;\n/gm, "")
    .replace(/export default class (\w+)/, "return class $1");
  return new Function("View", "div", src)(class {}, element);
}

test("bakers placeholder renders its name", async () => {
  const Bakers = await loadMod("bakers");
  const view = new Bakers();
  const root = view.render();
  expect(root.nodes).toEqual(["bakers.build"]);
});
