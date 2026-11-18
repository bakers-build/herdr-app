// Fails when a tracked file is a cache, runtime, build or Herdr-written file that only
// belongs in a working copy (the HERDRAPP-3 review found a committed `.dropsh/cache`).
//   bun scripts/check/hygiene.ts   → exit 1 and the offending paths on stderr

const FORBIDDEN: RegExp[] = [
  /^\.dropsh\//,
  /^\.bakers\/log\.txt$/,
  /^\.bakers-worktrees\//,
  /(^|\/)node_modules\//,
  /^dist\//,
  /^coverage\//,
  /^assets-ai\//,
  // Herdr writes gpui-kit.d.ts and jsconfig.json into every mod folder that imports gpui-kit.
  /^mods\/.*\.d\.ts$/,
  /^mods\/.*\/jsconfig\.json$/,
];

export function forbidden(paths: string[]): string[] {
  return paths.filter((p) => FORBIDDEN.some((re) => re.test(p)));
}

if (import.meta.main) {
  const r = Bun.spawnSync(["git", "ls-files", "-z"]);
  if (r.exitCode !== 0) {
    process.stderr.write(`git ls-files: ${r.stderr.toString()}`);
    process.exit(2);
  }
  const bad = forbidden(r.stdout.toString().split("\0").filter(Boolean));
  if (bad.length > 0) {
    process.stderr.write(
      `These tracked files must not be committed; remove them with git rm --cached:\n${bad.map((p) => `  ${p}\n`).join("")}`,
    );
    process.exit(1);
  }
}
