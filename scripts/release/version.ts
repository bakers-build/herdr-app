// The next release version and its notes, from the Conventional Commits since the last tag.
//   bun run release:version <SHA> [--pre next] [--notes <file>|-]
// Line 1 of stdout is the version (no `v`); with `--notes -` a blank line and the notes follow.
// Nothing to release: empty output, exit 0. A bad SHA or a git error: exit 1 on stderr.
import { writeFileSync } from "node:fs";
import { bump, type Change, type Commit, renderNotes, toChange } from "./conventional";

function git(cwd: string, ...args: string[]): string {
  const r = Bun.spawnSync(["git", ...args], { cwd });
  if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr.toString().trim()}`);
  return r.stdout.toString().trim();
}

/** The nearest tag reachable from sha matching the pattern, or null when there is none. */
function lastTag(cwd: string, sha: string, stableOnly: boolean): string | null {
  const args = ["describe", "--tags", "--abbrev=0", "--match", "v[0-9]*"];
  if (stableOnly) args.push("--exclude", "*-*");
  const r = Bun.spawnSync(["git", ...args, sha], { cwd });
  return r.exitCode === 0 ? r.stdout.toString().trim() : null;
}

function changesSince(cwd: string, from: string | null, sha: string): Change[] {
  const range = from ? `${from}..${sha}` : sha;
  // %B, not %s: %s joins the whole first paragraph, but only the first line is the header.
  const out = git(cwd, "log", "--no-merges", "--format=%H%x1f%B%x1e", range);
  return out
    .split("\x1e")
    .map((rec) => rec.replace(/^\n/, ""))
    .filter((rec) => rec.length > 0)
    .map((rec): Commit => {
      const [sha, message = ""] = rec.split("\x1f");
      const at = message.indexOf("\n");
      return at < 0
        ? { sha, subject: message, body: "" }
        : { sha, subject: message.slice(0, at), body: message.slice(at + 1) };
    })
    .map(toChange)
    .filter((c): c is Change => c !== null);
}

export function nextRelease(opts: {
  cwd: string;
  sha: string;
  pre?: "next";
}): { version: string; notes: string } | null {
  const { cwd } = opts;
  const sha = git(cwd, "rev-parse", "--verify", `${opts.sha}^{commit}`);
  const stable = lastTag(cwd, sha, true);
  if (stable && !/^v\d+\.\d+\.\d+$/.test(stable))
    throw new Error(`tag ${stable} is not v<major>.<minor>.<patch>; delete or fix it`);
  const base = stable ? stable.slice(1) : "0.0.0";
  const version = bump(base, changesSince(cwd, stable, sha));
  if (!version) return null;
  if (!opts.pre) return { version, notes: renderNotes(changesSince(cwd, stable, sha)) };

  const since = changesSince(cwd, lastTag(cwd, sha, false), sha);
  if (!bump(base, since)) return null;
  const prefix = `v${version}-${opts.pre}.`;
  const taken = git(cwd, "tag", "-l", `${prefix}*`)
    .split("\n")
    .map((t) => Number(t.slice(prefix.length)))
    .filter((n) => Number.isInteger(n) && n > 0);
  const n = Math.max(0, ...taken) + 1;
  return { version: `${version}-${opts.pre}.${n}`, notes: renderNotes(since) };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const opt = (name: string) => {
    const at = args.indexOf(name);
    return at >= 0 ? args[at + 1] : undefined;
  };
  const sha = args[0];
  const pre = opt("--pre");
  const notes = opt("--notes");
  try {
    if (!sha || sha.startsWith("--"))
      throw new Error("usage: release:version <SHA> [--pre next] [--notes <file>|-]");
    if (pre !== undefined && pre !== "next") throw new Error(`--pre takes "next", not "${pre}"`);
    const rel = nextRelease({ cwd: process.cwd(), sha, pre: pre as "next" | undefined });
    if (rel) {
      if (notes === "-") process.stdout.write(`${rel.version}\n\n${rel.notes}`);
      else {
        if (notes) writeFileSync(notes, rel.notes);
        process.stdout.write(`${rel.version}\n`);
      }
    }
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
}
