// Fails when the vendored Herdr types (types/gpui-kit.d.ts, types/herdr.d.ts) do not match the
// Herdr version pinned in types/herdr-version.json, and, where `herdr-app` is installed, when
// the installed Herdr differs from the pin (then refresh the copies, see docs/conventions.md).
//   bun scripts/check/herdr-types.ts   → exit 1 and the mismatches on stderr

import { readFileSync } from "node:fs";
import { join } from "node:path";

export type Versions = { herdr?: string; gpuiShell?: string };

/** gpui-shell from gpui-kit.d.ts's generated header, herdr-app from herdr.d.ts's vendor line. */
export function headerVersions(gpuiKit: string, herdr: string): Versions {
  return {
    gpuiShell: gpuiKit.match(/^\/\/ .*\bfor gpui-shell (\d+\.\d+\.\d+)/m)?.[1],
    herdr: herdr.match(/^\/\/ Vendored from herdr-app (\d+\.\d+\.\d+)/m)?.[1],
  };
}

export function mismatches(pin: Versions, found: Versions): string[] {
  return (["herdr", "gpuiShell"] as const)
    .filter((k) => pin[k] !== found[k])
    .map((k) => `${k}: pinned ${pin[k]}, vendored types say ${found[k] ?? "nothing"}`);
}

export function parseHerdrVersion(output: string): string | undefined {
  return output.match(/herdr-app (\d+\.\d+\.\d+)/)?.[1];
}

if (import.meta.main) {
  const root = join(import.meta.dir, "../..");
  const read = (p: string) => readFileSync(join(root, p), "utf8");
  const pin: Versions = JSON.parse(read("types/herdr-version.json"));
  const bad = mismatches(
    pin,
    headerVersions(read("types/gpui-kit.d.ts"), read("types/herdr.d.ts")),
  );
  const bin = Bun.which("herdr-app");
  if (bin) {
    const installed = parseHerdrVersion(Bun.spawnSync([bin, "--version"]).stdout.toString());
    if (installed !== pin.herdr)
      bad.push(`herdr: pinned ${pin.herdr}, installed herdr-app is ${installed ?? "unknown"}`);
  }
  if (bad.length > 0) {
    process.stderr.write(
      `Herdr types out of date (see docs/conventions.md, "Vendored types"):\n${bad.map((m) => `  ${m}\n`).join("")}`,
    );
    process.exit(1);
  }
}
