// Throwaway git repositories for the release tests: a temp dir with `git init -b main`, a
// local identity and no signing, so the tests never touch the developer's git config.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type Repo = {
  dir: string;
  git: (...args: string[]) => string;
  commit: (message: string) => string;
  tag: (name: string, sha?: string) => void;
  merge: (branch: string) => string;
  remove: () => void;
};

export function makeRepo(): Repo {
  const dir = mkdtempSync(join(tmpdir(), "herdr-release-"));
  const git = (...args: string[]) => {
    const r = Bun.spawnSync(["git", ...args], {
      cwd: dir,
      env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" },
    });
    if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr.toString()}`);
    return r.stdout.toString().trim();
  };
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.invalid");
  git("config", "commit.gpgsign", "false");
  git("config", "tag.gpgsign", "false");
  return {
    dir,
    git,
    commit: (message) => {
      git("commit", "-q", "--allow-empty", "-m", message);
      return git("rev-parse", "HEAD");
    },
    tag: (name, sha = "HEAD") => {
      git("tag", name, sha);
    },
    merge: (branch) => {
      git("merge", "-q", "--no-ff", "-m", `chore(release): merge ${branch}`, branch);
      return git("rev-parse", "HEAD");
    },
    remove: () => rmSync(dir, { recursive: true, force: true }),
  };
}
