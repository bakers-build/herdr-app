// Fails when the mods' and scripts' coverage falls below a fixed floor. Bun's own
// coverageThreshold applies to every file on its own, so it cannot hold a floor for the
// whole repo; this reads the lcov report `bun test --coverage` writes (see bunfig.toml).
//   bun scripts/check/coverage.ts   → exit 1 and the measures below the floor on stderr

import { readFileSync } from "node:fs";

/** The measured baseline (HERDRAPP-4: lines 92.76 %, functions 90.23 %), rounded down to a whole percent. Raise it, never lower it. */
export const FLOOR = { lines: 0.92, functions: 0.9 };

export type Coverage = { lines: number; functions: number };

export function totals(lcov: string): Coverage {
  const sum = (key: string) =>
    [...lcov.matchAll(new RegExp(`^${key}:(\\d+)$`, "gm"))].reduce((n, m) => n + Number(m[1]), 0);
  const ratio = (hit: number, found: number) => (found === 0 ? 1 : hit / found);
  return { lines: ratio(sum("LH"), sum("LF")), functions: ratio(sum("FNH"), sum("FNF")) };
}

/** Tracked source files missing from the report: no test loads them, so the totals miss them. */
export function notMeasured(lcov: string, tracked: string[]): string[] {
  const measured = new Set([...lcov.matchAll(/^SF:(.+)$/gm)].map((m) => m[1]));
  return tracked.filter((f) => !measured.has(f));
}

export function belowFloor(found: Coverage, floor: Coverage): string[] {
  return (["lines", "functions"] as const)
    .filter((k) => found[k] < floor[k])
    .map(
      (k) =>
        `${k}: ${(found[k] * 100).toFixed(2)} % is below the floor of ${Math.round(floor[k] * 100)} %`,
    );
}

if (import.meta.main) {
  const file = process.argv[2] ?? "coverage/lcov.info";
  const lcov = readFileSync(file, "utf8");
  const found = totals(lcov);
  const files = Bun.spawnSync(["git", "ls-files", "-z", "mods", "scripts"]).stdout.toString();
  const tracked = files.split("\0").filter((f) => /\.(js|ts)$/.test(f) && !f.endsWith(".d.ts"));
  const bad = [
    ...belowFloor(found, FLOOR),
    ...notMeasured(lcov, tracked).map((f) => `${f}: no test loads it, so coverage cannot see it`),
  ];
  process.stdout.write(
    `coverage: lines ${(found.lines * 100).toFixed(2)} %, functions ${(found.functions * 100).toFixed(2)} %\n`,
  );
  if (bad.length > 0) {
    process.stderr.write(`${bad.map((m) => `${m}\n`).join("")}`);
    process.exit(1);
  }
}
