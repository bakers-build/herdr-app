// The Biome rules the HERDRAPP-3 review asked for, checked against the repo's biome.json.
// Each snippet is linted as a real file in a throwaway git repo that carries a copy of
// biome.json, so no fixture ever lands in mods/.
import { afterAll, expect, test } from "bun:test";
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { makeRepo } from "./git-fixture";

const root = new URL("..", import.meta.url).pathname;
const biome = join(root, "node_modules/.bin/biome");
const repo = makeRepo();
copyFileSync(join(root, "biome.json"), join(repo.dir, "biome.json"));
afterAll(() => repo.remove());

function lint(path: string, source: string) {
  const file = join(repo.dir, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, source);
  try {
    const r = Bun.spawnSync([biome, "lint", "--colors=off", path], { cwd: repo.dir });
    return { code: r.exitCode, out: r.stdout.toString() + r.stderr.toString() };
  } finally {
    rmSync(file);
  }
}

const cases: [string, string][] = [
  ["noUnusedImports", 'import { box } from "gpui-kit";\nexport const a = 1;\n'],
  ["noUnusedVariables", "export function f() {\n  const unused = 1;\n  return 2;\n}\n"],
  ["noFloatingPromises", 'export function f() {\n  fetch("https://example.invalid");\n}\n'],
  ["noConsole", 'export function f() {\n  console.log("x");\n}\n'],
];

for (const [rule, source] of cases) {
  test(`${rule} is an error in mods/`, () => {
    const r = lint("mods/bakers/lint-fixture.js", source);
    expect(r.out).toContain(rule);
    expect(r.code).not.toBe(0);
  });
}

test("console is allowed in scripts/ and tests/", () => {
  const source = 'export function f() {\n  console.log("x");\n}\n';
  for (const path of ["scripts/lint-fixture.ts", "tests/lint-fixture.ts"]) {
    const r = lint(path, source);
    expect(r.out).not.toContain("noConsole");
    expect(r.code).toBe(0);
  }
});
