import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const text = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const ci: any = Bun.YAML.parse(text);
const steps = (job: string): any[] => ci.jobs[job].steps;
const runs = (job: string) => steps(job).map((s) => String(s.run ?? ""));

test("pull requests rerun on title edits", () => {
  expect(ci.on.pull_request.types).toEqual(["opened", "edited", "synchronize", "reopened"]);
  expect(ci.on).toHaveProperty("push");
});

test("the test job keeps its name", () => {
  expect(ci.jobs.test).toBeDefined();
  expect(runs("test").some((r) => r.includes("bun run test"))).toBe(true);
});

test("pr-title passes the title only through env", () => {
  const job = ci.jobs["pr-title"];
  expect(job.if).toContain("pull_request");
  const check = steps("pr-title").find((s) => String(s.run ?? "").includes("pr-title.ts"));
  // biome-ignore lint/suspicious/noTemplateCurlyInString: a literal GitHub/shell expression
  expect(check.env.PR_TITLE).toBe("${{ github.event.pull_request.title }}");
  for (const job of Object.keys(ci.jobs))
    for (const run of runs(job)) expect(run).not.toContain("github.event.pull_request.title");
});

test("release runs after test on pushes to main and next, never cancelled", () => {
  const job = ci.jobs.release;
  expect(job.needs).toBe("test");
  expect(job.permissions).toEqual({ contents: "write" });
  expect(job.concurrency.group).toStartWith("release-");
  expect(job.concurrency["cancel-in-progress"]).toBe(false);
  expect(job.if).toContain("github.event_name == 'push'");
  expect(job.if).toContain("refs/heads/main");
  expect(job.if).toContain("refs/heads/next");
});

test("release checks out the full history and creates the GitHub release", () => {
  const checkout = steps("release").find((s) =>
    String(s.uses ?? "").startsWith("actions/checkout"),
  );
  expect(checkout.with["fetch-depth"]).toBe(0);
  expect(checkout.with["fetch-tags"]).toBe(true);
  const all = runs("release").join("\n");
  expect(all).toContain("scripts/release/target.ts");
  expect(all).toContain("scripts/release/version.ts");
  expect(all).toContain("scripts/release/package.ts");
  expect(all).toContain("nothing to release");
  expect(all).toMatch(/gh release create "v\$VERSION" "dist\/herdr-bakers-\$VERSION\.zip"/);
  expect(all).toContain('--target "$SHA"');
  // biome-ignore lint/suspicious/noTemplateCurlyInString: a literal GitHub/shell expression
  expect(all).toContain("${PRE:+--prerelease}");
  const create = steps("release").find((s) => String(s.run ?? "").includes("gh release create"));
  // biome-ignore lint/suspicious/noTemplateCurlyInString: a literal GitHub/shell expression
  expect(create.env.GH_TOKEN).toBe("${{ github.token }}");
});

test("workflow runs on main and next are not cancelled", () => {
  const cancel = String(ci.concurrency["cancel-in-progress"]);
  expect(cancel).toContain("refs/heads/main");
  expect(cancel).toContain("refs/heads/next");
});

test("the test job checks repo hygiene, the Herdr types and coverage", () => {
  const named = (name: string) => steps("test").find((s) => s.name === name);
  expect(named("Hygiene")?.run).toBe("bun run hygiene");
  expect(named("Herdr types")?.run).toBe("bun run herdr-types");
  // bun run test is bun test --coverage plus the floor check (package.json).
  expect(named("Test")?.run).toBe("bun run test");
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  expect(pkg.scripts.test).toBe("bun test --coverage && bun run coverage");
});

test("the test job lints the workflows with actionlint pinned by version and digest", () => {
  const step = steps("test").find((s) => s.name === "Actionlint");
  expect(step?.run).toMatch(
    /^docker run --rm .*rhysd\/actionlint:\d+\.\d+\.\d+@sha256:[0-9a-f]{64} /,
  );
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  // The local script runs the same image as CI.
  const image = step.run.match(/rhysd\/actionlint:\S+/)[0];
  expect(pkg.scripts["lint:ci"]).toContain(image);
});

test("the contract job runs the contract test with read-only rights", () => {
  const job = ci.jobs.contract;
  expect(job).toBeDefined();
  expect(job["runs-on"]).toBe("ubuntu-latest");
  expect(job["timeout-minutes"]).toBeLessThanOrEqual(20);
  expect(job.permissions ?? ci.permissions).toEqual({ contents: "read" });
  expect(runs("contract")).toContain("bun run test:contract");
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  expect(pkg.scripts["test:contract"]).toBe("bun tests/contract/run.ts");
});
