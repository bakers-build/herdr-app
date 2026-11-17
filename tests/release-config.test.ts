import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("dependabot opens its PRs against next", () => {
  expect(read(".github/dependabot.yml")).toContain("target-branch: next");
});

test("WORKFLOW.md notes the deployment-ticket replacements", () => {
  const w = read("WORKFLOW.md");
  expect(w.split("\n")[0]).toBe("# herdr-app — WORKFLOW");
  expect(w).toContain("Invoke `bakers:bb-workflow`");
  for (const heading of ["## bb-phase-work", "## bb-phase-deliver", "## bb-phase-transition"])
    expect(w).toContain(heading);
  for (const term of [
    "bun run release:version <SHA> --notes -",
    "`next`",
    "min_client_version",
    "/user/login",
    "forge_job_log",
    "GitHub release",
    "npm view",
    "herdr-bakers-<x.y.z>.zip",
    "--pre",
  ])
    expect(w).toContain(term);
});

test("the README explains downloading, installing and updating a release", () => {
  const r = read("README.md");
  for (const term of [
    "## Releases",
    "## Release flow",
    "releases/latest",
    "/scripts/install.ts",
    "Update",
    "mods/bakers/mod.json",
    "bun run release:version",
  ])
    expect(r).toContain(term);
});

test("conventions.md records the release conventions", () => {
  const c = read("docs/conventions.md");
  for (const row of ["| Versioning |", "| Release artifact |", "| PR titles |", "| Branch model |"])
    expect(c).toContain(row);
});
