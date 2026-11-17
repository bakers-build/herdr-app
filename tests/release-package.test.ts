import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPackage } from "../scripts/release/package";

const root = new URL("..", import.meta.url).pathname;
const run = (cmd: string[], cwd?: string, env?: Record<string, string>) => {
  const r = Bun.spawnSync(cmd, { cwd, env: { ...process.env, ...env } });
  return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
};

let out = "";
let zip = "";
beforeAll(async () => {
  out = await mkdtemp(join(tmpdir(), "herdr-pkg-"));
  zip = await buildPackage({ root, version: "1.2.3", outDir: out });
});
afterAll(async () => {
  await rm(out, { recursive: true, force: true });
});

test("names the ZIP after the version", () => {
  expect(zip).toBe(join(out, "herdr-bakers-1.2.3.zip"));
});

test("package.zip lists the release layout", () => {
  const entries = run(["unzip", "-Z1", zip]).out.split("\n").filter(Boolean);
  for (const path of [
    "mods/bakers/main.js",
    "mods/bakers/mod.json",
    "mods/bakers/ticket/model.js",
    "scripts/install.ts",
    "scripts/layout.js",
    "README.md",
  ])
    expect(entries).toContain(`herdr-bakers-1.2.3/${path}`);
  expect(entries.every((e) => e.startsWith("herdr-bakers-1.2.3/"))).toBe(true);
  expect(entries.some((e) => /tests\/|node_modules\/|scripts\/release\//.test(e))).toBe(false);
});

test("stamps the version into the packaged mod.json", () => {
  const json = run(["unzip", "-p", zip, "herdr-bakers-1.2.3/mods/bakers/mod.json"]).out;
  expect(JSON.parse(json)).toEqual({ place: "none", version: "1.2.3" });
});

test("leaves the repo mod.json at the dev version", async () => {
  const json = JSON.parse(await readFile(join(root, "mods/bakers/mod.json"), "utf8"));
  expect(json.version).toBe("0.0.0-dev");
});

test("installs from an unpacked package in a path with spaces", async () => {
  const where = join(out, "my dir");
  await mkdir(where, { recursive: true });
  expect(run(["unzip", "-q", zip, "-d", where]).code).toBe(0);
  const home = join(out, "home");
  await mkdir(join(home, "layouts"), { recursive: true });
  await writeFile(
    join(home, "layouts", "main.json"),
    await readFile(join(root, "tests/fixtures/herdr-main.json"), "utf8"),
  );
  const r = run(["bun", join(where, "herdr-bakers-1.2.3", "scripts", "install.ts")], where, {
    HERDR_APP_HOME: home,
  });
  expect(r.err).toBe("");
  expect(r.code).toBe(0);
  expect(r.out).toContain("installing bakers 1.2.3");
  const installed = JSON.parse(await readFile(join(home, "mods/bakers/mod.json"), "utf8"));
  expect(installed.version).toBe("1.2.3");
});

test("the CLI exits 1 without a version", () => {
  const r = run(["bun", join(root, "scripts/release/package.ts")], root);
  expect(r.code).toBe(1);
  expect(r.err).toContain("usage");
});
