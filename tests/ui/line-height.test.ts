import { expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".js") ? [p] : [];
  });

test("no line_height takes a bare number: Herdr reads it as a multiple of the text size", () => {
  const hits = files(join(import.meta.dir, "../../mods/bakers")).flatMap((f) =>
    readFileSync(f, "utf8")
      .split("\n")
      .flatMap((line, i) => (/\.line_height\(\s*[\d.]+\s*\)/.test(line) ? [`${f}:${i + 1}`] : [])),
  );
  expect(hits).toEqual([]);
});
