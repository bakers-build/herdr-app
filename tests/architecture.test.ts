// The bakers mod's layers (docs/architecture.md):
//   core/        technique: CLI call, error kinds, Herdr tabs and layout, action registry, theme
//   form/        form handling: state, submit in steps, partial failures, keys, registry
//   components/  generic drawing, no entity
//   entity/<e>/  data, rules, actions (the only bakers calls), presenter/ (views: props),
//                form/ (form definitions)
//   ui/          the Herdr placements: fetch, map, draw, wire
// Imports point down: core <- form <- components <- entity <- ui.
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

const rel = (p: string) => relative(ROOT, p);
const top = (p: string) => rel(p).split("/")[0];

async function edges() {
  const list: { from: string; to: string }[] = [];
  for (const f of await files(ROOT)) {
    const src = await readFile(f, "utf8");
    for (const m of src.matchAll(/^import[^;]*?from\s+"(\.[^"]+)"/gms))
      list.push({ from: f, to: resolve(f, "..", m[1]) });
  }
  return list;
}

const show = (bad: { from: string; to: string }[]) =>
  bad.map((e) => `${rel(e.from)} -> ${rel(e.to)}`);

const ALLOWED: Record<string, string[]> = {
  core: ["core"],
  form: ["core", "form"],
  components: ["core", "form", "components"],
  entity: ["core", "form", "entity"],
  ui: ["core", "form", "components", "entity", "ui"],
};

test("the mod has main.js, core, form, components, entity and ui", async () => {
  const tops = (await readdir(ROOT)).filter((n) => !n.startsWith(".")).sort();
  expect(tops).toEqual([
    "components",
    "core",
    "entity",
    "form",
    "icons",
    "main.js",
    "mod.json",
    "ui",
  ]);
});

test("imports point down: core <- form <- components <- entity <- ui", async () => {
  const bad = (await edges()).filter(
    (e) => top(e.from) in ALLOWED && !ALLOWED[top(e.from)].includes(top(e.to)),
  );
  expect(show(bad)).toEqual([]);
});

test("an entity imports another entity only through its data.js", async () => {
  const bad = (await edges()).filter((e) => {
    const [a, ea] = rel(e.from).split("/");
    const [b, eb, file] = rel(e.to).split("/");
    return a === "entity" && b === "entity" && ea !== eb && file !== "data.js";
  });
  expect(show(bad)).toEqual([]);
});

test("ui files do not import each other", async () => {
  const bad = (await edges()).filter((e) => top(e.from) === "ui" && top(e.to) === "ui");
  expect(show(bad)).toEqual([]);
});

test("presenters, form definitions, form handling and entity logic draw nothing", async () => {
  const bad: string[] = [];
  for (const f of await files(ROOT)) {
    const r = rel(f);
    const pure = r.startsWith("form/") || (r.startsWith("entity/") && !r.endsWith("/data.js"));
    if (pure && /from "gpui-(kit|base)"/.test(await readFile(f, "utf8"))) bad.push(r);
  }
  expect(bad).toEqual([]);
});

test("only entity data.js and actions.js talk to bakers", async () => {
  const bad: string[] = [];
  for (const f of await files(ROOT)) {
    const r = rel(f);
    const src = await readFile(f, "utf8");
    const talks = /core\/cli\.js|"bakers_/.test(src);
    const may = /^entity\/[^/]+\/(data|actions)\.js$/.test(r) || r === "core/cli.js";
    if (talks && !may) bad.push(r);
  }
  expect(bad).toEqual([]);
});

test("there is one mod", async () => {
  expect(await readdir(resolve(import.meta.dir, "../mods"))).toEqual(["bakers"]);
});
