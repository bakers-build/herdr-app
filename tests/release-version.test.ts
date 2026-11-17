import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { nextRelease } from "../scripts/release/version";
import { makeRepo, type Repo } from "./git-fixture";

const script = new URL("../scripts/release/version.ts", import.meta.url).pathname;

let repo: Repo | null = null;
afterEach(() => {
  repo?.remove();
  repo = null;
});
const fresh = () => {
  repo = makeRepo();
  return repo;
};
const cli = (r: Repo, ...args: string[]) => {
  const p = Bun.spawnSync(["bun", script, ...args], { cwd: r.dir });
  return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
};

test("bootstraps from 0.0.0 without tags", () => {
  const r = fresh();
  r.commit("chore: init");
  r.commit("feat: a");
  r.commit("fix: b");
  const rel = nextRelease({ cwd: r.dir, sha: "HEAD" });
  expect(rel?.version).toBe("0.1.0");
  expect(rel?.notes).toContain("### Features");
  expect(rel?.notes).toContain("- a (");
  expect(rel?.notes).toContain("### Fixes");
  expect(rel?.notes).toContain("- b (");
});

test("bumps from the last stable tag", () => {
  const r = fresh();
  r.commit("feat: a");
  r.tag("v0.1.0");
  r.commit("fix: c");
  const rel = nextRelease({ cwd: r.dir, sha: "HEAD" });
  expect(rel?.version).toBe("0.1.1");
  expect(rel?.notes).toContain("- c (");
  expect(rel?.notes).not.toContain("- a (");
});

test("prints nothing once the SHA is tagged", () => {
  const r = fresh();
  r.commit("feat: a");
  r.tag("v0.1.0");
  r.commit("fix: b");
  r.tag("v0.1.1");
  expect(nextRelease({ cwd: r.dir, sha: "HEAD" })).toBeNull();
  const { code, out } = cli(r, "HEAD", "--notes", "-");
  expect(out).toBe("");
  expect(code).toBe(0);
});

test("prints nothing for chores only", () => {
  const r = fresh();
  r.commit("feat: a");
  r.tag("v0.1.0");
  r.commit("chore: tidy");
  r.commit("docs: readme");
  expect(nextRelease({ cwd: r.dir, sha: "HEAD" })).toBeNull();
});

test("skips merge commits", () => {
  const r = fresh();
  r.commit("chore: init");
  r.git("checkout", "-q", "-b", "next");
  r.commit("chore: on next");
  r.git("checkout", "-q", "main");
  r.git("merge", "-q", "--no-ff", "-m", "feat: merge looks like a header", "next");
  expect(nextRelease({ cwd: r.dir, sha: "HEAD" })).toBeNull();
});

function withPreTag(r: Repo) {
  r.commit("feat: a");
  r.tag("v0.1.0");
  r.commit("feat: d");
  r.tag("v0.2.0-next.1");
  r.commit("fix: e");
}

test("ignores pre-release tags for the stable base", () => {
  const r = fresh();
  withPreTag(r);
  const rel = nextRelease({ cwd: r.dir, sha: "HEAD" });
  expect(rel?.version).toBe("0.2.0");
  expect(rel?.notes).toContain("- d (");
  expect(rel?.notes).toContain("- e (");
});

test("numbers pre-releases", () => {
  const r = fresh();
  withPreTag(r);
  const rel = nextRelease({ cwd: r.dir, sha: "HEAD", pre: "next" });
  expect(rel?.version).toBe("0.2.0-next.2");
  expect(rel?.notes).toContain("- e (");
  expect(rel?.notes).not.toContain("- d (");
});

test("a pre-release prints nothing once tagged or with chores only since", () => {
  const r = fresh();
  withPreTag(r);
  r.tag("v0.2.0-next.2");
  expect(nextRelease({ cwd: r.dir, sha: "HEAD", pre: "next" })).toBeNull();
  r.commit("chore: tidy");
  expect(nextRelease({ cwd: r.dir, sha: "HEAD", pre: "next" })).toBeNull();
});

test("sees the tag on the frozen SHA from next", () => {
  const r = fresh();
  r.commit("chore: init");
  r.git("checkout", "-q", "-b", "next");
  r.commit("feat: f");
  r.git("checkout", "-q", "main");
  r.merge("next");
  r.tag("v0.3.0", "HEAD^2");
  r.git("checkout", "-q", "next");
  r.commit("feat: g");
  const rel = nextRelease({ cwd: r.dir, sha: "HEAD" });
  expect(rel?.version).toBe("0.4.0");
  expect(rel?.notes).not.toContain("- f (");
});

test("the CLI prints the version and notes with --notes -", () => {
  const r = fresh();
  r.commit("feat: a");
  const { code, out } = cli(r, "HEAD", "--notes", "-");
  expect(code).toBe(0);
  expect(out.startsWith("0.1.0\n\n### Features\n\n- a (")).toBe(true);
});

test("the CLI writes the notes to a file and prints only the version", () => {
  const r = fresh();
  r.commit("feat: a");
  const file = join(r.dir, "notes.md");
  const { code, out } = cli(r, "HEAD", "--notes", file);
  expect(code).toBe(0);
  expect(out).toBe("0.1.0\n");
  expect(readFileSync(file, "utf8")).toContain("### Features");
});

test("the CLI takes --pre next", () => {
  const r = fresh();
  withPreTag(r);
  expect(cli(r, "HEAD", "--pre", "next").out).toBe("0.2.0-next.2\n");
});

test("the CLI fails on a bad SHA", () => {
  const r = fresh();
  r.commit("feat: a");
  const { code, out, err } = cli(r, "nope");
  expect(code).toBe(1);
  expect(out).toBe("");
  expect(err).not.toBe("");
});

test("only the first line of a message is the subject", () => {
  const r = fresh();
  r.commit("fix: multi\nsecond line without blank");
  expect(nextRelease({ cwd: r.dir, sha: "HEAD" })?.notes).toContain("- multi (");
  expect(nextRelease({ cwd: r.dir, sha: "HEAD" })?.notes).not.toContain("second line");
});

test("a malformed stable tag fails instead of releasing NaN", () => {
  const r = fresh();
  r.commit("feat: a");
  r.tag("v1.2");
  r.commit("fix: b");
  expect(() => nextRelease({ cwd: r.dir, sha: "HEAD" })).toThrow("v1.2");
});
