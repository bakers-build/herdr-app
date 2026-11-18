import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { headerVersions, mismatches, parseHerdrVersion } from "../scripts/check/herdr-types";

const root = new URL("..", import.meta.url).pathname;

const kit =
  "// Auto-generated\n//\n// The built-in modules, as TypeScript declarations, for gpui-shell 0.7.1.\n";
const herdr =
  "// Vendored from herdr-app 0.1.16 (Apache-2.0, see types/LICENSE-herdr): ~/.config/herdr-app/herdr.d.ts.\n";

test("headerVersions reads gpui-shell from gpui-kit.d.ts and herdr-app from herdr.d.ts", () => {
  expect(headerVersions(kit, herdr)).toEqual({ gpuiShell: "0.7.1", herdr: "0.1.16" });
});

test("headerVersions leaves a missing header undefined", () => {
  expect(headerVersions("// nothing", "// nothing")).toEqual({
    gpuiShell: undefined,
    herdr: undefined,
  });
});

test("mismatches is empty when the headers match the pin", () => {
  const pin = { herdr: "0.1.16", gpuiShell: "0.7.1" };
  expect(mismatches(pin, { herdr: "0.1.16", gpuiShell: "0.7.1" })).toEqual([]);
});

test("mismatches names each field that differs", () => {
  const pin = { herdr: "0.1.15", gpuiShell: "0.7.1" };
  const out = mismatches(pin, { herdr: "0.1.16", gpuiShell: undefined });
  expect(out).toHaveLength(2);
  expect(out[0]).toContain("herdr");
  expect(out[0]).toContain("0.1.15");
  expect(out[0]).toContain("0.1.16");
  expect(out[1]).toContain("gpuiShell");
});

test("parseHerdrVersion reads `herdr-app --version`", () => {
  expect(parseHerdrVersion("herdr-app 0.1.16\n")).toBe("0.1.16");
  expect(parseHerdrVersion("garbage")).toBeUndefined();
});

test("the vendored types match types/herdr-version.json", () => {
  const pin = JSON.parse(readFileSync(join(root, "types/herdr-version.json"), "utf8"));
  const found = headerVersions(
    readFileSync(join(root, "types/gpui-kit.d.ts"), "utf8"),
    readFileSync(join(root, "types/herdr.d.ts"), "utf8"),
  );
  expect(mismatches(pin, found)).toEqual([]);
});
