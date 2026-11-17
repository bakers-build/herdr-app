// Which commit a push releases. On `main` that is the merged release branch head (HEAD^2 of
// the merge commit: the frozen `next` SHA, so the tag stays reachable from `next`). A non-merge
// push to `main` is accepted only before the first stable tag (the bootstrap release). On
// `next` it is HEAD, as a pre-release.
//   bun scripts/release/target.ts <main|next>   → `sha=…` and `pre=next` lines for $GITHUB_OUTPUT

function git(cwd: string, ...args: string[]): string {
  const r = Bun.spawnSync(["git", ...args], { cwd });
  if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr.toString().trim()}`);
  return r.stdout.toString().trim();
}

export function releaseTarget(opts: { cwd: string; branch: "main" | "next" }): {
  sha: string;
  pre?: "next";
} {
  const { cwd } = opts;
  if (opts.branch === "next") return { sha: git(cwd, "rev-parse", "HEAD"), pre: "next" };
  const parents = git(cwd, "rev-list", "--parents", "-n", "1", "HEAD").split(" ");
  if (parents.length > 2) return { sha: parents[2] };
  const stable = git(cwd, "tag", "-l", "v[0-9]*")
    .split("\n")
    .filter((t) => t && !t.includes("-"));
  if (stable.length > 0) throw new Error("main takes merge commits from release branches only");
  return { sha: parents[0] };
}

if (import.meta.main) {
  const branch = process.argv[2];
  try {
    if (branch !== "main" && branch !== "next") throw new Error("usage: target.ts <main|next>");
    const t = releaseTarget({ cwd: process.cwd(), branch });
    process.stdout.write(`sha=${t.sha}\n${t.pre ? `pre=${t.pre}\n` : ""}`);
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
}
