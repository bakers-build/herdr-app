// Loads every mod in the pinned Herdr (`herdr-app check <mod>`): Herdr builds the mod's
// description and materializes its eager native elements in a hidden window.
// Uses HERDR_APP, else an installed herdr-app, else downloads the pinned Linux build from
// Herdr's releases (types/herdr-version.json: version and checksum). CI job `herdr-check`
// runs it on Linux under a virtual display. `downloadCore` fetches the pinned herdr-core, which
// a running window needs and the Linux app build lacks (the e2e run uses it).
//   bun scripts/check/herdr-check.ts   → exit 1 when a mod fails to load or render

import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RELEASES = "https://releases.herdr.dev";

/** Herdr's name for the Linux build of this machine. */
export function linuxTarget(arch: string): string {
  if (arch === "x64") return "linux-x86_64";
  if (arch === "arm64") return "linux-aarch64";
  throw new Error(`no Herdr build for linux-${arch}`);
}

export function buildUrl(version: string, target: string): string {
  return `${RELEASES}/app/${version}/herdr-app-${target}.tar.gz`;
}

export function coreUrl(version: string, target: string): string {
  return `${RELEASES}/core/${version}/herdr-core-${target}.tar.gz`;
}

export function checksumOk(bytes: Uint8Array, sha256: string): boolean {
  return createHash("sha256").update(bytes).digest("hex") === sha256;
}

type Fetch = (url: string) => Promise<Response>;
type Host = { fetch: Fetch; platform: string; arch: string };

/** Fetches a pinned Linux tarball, checks its checksum and unpacks it; returns the directory. */
async function fetchPinned(
  what: string,
  url: (target: string) => string,
  builds: Record<string, string>,
  host: Host,
): Promise<string> {
  if (host.platform !== "linux")
    throw new Error(`no ${what} installed; set HERDR_APP or install Herdr`);
  const target = linuxTarget(host.arch);
  const u = url(target);
  const r = await host.fetch(u);
  if (!r.ok) throw new Error(`${u}: HTTP ${r.status}`);
  const bytes = new Uint8Array(await r.arrayBuffer());
  const want = builds[target];
  if (!want || !checksumOk(bytes, want)) throw new Error(`${u}: checksum mismatch`);
  const dir = mkdtempSync(join(tmpdir(), `${what}-`));
  writeFileSync(join(dir, "build.tar.gz"), bytes);
  const tar = Bun.spawnSync(["tar", "-xzf", "build.tar.gz"], { cwd: dir, stderr: "inherit" });
  if (tar.exitCode !== 0) throw new Error(`unpacking ${u} failed`);
  return dir;
}

const HOST: Host = { fetch, platform: process.platform, arch: process.arch };

/** Downloads, verifies and unpacks the pinned Linux build; returns the binary's path. */
export async function download(
  version: string,
  builds: Record<string, string>,
  host: Host = HOST,
): Promise<string> {
  const dir = await fetchPinned("herdr-app", (t) => buildUrl(version, t), builds, host);
  return join(dir, "herdr-app", "herdr-app");
}

/** Downloads, verifies and unpacks the pinned Linux herdr-core, which the window needs. */
export async function downloadCore(
  version: string,
  builds: Record<string, string>,
  host: Host = HOST,
): Promise<string> {
  const dir = await fetchPinned("herdr-core", (t) => coreUrl(version, t), builds, host);
  return join(dir, "herdr-core");
}

/** `herdr-app check` on every mod (a folder of mods/ with a mod.json); 1 if any fails. */
export function checkMods(
  bin: string,
  root: string,
  output: "inherit" | "ignore" = "inherit",
): number {
  const mods = readdirSync(join(root, "mods")).filter((m) =>
    existsSync(join(root, "mods", m, "mod.json")),
  );
  let code = 0;
  for (const mod of mods) {
    const r = Bun.spawnSync([bin, "check", join("mods", mod)], {
      cwd: root,
      stdout: output,
      stderr: output,
    });
    if (r.exitCode !== 0) code = 1;
  }
  return code;
}

if (import.meta.main) {
  const root = join(import.meta.dir, "../..");
  const pin = JSON.parse(readFileSync(join(root, "types/herdr-version.json"), "utf8"));
  try {
    const bin =
      process.env.HERDR_APP || Bun.which("herdr-app") || (await download(pin.herdr, pin.builds));
    process.exit(checkMods(bin, root));
  } catch (e) {
    process.stderr.write(`herdr-check: ${(e as Error).message}\n`);
    process.exit(1);
  }
}
