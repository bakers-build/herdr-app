// Installs the bakers mods into Herdr: copies mods/bakers and mods/bakers-tabs into the
// Herdr home ($HERDR_APP_HOME, else ~/.config/herdr-app), writes layouts/bakers.json from
// layouts/main.json (or --from <name>) and merges the bakers keys into keys.json without
// overwriting a binding the developer already has. Idempotent; --dry-run writes nothing.
//   bun run install:herdr [--dry-run] [--from <layout>]
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { bakersLayout, mergeKeys } from "../mods/bakers/lib/layout.js";

type Options = { home?: string; from?: string; dryRun?: boolean; log?: (line: string) => void };

async function read(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

/** Writes text when it differs, refusing when the file changed since it was read. */
async function update(
  path: string,
  before: string | null,
  text: string,
  o: Required<Options>,
  written: string[],
) {
  if (before === text) return;
  if (o.dryRun) {
    o.log(`would write ${path}`);
    return;
  }
  if ((await read(path)) !== before) throw new Error(`${path} changed while installing; run again`);
  await writeFile(path, text);
  written.push(path);
  o.log(`wrote ${path}`);
}

export async function install(options: Options = {}) {
  const o: Required<Options> = {
    home: options.home ?? process.env.HERDR_APP_HOME ?? join(homedir(), ".config", "herdr-app"),
    from: options.from ?? "main",
    dryRun: options.dryRun ?? false,
    log: options.log ?? ((line) => console.log(line)),
  };
  const written: string[] = [];
  const repo = new URL("..", import.meta.url).pathname;

  for (const mod of ["bakers", "bakers-tabs"]) {
    const to = join(o.home, "mods", mod);
    if (o.dryRun) o.log(`would copy mods/${mod} to ${to}`);
    else {
      await mkdir(to, { recursive: true });
      await cp(join(repo, "mods", mod), to, { recursive: true, force: true });
      written.push(to);
      o.log(`copied mods/${mod} to ${to}`);
    }
  }

  const source = await read(join(o.home, "layouts", `${o.from}.json`));
  if (source === null)
    throw new Error(`no layouts/${o.from}.json in ${o.home}: start Herdr once first`);
  const target = join(o.home, "layouts", "bakers.json");
  const layout = `${JSON.stringify(bakersLayout(JSON.parse(source)), null, 2)}\n`;
  await update(target, await read(target), layout, o, written);

  const keysPath = join(o.home, "keys.json");
  const keysBefore = await read(keysPath);
  const { keys, conflicts } = mergeKeys(keysBefore ? JSON.parse(keysBefore) : {});
  for (const c of conflicts) o.log(`kept your key: ${c}`);
  const keysText = `${JSON.stringify(keys, null, 2)}\n`;
  if (keysBefore === null || JSON.stringify(JSON.parse(keysBefore)) !== JSON.stringify(keys))
    await update(keysPath, keysBefore, keysText, o, written);

  o.log(
    o.dryRun
      ? "dry run: nothing written"
      : 'done: switch with layout.switch {"name": "bakers"} (cmd-shift-L)',
  );
  return { written, conflicts };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const at = args.indexOf("--from");
  await install({ dryRun: args.includes("--dry-run"), from: at >= 0 ? args[at + 1] : undefined });
}
