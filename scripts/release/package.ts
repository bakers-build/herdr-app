// Builds the release ZIP: dist/herdr-bakers-<version>.zip with one top folder
// herdr-bakers-<version>/ holding mods/bakers (mod.json stamped with the version), the
// installer (scripts/install.ts, scripts/layout.js) and README.md. The repo's mod.json keeps
// its dev version, so a release never needs a bump commit.
//   bun run release:package <version>
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const FILES = ["mods/bakers", "scripts/install.ts", "scripts/layout.js", "README.md"];

export async function buildPackage(opts: {
  root: string;
  version: string;
  outDir: string;
}): Promise<string> {
  const name = `herdr-bakers-${opts.version}`;
  const stage = await mkdtemp(join(tmpdir(), "herdr-stage-"));
  try {
    for (const path of FILES)
      await cp(join(opts.root, path), join(stage, name, path), { recursive: true });
    const modJson = join(stage, name, "mods", "bakers", "mod.json");
    const mod = JSON.parse(await readFile(modJson, "utf8"));
    await writeFile(modJson, `${JSON.stringify({ ...mod, version: opts.version })}\n`);

    await mkdir(opts.outDir, { recursive: true });
    const zip = resolve(opts.outDir, `${name}.zip`);
    await rm(zip, { force: true });
    const r = Bun.spawnSync(["zip", "-qr", zip, name], { cwd: stage });
    if (r.exitCode !== 0) throw new Error(`zip failed: ${r.stderr.toString().trim()}`);
    return zip;
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const version = process.argv[2];
  if (!version || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(version)) {
    console.error("usage: release:package <version>, e.g. 0.1.0 or 0.2.0-next.1");
    process.exit(1);
  }
  const root = fileURLToPath(new URL("../..", import.meta.url));
  console.log(await buildPackage({ root, version, outDir: join(root, "dist") }));
}
