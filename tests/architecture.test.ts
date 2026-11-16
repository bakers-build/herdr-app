// The bakers mod's architecture (docs/architecture.md):
//   framework  core/ form/ list/ components/ — technique, form handling, list engine, drawing;
//              knows no module
//   modules    ticket/ project/ shell/ — each with model, repository (reads), commands
//              (writes), store, state, presenter/, list/, form/, operations/, controller/,
//              routes.js
// Module logic draws nothing; controllers compose and draw; modules meet through each other's
// public parts (model, state, store, presenter, list) and through route names.
import { expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import "./harness";

const ROOT = resolve(import.meta.dir, "../mods/bakers");
const FRAMEWORK = ["core", "form", "list", "components"];
const MODULES = ["ticket", "project", "shell"];
const PUBLIC = ["model.js", "state.js", "store.js", "presenter", "list"];

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
const parts = (p: string) => rel(p).split("/");
const isController = (p: string) => parts(p)[1] === "controller" || parts(p)[1] === "routes.js";

async function edges() {
  const list: { from: string; to: string }[] = [];
  for (const f of await files(ROOT)) {
    const src = await readFile(f, "utf8");
    for (const m of src.matchAll(/^import[^;]*?"(\.[^"]+)"/gms))
      list.push({ from: f, to: resolve(f, "..", m[1]) });
  }
  return list;
}

const show = (bad: { from: string; to: string }[]) =>
  bad.map((e) => `${rel(e.from)} -> ${rel(e.to)}`);

test("the mod is main.js, the framework and the modules", async () => {
  const tops = (await readdir(ROOT)).filter((n) => !n.startsWith(".")).sort();
  expect(tops).toEqual([
    "components",
    "core",
    "form",
    "icons",
    "list",
    "main.js",
    "mod.json",
    "project",
    "shell",
    "ticket",
  ]);
});

test("the framework never imports a module, and its layers point down", async () => {
  const allowed: Record<string, string[]> = {
    core: ["core"],
    form: ["core", "form"],
    list: ["core", "list"],
    components: ["core", "form", "components"],
  };
  const bad = (await edges()).filter(
    (e) =>
      FRAMEWORK.includes(parts(e.from)[0]) && !allowed[parts(e.from)[0]].includes(parts(e.to)[0]),
  );
  expect(show(bad)).toEqual([]);
});

test("module logic draws nothing: no gpui, no components, no controllers", async () => {
  const bad: string[] = [];
  for (const f of await files(ROOT)) {
    if (!MODULES.includes(parts(f)[0]) || isController(f)) continue;
    if (/from "gpui-(kit|base)"/.test(await readFile(f, "utf8"))) bad.push(`${rel(f)} draws`);
  }
  const imports = (await edges()).filter(
    (e) =>
      MODULES.includes(parts(e.from)[0]) &&
      !isController(e.from) &&
      (parts(e.to)[0] === "components" || isController(e.to)),
  );
  expect([...bad, ...show(imports)]).toEqual([]);
});

test("a module uses another module only through its public parts, never its controllers", async () => {
  const bad = (await edges()).filter((e) => {
    const [a] = parts(e.from);
    const [b, second] = parts(e.to);
    return MODULES.includes(a) && MODULES.includes(b) && a !== b && !PUBLIC.includes(second);
  });
  expect(show(bad)).toEqual([]);
});

test("reads only in repository.js (JSON:API), writes only in commands.js (bakers tools)", async () => {
  const bad: string[] = [];
  for (const f of await files(ROOT)) {
    const r = rel(f);
    if (r.startsWith("core/")) continue;
    const src = await readFile(f, "utf8");
    if (/from "[^"]*core\/api\.js"/.test(src) && !/\/repository\.js$/.test(r))
      bad.push(`${r} reads`);
    if (/from "[^"]*core\/cli\.js"|"bakers_/.test(src) && !/\/commands\.js$/.test(r))
      bad.push(`${r} writes`);
  }
  expect(bad).toEqual([]);
});

test("every route is named after its module and reaches the router", async () => {
  const { ROUTES } = await import("../mods/bakers/main.js");
  for (const m of MODULES) {
    const routes = (await import(`../mods/bakers/${m}/routes.js`)).default;
    for (const name of Object.keys(routes)) {
      expect(name.startsWith(`${m}.`)).toBe(true);
      expect(ROUTES[name]).toBe(routes[name]);
    }
  }
});

test("there is one mod", async () => {
  expect(await readdir(resolve(import.meta.dir, "../mods"))).toEqual(["bakers"]);
});
