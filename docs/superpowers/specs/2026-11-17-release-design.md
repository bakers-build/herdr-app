# Releases of the bakers mod: design

Ticket: HERDRAPP-5. Status: proposal (plan state, 2026-11-17).

## Intent

The bakers mod has no version, tags or releases today. To install it, you clone the repo and run
`bun run install:herdr`. Releases should work as they do in bakers-build: `next` integrates,
`main` releases, a deployment ticket freezes a `next` SHA and merges it to `main` as
`chore(release): x.y.z`, and a `release` job on `main` tags `vx.y.z` and publishes the release.
Here the release is a GitHub release with a ZIP of the mod folder and its installer. A Herdr mod is
a plain folder of JavaScript, not an npm package.

Acceptance criteria (from the ticket, unchanged):

- **AC1** `bun run release:version <SHA> --notes -` prints the next version and the release notes
  since the last `v*` tag, computed from Conventional Commits. When there is nothing to release,
  it prints nothing.
- **AC2** A CI job `release` on `main` sets the tag `vx.y.z` and creates a GitHub release with the
  notes and a ZIP of `mods/bakers` and the installer.
- **AC3** The version is in `mod.json` and in the package; `bun run install:herdr` shows it.
- **AC4** CI enforces Conventional Commits PR titles.
- **AC5** The README explains how to download, install and update a release.
- **AC6** Releases run through deployment tickets with the `deploy-and-release` recipe. The parts
  of the recipe that don't fit herdr-app (`base_url` login check, `npm view`, GitLab) are decided
  and noted in `WORKFLOW.md`.
- **AC7** Branch model as in bakers-build: `next` is the base for feature tickets and `main` the
  release branch. Project configuration and merge targets are switched over.
- **AC8** `bun run check` and the CI job `test` are green.

## Decisions by the requester (2026-11-17, in the plan run)

- **Bootstrap release:** the `release` job runs on every push to `main`. Merging this ticket
  publishes the first release, `v0.1.0`. After that, releases go through deployment tickets.
- **Pre-releases:** every push to `next` with releasable commits publishes a GitHub pre-release
  `vX.Y.Z-next.N`.
- **Branch setup:** a maintainer creates `origin/next` after the merge, switches the project's base
  branch in bakers.build, the GitHub default branch and the required checks. Runs can only push
  their own ticket branch. This ticket ships the repo side and a checklist.

## Goals

- One version calculator, `scripts/release/version.ts`, used by the dry run (AC1), the release job
  (AC2), and the pre-release job.
- One packager, `scripts/release/package.ts`, that writes `dist/herdr-bakers-<version>.zip` with the
  version stamped into the packaged `mod.json`.
- CI: a `pr-title` job (AC4) and a `release` job on `main` and `next` (AC2), both in `ci.yml`.
- Installer and docs: the installer prints the version; README, `WORKFLOW.md` and
  `docs/conventions.md` describe the release flow.

## Non-goals

- The Herdr catalog (herdr.dev/mods, public repo, `RECIPE.md`, `preview.png`).
- `bakers herdr install` in the bakers CLI.
- Changes to Herdr Desktop.
- A CHANGELOG file in the repo. The notes live on the GitHub release only.
- Committing version bumps. The repo never carries the released version (see *Version in the
  repo*).

## Anti-goals (a failure even if it technically works)

- A release whose tag is not reachable from `next`. Then the next dry run on `next` would count
  every commit again and propose the wrong version.
- A release job that a newer push cancels halfway, leaving a tag without a release.
- A rerun that publishes twice, or fails because the tag already exists, instead of doing nothing.
- PR titles interpolated into a shell command (script injection).

## Version rules (Conventional Commits)

