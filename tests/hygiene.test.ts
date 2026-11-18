import { afterEach, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { forbidden } from "../scripts/check/hygiene";
import { makeRepo, type Repo } from "./git-fixture";

const root = new URL("..", import.meta.url).pathname;

let repo: Repo | null = null;
afterEach(() => {
  repo?.remove();
  repo = null;
});

test("forbidden returns only the cache paths", () => {
  expect(forbidden([".dropsh/cache/x", "mods/bakers/main.js"])).toEqual([".dropsh/cache/x"]);
});

test("forbidden flags runtime, build and Herdr-written files", () => {
  const bad = [
    "mods/bakers/ui/form/gpui-kit.d.ts",
    "mods/bakers/gpui-kit.d.ts",
    "mods/bakers/jsconfig.json",
    "mods/bakers/ticket/jsconfig.json",
    ".bakers/log.txt",
    ".bakers-worktrees/x/a.js",
    "node_modules/a/index.js",
    "dist/a.zip",
    "coverage/lcov.info",
    "assets-ai/HERDRAPP-4/notes.md",
  ];
  expect(forbidden(bad)).toEqual(bad);
});

test("forbidden passes vendored types and project config", () => {
  expect(
    forbidden(["types/gpui-kit.d.ts", ".bakers/project.config.js", "jsconfig.json", "README.md"]),
  ).toEqual([]);
});

const run = (cwd: string) =>
  Bun.spawnSync(["bun", join(root, "scripts/check/hygiene.ts")], { cwd });

test("the CLI exits 1 and names a committed cache file", () => {
  repo = makeRepo();
  const file = join(repo.dir, ".dropsh/cache/x");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, "x");
  writeFileSync(join(repo.dir, "ok.js"), "");
  repo.git("add", "-f", ".");
  const r = run(repo.dir);
  expect(r.exitCode).toBe(1);
  expect(r.stderr.toString()).toContain(".dropsh/cache/x");
});

test("the CLI exits 0 on a clean tree", () => {
  repo = makeRepo();
  writeFileSync(join(repo.dir, "ok.js"), "");
  repo.git("add", ".");
  expect(run(repo.dir).exitCode).toBe(0);
});
