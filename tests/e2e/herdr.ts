// Driving the real Herdr window in the E2E run: the isolated environment, polling, and reading
// `herdr-app ls` / `status` and the window's shared.json (shapes: tests/fixtures/herdr-*.json).

import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type Env = Record<string, string | undefined>;

/** Selections of the developer's own bakers sign-in, never passed on. */
const DROPPED = /^(BAKERS_CONFIG|BAKERS_CONNECTION|BAKERS_HOME|DROPSH_.*)$/;

/**
 * The environment for Herdr and the bakers CLI: every home under `tmp` (HOME isolates
 * herdr-core and the CLI's session store, ~/.config/dropsh), the rest of `base` kept (PATH,
 * DISPLAY from xvfb-run).
 */
export function e2eEnv(base: Env, tmp: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(base)) if (v !== undefined && !DROPPED.test(k)) env[k] = v;
  return {
    ...env,
    HOME: join(tmp, "home"),
    HERDR_APP_HOME: join(tmp, "herdr"),
    BAKERS_HOME: join(tmp, "bakers"),
    BAKERS_CONNECTION: "e2e",
  };
}

/** Where the run's temp directory goes: macOS limits socket paths to 103 bytes. */
export function tempRoot(platform: string = process.platform): string {
  return platform === "darwin" ? "/tmp" : tmpdir();
}

/** Polls `probe` until it gives a non-null value; rejects after `ms` with the last error. */
export async function waitFor<T>(
  probe: () => Promise<T | null>,
  ms: number,
  what: string,
  every = 500,
): Promise<T> {
  const until = Date.now() + ms;
  let last = "";
  for (;;) {
    try {
      const v = await probe();
      if (v !== null && v !== undefined) return v;
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
    if (Date.now() >= until)
      throw new Error(`waited ${ms} ms for ${what}${last ? `; last error: ${last}` : ""}`);
    await Bun.sleep(every);
  }
}

/** The tab names of this computer's spaces in `herdr-app ls` (remote machines left out). */
export function tabNames(ls: any): string[] {
  return (ls?.spaces ?? [])
    .filter((s: any) => !s.machine)
    .flatMap((s: any) => (s.tabs ?? []).map((t: any) => String(t.name)));
}

/** The file and mod errors `herdr-app status` reports, as text. */
export function statusErrors(status: any): string[] {
  return (status?.errors ?? []).map((e: unknown) =>
    typeof e === "string" ? e : JSON.stringify(e),
  );
}

export function layoutName(status: any): string | null {
  return typeof status?.layout === "string" ? status.layout : null;
}

/** The window's mod shared state ($HERDR_APP_HOME/shared.json); {} when missing or broken. */
export function readShared(home: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(join(home, "shared.json"), "utf8"));
  } catch {
    return {};
  }
}

/** Runs `herdr-app <args>` (or any binary) and parses its JSON answer; json is null when none. */
export function herdrCli(
  bin: string,
  env: Record<string, string | undefined>,
  ...args: string[]
): { code: number; json: any; text: string } {
  const r = Bun.spawnSync([bin, ...args], { env, stderr: "pipe" });
  const text = r.stdout.toString();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // not JSON
  }
  return { code: r.exitCode ?? 1, json, text };
}

/**
 * The mod's pattern for a ticket tab's name (`<ID> <state>`), read from its source
 * (mods/bakers/ticket/register.js), so the test opens only tickets the mod names a tab after.
 */
export function ticketTabPattern(): RegExp {
  const src = readFileSync(join(import.meta.dir, "../../mods/bakers/ticket/register.js"), "utf8");
  const m = /define\("tab", "ticket",[\s\S]*?match: \/(.+)\/,/.exec(src);
  if (!m) throw new Error("no ticket tab pattern in mods/bakers/ticket/register.js");
  return new RegExp(m[1]);
}

/** `prefer` when the mod keys its tab, else the first of `ids` it keys; null when none. */
export function keyedTicket(ids: string[], prefer: string, pattern: RegExp): string | null {
  const keyed = (id: string) => pattern.test(`${id} x`);
  return keyed(prefer) ? prefer : (ids.find(keyed) ?? null);
}
