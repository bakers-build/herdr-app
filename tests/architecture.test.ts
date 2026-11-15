// The bakers mod is cut into vertical slices (docs/architecture.md):
//   core/      the kernel: CLI, session (project and store), tabs, kit, menu, dialog
//   features/  one folder per function, each with its UI parts, bakers calls and actions
//   screens/   compose features into a placement; no bakers calls of their own
// Imports point down only: screens -> features -> core. A feature never imports another
// feature, core never imports a feature or a screen.
import { expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "../mods/bakers");

async function files(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await files(p)));
    else if (e.name.endsWith(".js")) out.push(p);
  }
  return out;
}

function layer(path: string) {
  const [top, slice] = relative(ROOT, path).split("/");
  return { top, slice };
}

async function edges() {
  const list: { from: string; to: string }[] = [];
  for (const f of await files(ROOT)) {
    const src = await readFile(f, "utf8");
    for (const m of src.matchAll(/^import[^;]*?from\s+"(\.[^"]+)"/gms))
      list.push({ from: f, to: resolve(f, "..", m[1]) });
  }
  return list;
}

test("the mod has only main.js, core/, features/ and screens/", async () => {
  const tops = (await readdir(ROOT)).filter((n) => !n.startsWith(".")).sort();
  expect(tops).toEqual(["core", "features", "icons", "main.js", "mod.json", "screens"]);
});

test("core imports nothing outside core", async () => {
  const bad = (await edges()).filter(
    (e) => layer(e.from).top === "core" && layer(e.to).top !== "core",
  );
  expect(bad.map((e) => `${relative(ROOT, e.from)} -> ${relative(ROOT, e.to)}`)).toEqual([]);
});

test("a feature imports only core and its own folder", async () => {
  const bad = (await edges()).filter((e) => {
    const a = layer(e.from);
    const b = layer(e.to);
    return (
      a.top === "features" && !(b.top === "core" || (b.top === "features" && b.slice === a.slice))
    );
  });
  expect(bad.map((e) => `${relative(ROOT, e.from)} -> ${relative(ROOT, e.to)}`)).toEqual([]);
});

test("screens import features and core, never another screen", async () => {
  const bad = (await edges()).filter(
    (e) => layer(e.from).top === "screens" && layer(e.to).top === "screens",
  );
  expect(bad.map((e) => `${relative(ROOT, e.from)} -> ${relative(ROOT, e.to)}`)).toEqual([]);
});

test("screens make no bakers calls of their own", async () => {
  const bad: string[] = [];
  for (const f of await files(join(ROOT, "screens"))) {
    const src = await readFile(f, "utf8");
    if (/core\/cli\.js|bakers_/.test(src)) bad.push(relative(ROOT, f));
  }
  expect(bad).toEqual([]);
});

test("there is one mod: the tab bar is a view of bakers", async () => {
  expect(await readdir(resolve(import.meta.dir, "../mods"))).toEqual(["bakers"]);
});
