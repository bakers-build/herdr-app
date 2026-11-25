// Installs the bakers mod into Herdr: syncs mods/bakers into the
// Herdr home ($HERDR_APP_HOME, else ~/.config/herdr-app), removing files the repo dropped,
// writes layouts/bakers.json from layouts/main.json (or --from <name>) and merges the bakers
// keys into keys.json without overwriting a binding the developer already has. When Herdr is
// open it is quit first and started again last: a running window writes its in-memory layout
// back over the file, and each copied file hot-reloads the mod, stranding its script tasks.
// Idempotent; --dry-run writes nothing and quits nothing.
//   bun run install:herdr [--dry-run] [--from <layout>]
import { cp, mkdir, readdir, readFile, rm, rmdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { bakersLayout, mergeKeys } from "./layout.js";

/** Runs `herdr-app <args>` for the Herdr home; `detach` starts it without waiting. */
export type Herdr = (
  args: string[],
  opts?: { detach?: boolean },
) => Promise<{ code: number; out: string }>;

type Options = {
  home?: string;
  from?: string;
  dryRun?: boolean;
  log?: (line: string) => void;
  herdr?: Herdr;
  platform?: NodeJS.Platform;
  pollMs?: number;
  timeoutMs?: number;
};

/**
 * The real herdr-app, aimed at `home`'s window; a missing binary means no Herdr. A call that
 * has not returned after `callMs` is killed, so a hung window counts as not answering.
 */
export function herdrApp(home: string, cmd = ["herdr-app"], callMs = 5_000): Herdr {
  return async (args, opts = {}) => {
    const env = { ...process.env, HERDR_APP_HOME: home };
    try {
      if (opts.detach) {
        Bun.spawn([...cmd, ...args], { env, stdio: ["ignore", "ignore", "ignore"] }).unref();
        return { code: 0, out: "" };
      }
      const p = Bun.spawn([...cmd, ...args], {
        env,
        stdout: "pipe",
        stderr: "pipe",
        timeout: callMs,
      });
      const [out, err, code] = await Promise.all([
        new Response(p.stdout).text(),
        new Response(p.stderr).text(),
        p.exited,
      ]);
      return { code, out: `${out}${err}`.trim() };
    } catch (e) {
      return { code: 127, out: String(e) };
    }
  };
}

/** Whether Herdr's window answers; a socket the sandbox denies is an error, not "closed". */
async function herdrRunning(o: Required<Options>): Promise<boolean> {
  const { code, out } = await o.herdr(["status"]);
  if (code === 0) return true;
  if (/operation not permitted/i.test(out))
    throw new Error(`cannot reach Herdr (${out}): run the installer outside a sandbox`);
  return false;
}

/** Quits Herdr, which flushes its layout, and waits until its window is gone. */
async function quitHerdr(o: Required<Options>) {
  o.log("Herdr is running: quitting it to install (terminals keep running)");
  // app.quit is macOS only; on Linux closing the window quits.
  await o.herdr(["do", o.platform === "darwin" ? "app.quit" : "window.close"]);
  const until = Date.now() + o.timeoutMs;
  while (await herdrRunning(o)) {
    if (Date.now() >= until) throw new Error("Herdr did not quit; quit it and run again");
    await Bun.sleep(o.pollMs);
  }
}

/** Files Herdr writes into a mod folder itself, at any depth; the sync keeps them. */
const GENERATED = new Set(["gpui-kit.d.ts", "jsconfig.json"]);

async function tree(dir: string, rel = ""): Promise<{ files: string[]; dirs: string[] }> {
  const out = { files: [] as string[], dirs: [] as string[] };
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(join(dir, rel), { withFileTypes: true });
  } catch (e) {
    // Only a missing folder is empty; an unreadable one must not pass as synced.
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return out;
    throw e;
  }
  for (const e of entries) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      const sub = await tree(dir, r);
      out.files.push(...sub.files);
      out.dirs.push(...sub.dirs, r);
    } else out.files.push(r);
  }
  return out;
}

/** Makes `to` hold exactly the files of `from`, plus the files Herdr generates. */
async function syncMod(name: string, from: string, to: string, o: Required<Options>) {
  const repo = new Set((await tree(from)).files);
  const installed = await tree(to);
  for (const rel of installed.files) {
    if (repo.has(rel) || GENERATED.has(rel.split("/").at(-1) ?? "")) continue;
    if (o.dryRun) o.log(`would remove mods/${name}/${rel}`);
    else {
      await rm(join(to, rel));
      o.log(`removed mods/${name}/${rel}`);
    }
  }
  if (o.dryRun) {
    o.log(`would copy mods/${name} to ${to}`);
    return;
  }
  // Deepest first; a folder that still holds files refuses and stays.
  for (const rel of installed.dirs) await rmdir(join(to, rel)).catch(() => {});
  await mkdir(to, { recursive: true });
  await cp(from, to, { recursive: true, force: true });
  o.log(`copied mods/${name} to ${to}`);
}

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
  const home =
    options.home ?? process.env.HERDR_APP_HOME ?? join(homedir(), ".config", "herdr-app");
  const o: Required<Options> = {
    home,
    from: options.from ?? "main",
    dryRun: options.dryRun ?? false,
    log: options.log ?? ((line) => console.log(line)),
    herdr: options.herdr ?? herdrApp(home),
    platform: options.platform ?? process.platform,
    pollMs: options.pollMs ?? 200,
    timeoutMs: options.timeoutMs ?? 15_000,
  };
  // fileURLToPath, not .pathname: an unpacked release may sit in a path with spaces.
  const repo = fileURLToPath(new URL("..", import.meta.url));
  const { version } = JSON.parse(await readFile(join(repo, "mods", "bakers", "mod.json"), "utf8"));
  o.log(`${o.dryRun ? "would install" : "installing"} bakers ${version}`);

  const running = await herdrRunning(o);
  if (!running || o.dryRun) {
    if (running) o.log("would quit Herdr, install and start it again");
    return installFiles(o, repo, String(version));
  }
  await quitHerdr(o);
  try {
    return await installFiles(o, repo, String(version));
  } finally {
    const start = await o.herdr([], { detach: true });
    o.log(
      start.code === 0
        ? "started Herdr again"
        : `could not start Herdr (${start.out}): run herdr-app`,
    );
  }
}

async function installFiles(o: Required<Options>, repo: string, version: string) {
  const written: string[] = [];
  for (const mod of ["bakers"]) {
    const to = join(o.home, "mods", mod);
    await syncMod(mod, join(repo, "mods", mod), to, o);
    if (!o.dryRun) written.push(to);
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
    `${
      o.dryRun
        ? "dry run: nothing written"
        : 'done: switch with layout.switch {"name": "bakers"} (cmd-shift-L)'
    } (bakers ${version})`,
  );
  return { written, conflicts, version };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const at = args.indexOf("--from");
  try {
    await install({ dryRun: args.includes("--dry-run"), from: at >= 0 ? args[at + 1] : undefined });
  } catch (e) {
    console.error(`install:herdr: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
}
