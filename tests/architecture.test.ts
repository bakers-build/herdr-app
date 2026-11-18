// The bakers mod's architecture (docs/architecture.md):
//   framework  core/ form/ list/ — logic: technique, form handling, list engine;
//              ui/ — drawing: components, form drawing, theme, icons; knows no module
//   modules    ticket/ project/ shell/ — each with model, repository (reads), commands
//              (writes), store, state, presenter/, list/, form/, operations/, view/,
//              register.js (the module's routes and contributions)
// Module logic draws nothing; views compose and draw; modules meet through each other's
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
// register.js assembles the views, so it may import them.
const isView = (p: string) => parts(p)[1] === "view" || parts(p)[1] === "register.js";

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

test("module logic draws nothing: no gpui, no ui, no views", async () => {
  const bad: string[] = [];
  for (const f of await files(ROOT)) {
    if (!MODULES.includes(parts(f)[0]) || isView(f)) continue;
    if (/from "gpui-(kit|base)"/.test(await readFile(f, "utf8"))) bad.push(`${rel(f)} draws`);
  }
  const imports = (await edges()).filter(
    (e) =>
      MODULES.includes(parts(e.from)[0]) &&
      !isView(e.from) &&
      (parts(e.to)[0] === "ui" || isView(e.to)),
  );
  expect([...bad, ...show(imports)]).toEqual([]);
});

test("a module uses another module only through its public parts, never its views", async () => {
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
  const { viewOf } = await import("../mods/bakers/core/router.js");
  const { registerAll } = await import("../mods/bakers/main.js");
  registerAll();
  const bad: string[] = [];
  for (const m of MODULES) {
    const src = await readFile(join(ROOT, m, "register.js"), "utf8");
    const names = [...src.matchAll(/define\("route", "([^"]+)"/g)].map((x) => x[1]);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      if (!name.startsWith(`${m}.`)) bad.push(`${m}/register.js defines route ${name}`);
      if (typeof viewOf(name) !== "function") bad.push(`${m}: ${name} has no view`);
    }
  }
  expect(bad).toEqual([]);
});

test("every route is menu, dialog or named after a domain module", async () => {
  const { all } = await import("../mods/bakers/core/registry.js");
  const { registerAll } = await import("../mods/bakers/main.js");
  registerAll();
  const mods = (await readdir(ROOT, { withFileTypes: true }))
    .filter((e) => e.isDirectory() && !FRAMEWORK.includes(e.name))
    .map((e) => e.name);
  const bad = all("route")
    .map((r: any) => r.id as string)
    .filter((id) => id !== "menu" && id !== "dialog" && !mods.some((m) => id.startsWith(`${m}.`)));
  expect(bad).toEqual([]);
});

test("only core/router.js opens a bakers overlay", async () => {
  const bad: string[] = [];
  for (const f of await files(ROOT)) {
    if (rel(f) === "core/router.js") continue;
    const src = await readFile(f, "utf8");
    // the call's argument: from `openOverlay(` to its balanced closing parenthesis
    for (const m of src.matchAll(/\bopenOverlay\(/g)) {
      let depth = 1;
      let i = m.index + m[0].length;
      for (; i < src.length && depth > 0; i++) {
        if (src[i] === "(") depth++;
        else if (src[i] === ")") depth--;
      }
      if (/\bmod:\s*"bakers"/.test(src.slice(m.index, i))) bad.push(rel(f));
    }
  }
  expect(bad).toEqual([]);
});

test("no routes.js exists: routes are defined in register.js", async () => {
  expect((await files(ROOT)).filter((f) => f.endsWith("/routes.js")).map(rel)).toEqual([]);
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
