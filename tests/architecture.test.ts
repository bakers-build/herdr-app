// The bakers mod's architecture (docs/architecture.md):
//   framework  core/ form/ list/ — logic: technique, form handling, list engine;
//              ui/ — drawing: components, form drawing, theme, icons; knows no module
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
const FRAMEWORK = ["core", "form", "list", "ui"];
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
// routes.js and register.js assemble the controllers, so they may import them.
const isController = (p: string) =>
  parts(p)[1] === "controller" || parts(p)[1] === "routes.js" || parts(p)[1] === "register.js";

async function edges() {
  const list: { from: string; to: string }[] = [];
  for (const f of await files(ROOT)) {
    const src = await readFile(f, "utf8");
    // Every reference form, anywhere in the source: `import … from "x"`, `import "x"`,
    // `export … from "x"`, `import("x")`; multi-line statements end in `from "x"`.
    for (const m of src.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*"(\.[^"]+)"/g))
      list.push({ from: f, to: resolve(f, "..", m[1]) });
  }
  return list;
}

const show = (bad: { from: string; to: string }[]) =>
  bad.map((e) => `${rel(e.from)} -> ${rel(e.to)}`);

test("the mod is main.js, the framework and the modules", async () => {
  const tops = (await readdir(ROOT)).filter((n) => !n.startsWith(".")).sort();
  expect(tops).toEqual([
    "core",
    "form",
    "list",
    "main.js",
    "mod.json",
    "project",
    "shell",
    "ticket",
    "ui",
  ]);
});

test("the framework never imports a module, and its layers point down", async () => {
  const allowed: Record<string, string[]> = {
    core: ["core"],
    form: ["core", "form"],
    list: ["core", "list"],
    ui: ["core", "form", "ui"],
  };
  const bad = (await edges()).filter(
    (e) =>
      FRAMEWORK.includes(parts(e.from)[0]) && !allowed[parts(e.from)[0]].includes(parts(e.to)[0]),
  );
  expect(show(bad)).toEqual([]);
});

test("module logic draws nothing: no gpui, no ui, no controllers", async () => {
  const bad: string[] = [];
  for (const f of await files(ROOT)) {
    if (!MODULES.includes(parts(f)[0]) || isController(f)) continue;
    if (/from "gpui-(kit|base)"/.test(await readFile(f, "utf8"))) bad.push(`${rel(f)} draws`);
  }
  const imports = (await edges()).filter(
    (e) =>
      MODULES.includes(parts(e.from)[0]) &&
      !isController(e.from) &&
      (parts(e.to)[0] === "ui" || isController(e.to)),
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
  const { get } = await import("../mods/bakers/core/registry.js");
  for (const m of MODULES) {
    const routes = (await import(`../mods/bakers/${m}/routes.js`)).default;
    for (const name of Object.keys(routes)) {
      expect(name.startsWith(`${m}.`)).toBe(true);
      expect(get("route", name)).toBe(routes[name]);
    }
  }
});

// The generic part is the framework; every other top-level folder is a domain module.
async function domain() {
  const tops = await readdir(ROOT, { withFileTypes: true });
  return tops
    .filter((e) => e.isDirectory() && !e.name.startsWith(".") && !FRAMEWORK.includes(e.name))
    .map((e) => e.name)
    .sort();
}

test("the framework names no module, not even in strings or comments", async () => {
  const names = await domain();
  const bad: string[] = [];
  for (const f of await files(ROOT)) {
    if (!FRAMEWORK.includes(parts(f)[0])) continue;
    const src = await readFile(f, "utf8");
    src.split("\n").forEach((line, i) => {
      for (const m of names)
        if (new RegExp(`\\b(${m}s?|${m}\\.)\\b`, "i").test(line))
          bad.push(`${rel(f)}:${i + 1} names ${m}: ${line.trim()}`);
    });
  }
  expect(bad).toEqual([]);
});

test("shell imports no other module", async () => {
  const names = (await domain()).filter((m) => m !== "shell");
  const bad = (await edges()).filter(
    (e) => parts(e.from)[0] === "shell" && names.includes(parts(e.to)[0]),
  );
  expect(show(bad)).toEqual([]);
});

test("one registry: no other define/register exports, define( only in register.js, old registries gone", async () => {
  const bad: string[] = [];
  for (const f of await files(ROOT)) {
    const r = rel(f);
    const src = await readFile(f, "utf8");
    const isRegister = /^[^/]+\/register\.js$/.test(r);
    if (r !== "core/registry.js") {
      // each register.js exports its own register; main.js exports registerAll, which calls them.
      for (const m of src.matchAll(
        /^export\s+(?:async\s+)?(?:function|const|let)\s+(define\w*|register\w*)/gm,
      ))
        if (!(isRegister && m[1] === "register") && !(r === "main.js" && m[1] === "registerAll"))
          bad.push(`${r} exports ${m[1]}`);
      for (const m of src.matchAll(/^export\s*\{([^}]*)\}/gms))
        for (const n of m[1].split(",").map(
          (x) =>
            x
              .trim()
              .split(/\s+as\s+/)
              .pop() as string,
        ))
          if (/^(define|register)/.test(n)) bad.push(`${r} exports ${n}`);
    }
    if (!isRegister && r !== "core/registry.js" && /(^|[^\w.])define\(/.test(src))
      bad.push(`${r} calls define(`);
  }
  for (const old of ["list/registry.js", "form/registry.js"])
    if ((await files(ROOT)).some((f) => rel(f) === old)) bad.push(`${old} exists`);
  expect(bad).toEqual([]);
});

test("there is one mod", async () => {
  expect(await readdir(resolve(import.meta.dir, "../mods"))).toEqual(["bakers"]);
});