- **Commits counted:** `git log <base>..<SHA>`, merge commits skipped. Only a commit's first
  line is parsed as a header; its body is scanned only for a `BREAKING CHANGE:` /
  `BREAKING-CHANGE:` footer. Header-shaped lines in a body (a squash's list of branch commits)
  do not count. *(Builder's call: the PR title, enforced by AC4, decides the bump.)*
  `<base>` is the last stable tag reachable from `<SHA>` (`v<MAJOR>.<MINOR>.<PATCH>`, no `-`). If
  there is none, it is the root, with base version `0.0.0`.
- **Header format:** `type(scope)!: subject`, where the scope and `!` are optional. A
  `BREAKING CHANGE:` or `BREAKING-CHANGE:` footer also marks breaking.
- **Bumps:**

  | Commits | 0.x | ≥ 1.0 |
  |---|---|---|
  | breaking | minor | major |
  | `feat` | minor | minor |
  | `fix`, `perf` | patch | patch |

  The highest bump wins. Other types (`chore`, `docs`, `ci`, `test`, `refactor`, `style`, `build`,
  `revert`) and non-conforming lines release nothing. If no commit bumps, the output is empty and
  the exit code is 0.
- **Pre-release** (`--pre next`): the version is computed as above from the last stable tag. `N` is
  1 + the highest existing `v<version>-next.<n>` tag, read from all tags, not only reachable ones.
  The notes cover the commits since the last tag of either kind reachable from `<SHA>`. If none of
  those commits bumps, the output is empty.
- **CLI:** `bun run release:version <SHA> [--pre next] [--notes <file>|-]`. Line 1 of stdout is the
  version, without the `v`. With `--notes -`, a blank line and the notes follow on stdout. With
  `--notes <file>`, the notes are written to that file. A bad SHA or a git error exits non-zero on
  stderr.
- **Notes format (Markdown):** sections in this order, each only when non-empty:
  `### Breaking changes`, `### Features`, `### Fixes` (fix and perf). One bullet per commit:
  `- **scope:** subject (abc1234)`, or `- subject (abc1234)` without a scope. Commits keep
  `git log` order, newest first.

## Version in the repo

- `mods/bakers/mod.json` gets `"version": "0.0.0-dev"` in the repo. Herdr records a mod's
  `version` when it clones a mod (`types/herdr.d.ts`), so the key is legitimate.
- The packager copies `mods/bakers` to a staging directory and rewrites `version` in the staged
  `mod.json` to the release version. The ZIP carries the real version, and the repo never gets a
  bump commit. That is required, because `main` must merge the frozen SHA unchanged.
- "In the package" (AC3) is read as the release ZIP, not `package.json`, which stays without a
  `version`. *(Builder's call.)*
- `install:herdr` reads `version` from the `mod.json` it copies. It prints
  `installing bakers <version>` first and `installed bakers <version>` in the last line, also on
  `--dry-run` ("would install"). From a git checkout this shows `0.0.0-dev`; from a release, the
  release version.

## Package (ZIP)

`dist/herdr-bakers-<version>.zip` (`dist/` is git-ignored) with one top-level folder
`herdr-bakers-<version>/`:

```
herdr-bakers-<version>/
  mods/bakers/**          (mod.json stamped)
  scripts/install.ts
  scripts/layout.js
  README.md
```

The installer resolves the mod relative to its own file (`new URL("..", import.meta.url)`), so
`bun scripts/install.ts` works inside the unpacked folder without `bun install`. It imports only
`node:` modules and `./layout.js`. `package.ts` uses the system `zip`, which the Ubuntu runners
have. Usage: `bun run release:package <version>`, which prints the ZIP path.

## CI (`.github/workflows/ci.yml`)

- **Triggers:** `push` on every branch, as before. `pull_request` with types `opened`, `edited`,
  `synchronize` and `reopened`, so a title edit re-runs the title check.
- **Workflow concurrency:** `cancel-in-progress: ${{ github.ref != 'refs/heads/main' && github.ref
  != 'refs/heads/next' }}`. Release runs are never cancelled. The caches still save only on `main`.
- **`pr-title`** (pull_request only, `contents: read`): passes the title through `env:` (never
  `${{ }}` inside `run:`) to `bun scripts/release/pr-title.ts`. That script validates against the
  same header parser: one of the known types, an optional scope, an optional `!`, `: ` and a
  non-empty subject. Bad titles fail with a message that shows the expected form.
- **`release`** (push to `main` or `next` only; `needs: test`; `permissions: contents: write`;
  concurrency group `release-${{ github.ref }}`, no cancel):
  1. Checkout with `fetch-depth: 0` and `fetch-tags: true`, plus Bun as in `test`.
  2. **Target SHA:** on `main`, `HEAD^2` when `HEAD` is a merge commit (the frozen `next` SHA, so
     the tag is reachable from `next`). A non-merge `HEAD` is accepted only while no stable tag
     exists (the bootstrap `v0.1.0`). After that, a non-merge push to `main` fails the job with
     "main takes merge commits from release branches only" and releases nothing. There is no
     hotfix-on-`main` flow: fixes go through `next`. *(Builder's call.)* On `next`, `HEAD`.
  3. `bun run release:version <target> [--pre next on next] --notes notes.md`. If the output is
     empty, the job logs "nothing to release" and exits successfully. This also makes reruns
     idempotent, because the tag is already reachable.
  4. `bun run release:package <version>`.
  5. `gh release create v<version> dist/herdr-bakers-<version>.zip --target <target> --title
     v<version> --notes-file notes.md` with `GH_TOKEN: ${{ github.token }}`, plus `--prerelease`
     on `next`. `gh` creates the tag. The job logs the release URL and the asset name, which the
     deployment ticket reads with `forge_job_log`.
- Actions keep the existing commit pins. No new third-party action.

## Branch model and project configuration (AC7)

- **`.bakers/project.config.js`, forge `merge`:**
  - `next`: squash, delete source. The PR title becomes the commit, which is why AC4 matters.
  - `main`: merge commit, keep source (the recipe: "`main`: merge commit, source kept").
- `.github/dependabot.yml`: `target-branch: next`.
- **Maintainer checklist after merge** (README *Releases* and the PR body):
  1. Create `next` from `main` at the merge (`v0.1.0` is then reachable from both).
  2. Set the project's base branch in bakers.build to `next`.
  3. Set the GitHub default branch to `next`.
  4. Make `test` and `pr-title` required checks on `next` and `main`. Allow merge commits, and
     set the squash default commit message to "Pull request title and description".
  5. Create the release environment (`branch: main`; `base_url`: the repo's releases page, which is
     not checked) for deployment tickets.

## Deployment tickets (AC6) — `WORKFLOW.md`

A section that each `bb-phase-*` heading applies to tickets of type `deployment`. It records the
herdr-app replacements for `deploy-and-release`:

| Recipe | herdr-app |
|---|---|
| `pnpm --dir bakers-cli run release:version <SHA> --notes -` | `bun run release:version <SHA> --notes -` |
| `develop` | `next` |
| `min_client_version` check on breaking server commits | none, because there is no server |
| deploy watch + HTTP 200 from `<base_url>/user/login` | none, because nothing is deployed. Instead, the `release` job on the merge SHA is green (`forge_checks`), and its log (`forge_job_log`) shows `v<x.y.z>` and the ZIP |
| GitLab release in `links` | the GitHub release URL from the job log, in `links` |
| `npm view` at review | the GitHub release `v<x.y.z>` (not a pre-release) carries `herdr-bakers-<x.y.z>.zip`, and the tag points at the frozen SHA (`forge_fetch`, then `git rev-parse v<x.y.z>^{commit}`) |

## Docs

- **README:** a new *Releases* section with Download (latest release ZIP; pre-releases from `next`),
  Install (unzip, then `bun scripts/install.ts`), Update (download the newer ZIP and run the
  installer again; it overwrites the mod folder and keeps your keys), and how to check the
  installed version (`mods/bakers/mod.json`). *Install* keeps the git-checkout path for
  development. A short *Release flow* section covers `next` → `main`, the deployment ticket, the
  dry run and the maintainer checklist.
- **`docs/conventions.md`:** rows for Versioning, Release artifact, PR titles and Branch model.

## Left to the builder

- Internal module split under `scripts/release/` (parser, bump, notes, git access, CLI).
- How tests create throwaway git repos (temp dir + `git init`, local `user.name`/`email`).
- Exact log wording, apart from the lines named above.
