import { afterEach, expect, test } from "bun:test";
import { checkTitle } from "../scripts/release/pr-title";
import { releaseTarget } from "../scripts/release/target";
import { makeRepo, type Repo } from "./git-fixture";

const root = new URL("..", import.meta.url).pathname;

let repo: Repo | null = null;
afterEach(() => {
  repo?.remove();
  repo = null;
});
const fresh = () => {
  repo = makeRepo();
  return repo;
};

test("checkTitle accepts Conventional Commits titles", () => {
  expect(checkTitle("feat(ticket): x")).toBeNull();
  expect(checkTitle("chore(release): 0.2.0")).toBeNull();
  expect(checkTitle("fix!: drop y")).toBeNull();
});

test("checkTitle rejects other titles with the expected form", () => {
  for (const t of ["Add stuff", "feat:x", "feature: x", ""]) {
    const msg = checkTitle(t);
    expect(msg).toContain('"<type>(<scope>)!: <subject>"');
    expect(msg).toContain("feat, fix");
  }
});

test("the pr-title CLI reads PR_TITLE and exits 1 on a bad title", () => {
  const run = (title: string) =>
    Bun.spawnSync(["bun", `${root}scripts/release/pr-title.ts`], {
      env: { ...process.env, PR_TITLE: title },
    });
  expect(run("feat: ok").exitCode).toBe(0);
  const bad = run("$(echo pwned) nope");
  expect(bad.exitCode).toBe(1);
  expect(bad.stderr.toString()).toContain("PR title must be");
});

test("a merge commit on main releases its second parent", () => {
  const r = fresh();
  r.commit("chore: init");
  r.git("checkout", "-q", "-b", "next");
  const frozen = r.commit("feat: f");
  r.git("checkout", "-q", "main");
  r.merge("next");
  expect(releaseTarget({ cwd: r.dir, branch: "main" })).toEqual({ sha: frozen });
});

test("a non-merge commit on main without tags is the bootstrap", () => {
  const r = fresh();
  const head = r.commit("feat: a");
  expect(releaseTarget({ cwd: r.dir, branch: "main" })).toEqual({ sha: head });
});

test("a non-merge commit on main after a stable tag fails", () => {
  const r = fresh();
  r.commit("feat: a");
  r.tag("v0.1.0");
  r.commit("fix: direct push");
  expect(() => releaseTarget({ cwd: r.dir, branch: "main" })).toThrow(
    "main takes merge commits from release branches only",
  );
});

test("next releases HEAD as a pre-release", () => {
  const r = fresh();
  r.commit("chore: init");
  r.git("checkout", "-q", "-b", "next");
  const head = r.commit("feat: n");
  expect(releaseTarget({ cwd: r.dir, branch: "next" })).toEqual({ sha: head, pre: "next" });
});

test("the target CLI prints GITHUB_OUTPUT lines", () => {
  const r = fresh();
  r.commit("chore: init");
  r.git("checkout", "-q", "-b", "next");
  const head = r.commit("feat: n");
  const p = Bun.spawnSync(["bun", `${root}scripts/release/target.ts`, "next"], { cwd: r.dir });
  expect(p.exitCode).toBe(0);
  expect(p.stdout.toString()).toBe(`sha=${head}\npre=next\n`);
});
