import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildUrl,
  checkMods,
  checksumOk,
  download,
  linuxTarget,
} from "../scripts/check/herdr-check";

const pin = JSON.parse(
  readFileSync(new URL("../types/herdr-version.json", import.meta.url), "utf8"),
);

test("the Linux build target follows the machine", () => {
  expect(linuxTarget("x64")).toBe("linux-x86_64");
  expect(linuxTarget("arm64")).toBe("linux-aarch64");
  expect(() => linuxTarget("ia32")).toThrow(/no Herdr build/);
});

test("the build comes from Herdr's releases for the pinned version", () => {
  expect(buildUrl("0.1.16", "linux-x86_64")).toBe(
    "https://releases.herdr.dev/app/0.1.16/herdr-app-linux-x86_64.tar.gz",
  );
});

test("a download counts only with the pinned checksum", () => {
  const bytes = new TextEncoder().encode("herdr");
  const sha = createHash("sha256").update(bytes).digest("hex");
  expect(checksumOk(bytes, sha)).toBe(true);
  expect(checksumOk(new TextEncoder().encode("other"), sha)).toBe(false);
});

test("both Linux builds of the pinned Herdr have a checksum", () => {
  for (const t of ["linux-x86_64", "linux-aarch64"])
    expect(pin.builds[t]).toMatch(/^[0-9a-f]{64}$/);
});

/** A herdr-app tarball like Herdr's, whose binary prints its arguments. */
function tarball(): Uint8Array {
  const dir = mkdtempSync(join(tmpdir(), "herdr-tar-"));
  mkdirSync(join(dir, "herdr-app"));
  writeFileSync(join(dir, "herdr-app", "herdr-app"), '#!/bin/sh\necho fake "$@"\n');
  chmodSync(join(dir, "herdr-app", "herdr-app"), 0o755);
  Bun.spawnSync(["tar", "-czf", "app.tar.gz", "herdr-app"], { cwd: dir });
  return new Uint8Array(readFileSync(join(dir, "app.tar.gz")));
}
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

test("download verifies and unpacks the pinned Linux build", async () => {
  const bytes = tarball();
  const asked: string[] = [];
  const fetch = async (url: string) => {
    asked.push(url);
    return new Response(bytes);
  };
  const bin = await download(
    "0.1.16",
    { "linux-x86_64": sha(bytes) },
    { fetch, platform: "linux", arch: "x64" },
  );
  expect(asked).toEqual(["https://releases.herdr.dev/app/0.1.16/herdr-app-linux-x86_64.tar.gz"]);
  expect(Bun.spawnSync([bin, "check", "x"]).stdout.toString()).toBe("fake check x\n");
});

test("download refuses a build with the wrong checksum, a failed request or another OS", async () => {
  const bytes = tarball();
  const ok = async () => new Response(bytes);
  const opts = { platform: "linux", arch: "x64" };
  await expect(
    download("0.1.16", { "linux-x86_64": "0".repeat(64) }, { ...opts, fetch: ok }),
  ).rejects.toThrow(/checksum/);
  await expect(download("0.1.16", {}, { ...opts, fetch: ok })).rejects.toThrow(/checksum/);
  const gone = async () => new Response("", { status: 404 });
  await expect(
    download("0.1.16", { "linux-x86_64": sha(bytes) }, { ...opts, fetch: gone }),
  ).rejects.toThrow(/HTTP 404/);
  await expect(
    download("0.1.16", {}, { fetch: ok, platform: "darwin", arch: "arm64" }),
  ).rejects.toThrow(/HERDR_APP/);
});

test("checkMods runs herdr-app check on each mod with a mod.json and fails if one fails", () => {
  const root = mkdtempSync(join(tmpdir(), "herdr-mods-"));
  for (const m of ["good", "bad", "notamod"]) mkdirSync(join(root, "mods", m), { recursive: true });
  writeFileSync(join(root, "mods/good/mod.json"), "{}");
  writeFileSync(join(root, "mods/bad/mod.json"), "{}");
  const bin = join(root, "fake-herdr");
  writeFileSync(
    bin,
    '#!/bin/sh\necho "$@" >> "$(dirname "$0")/calls"\ncase "$2" in *bad) exit 1;; esac\n',
  );
  chmodSync(bin, 0o755);
  expect(checkMods(bin, root, "ignore")).toBe(1);
  expect(readFileSync(join(root, "calls"), "utf8").split("\n").filter(Boolean).sort()).toEqual([
    "check mods/bad",
    "check mods/good",
  ]);
  Bun.spawnSync(["rm", "-r", join(root, "mods/bad")]);
  expect(checkMods(bin, root, "ignore")).toBe(0);
});
