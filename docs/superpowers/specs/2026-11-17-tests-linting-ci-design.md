# Stricter checks, contract test and real Herdr types: design

Ticket: HERDRAPP-4 (chore, superpowers). Status: proposal, awaiting approval in the ticket.

## Intent

The checks from HERDRAPP-1 (CI job `test`: lint, format check, type check, `bun test`) let real
defects through, as the HERDRAPP-3 review showed: `undefined` access the type check never sees,
unused code and floating promises Biome never reports, a committed cache folder, and a fake
JSON:API server that accepts a boolean filter the real bakers server may read differently. This
work makes those defects fail before merge, and tests the mod's reads against the real server.

Acceptance criteria (from the ticket, unchanged):

- **AC1** `strictNullChecks` and `noImplicitAny` on in `jsconfig.json`, `bun run typecheck` green.
- **AC2** Biome errors on unused imports and variables, floating promises, and `console` in `mods/`.
- **AC3** CI checks the workflow file with `actionlint` and fails when cache or runtime folders
  (such as `.dropsh/`) are committed.
- **AC4** `bun test --coverage` in CI with a fixed minimum.
- **AC5** A contract test sends the reads of `mods/bakers/core/api.js` to the self-hosted bakers
  server (`ghcr.io/bakers-build/bakers-build`), with seed data and sign-in without a browser; if
  that is not solvable, the ticket documents the blocker.
- **AC6** `types/gpui-kit.d.ts` from a real Herdr install, and a check that reports when the
  Herdr types do not match the pinned Herdr version.
- **AC7** It is settled whether `herdr-app check` can run in CI (Linux binary or macOS runner);
  if yes, it runs there.
- **AC8** `bun run check` and the CI job `test` green.

## Goals, non-goals, anti-goals

- **Goals:** each AC above, with every new check also reachable locally through `bun run …`, so a
  developer sees the same failure CI shows.
- **Non-goals (ticket):** HERDRAPP-3 findings F1–F3, pixel/screenshot comparison, changes to Herdr
  Desktop or the bakers CLI.
- **Non-goal (agreed 2026-11-17):** the bakers provision profile for this project
  (`.bakers/project.config.js`, `WORKFLOW.md` `bb-phase-provision`). The requester sets it up
  separately from a handoff this work publishes; `working` then merges `main` into the branch.
- **Anti-goals:** a slow or flaky `test` job (the contract test never joins it); a check that
  reports green when it did not run (a skipped contract test or a missing Herdr install says
  so); silencing rules with blanket `biome-ignore` / `@ts-ignore` / `any` instead of fixing code.

## Constraints

- Mods stay plain ES-module JavaScript without a build (`docs/conventions.md`); types come from
  JSDoc.
- Toolchain stays pinned: Bun `1.4.4`, Biome `2.6.7`, TypeScript `7.0.2`, actions pinned to
  commit SHAs with a version comment, `permissions: contents: read`, `persist-credentials: false`.
- The CI check name `test` stays.
- Where a check has a counterpart in bakers-build, follow that logic (requester, 2026-11-16).
- `.bakers/` is read-only for runs.
- `working` runs on a conductor on the requester's Mac with Herdr installed (agreed 2026-11-17);
  the requester moves the ticket there.

## Design, part by part

### AC1 — strict type check

- `jsconfig.json`: remove `strictNullChecks: false` and `noImplicitAny: false` (so `strict`
  governs both).
- Fix every resulting error in `mods/`, `scripts/`, `tests/` with JSDoc types, null guards or
  narrowed types; no `@ts-ignore`, and `any` only where a value is truly unknown (parsed CLI
  output), commented.
- `docs/conventions.md`: the "Implicit any" row becomes Adopted, the "Type check" row loses
  `strictNullChecks: false`.

### AC2 — Biome rules

In `biome.json`, on top of `recommended`, as `error`:

- `correctness.noUnusedImports`, `correctness.noUnusedVariables`;
- `noFloatingPromises` (in the group Biome `2.6.7` places it);
- `suspicious.noConsole` for `mods/**` only (scripts and tests keep `console`).

Fix the code the rules report. A deliberate fire-and-forget call is written `void promise`.

### AC3 — workflow lint and repo hygiene

- **actionlint:** a CI step runs a pinned `actionlint` release (download with checksum, or the
  pinned `rhysd/actionlint` image by digest) over `.github/workflows/`. Locally:
  `bun run lint:actions`, which runs `actionlint` when installed and says so when it is not.
- **Hygiene:** `scripts/hygiene.ts` (`bun run hygiene`, part of `bun run check`) lists tracked
  files with `git ls-files` and fails, naming each path, when one matches a forbidden pattern:
  `.dropsh/`, `node_modules/`, `.bakers/log.txt`, `.bakers-worktrees/`, `mods/*/jsconfig.json`,
  `mods/*/*.d.ts`, `coverage/`, `*.log`. The list lives in the script with a test proving each
  pattern fails and a clean tree passes.

### AC4 — coverage floor

- `bunfig.toml` with `[test] coverageThreshold` (lines and functions); `bun run test` keeps fast
  output, `bun run test:coverage` runs `bun test --coverage` and is what CI runs.
- The floor is the coverage measured after AC1/AC2, rounded down to the next whole 5 %, written
  as a fixed number in `bunfig.toml`.
- Contract tests do not count toward it (they live outside `bun test`'s default run).

### AC5 — contract test against the real bakers server

- **One source in the repo, used by CI and by the provision profile:**
  - `tests/contract/compose.yml`: the `ghcr.io/bakers-build/bakers-build` image pinned by
    tag+digest, its database, a fresh volume per run, on a free local port.
  - `scripts/contract-up.ts`: starts the stack, waits until healthy, seeds a fixed data set
    (one project, tickets in several states, labels, comments, a closed ticket, a boolean field
    both true and false), creates a test user and a token without a browser, and prints
    `{ "base_url": …, "token": … }` as JSON.
  - `scripts/contract-down.ts`: removes the stack and its volume.
- **The test:** `tests/contract/api.contract.ts`, run by `bun run test:contract` (not matched by
  plain `bun test`). It reads `BAKERS_CONTRACT_URL` / `BAKERS_CONTRACT_TOKEN`, stubs only
  `exec` from `herdr` so `bakers auth token` returns them, and runs the real `core/api.js`:
  `read` with includes, `search` with `=`, `<>`, `CONTAINS`, `STARTS_WITH`, `IN`, `IS NULL`,
  `IS NOT NULL`, boolean `true`/`false`, relationship paths, sort and `all` paging. The cases are
  the ones the fake server answers in the unit tests, so a divergence of the fake shows up.
  Without the variables the suite reports itself **skipped**, never passed.
- **CI:** a separate job `contract` (ubuntu, Docker) running up → test → down; the `test` job is
  unchanged in speed.
- **First step in `working`:** find how a fresh container issues a user and token without a
  browser (Drush, an OAuth grant, a tools call). If none exists, AC5 ends as a blocker
  documented in the ticket with what was tried; the compose file and test stay, the CI job is
  left out.
- **Fix found by the test:** if the real server rejects the mod's boolean encoding (`1`/`0`), the
  fix to `core/api.js` and to the fake server belongs here, since it is what AC5 is for.
- **Handoff for the requester's provision profile** (a ticket comment, published in `working`):
  the up command and its JSON output, the port to expose, the down command and the variables the
  test reads.

### AC6 — real `gpui-kit.d.ts` and version check

- `package.json` gets `"herdr": { "version": "0.1.15" }`, the one place the Herdr version is
  pinned.
- `scripts/types-sync.ts` (`bun run types:sync`): copies `gpui-kit.d.ts` (and `herdr.d.ts`) from
  `$HERDR_APP_HOME` or `~/.config/herdr-app`, reads the installed Herdr version, and writes it
  as a first-line header `// herdr-app <version>` in each copied file. It fails, naming the
  path, when no install is found.
- `working` runs it on the Mac conductor and commits the result. If the Mac has no Herdr
  install, the shim stays and AC6 is reported open.
- A test in `bun test` compares the header of `types/gpui-kit.d.ts` and `types/herdr.d.ts` with
  the pinned version and fails on a mismatch or a missing header. It cannot tell that a pinned
  version is outdated; it tells that types and pin disagree.
- Removing the shim may surface new type errors in mods; they are fixed as part of AC1.

### AC7 — `herdr-app check` in CI

- On the Mac conductor, find out whether `herdr-app check` validates mods headless and where a
  pinned Herdr `v0.1.15` binary can be downloaded in CI (Linux server build or a macOS release).
- If a headless check works on a GitHub runner with a pinned, checksummed download: a job
  `herdr-check` runs it.
- If not: `docs/conventions.md` records the answer (what was tried, why it cannot run) and the
  ticket says so. Either outcome satisfies AC7.

### AC8 — all green

- `bun run check` = lint, format check, type check, hygiene, tests with coverage.
- CI job `test` runs the same steps plus actionlint; `contract` and (if possible) `herdr-check`
  are separate jobs.

## Order

AC1 → AC2 (code fixes first, they move coverage) → AC3 → AC6 (may add type errors) → AC4
(floor set last) → AC5 → AC7 → docs and handoff.

## Calls made by the designer (check these)

- **bakers-build as reference:** `working` reads bakers-build's own CI and check config
  (`github.com/bakers-build/bakers-build`, the repo the project's marketplace already uses) for
  hygiene patterns, actionlint delivery and coverage handling, and records in
  `docs/conventions.md` per check what was adopted or deviated, as the file does today. Where
  nothing matches, this design applies.
- **Triggers of the extra jobs:** `contract` and `herdr-check` run on `pull_request` and on
  `push` to `main` only (not every branch push), `timeout-minutes: 15`, Docker images pinned by
  digest. Making them required checks is a repository setting, outside this work.
- **AC6 file set:** `types:sync` copies every `.d.ts` Herdr writes into its home
  (`gpui-kit.d.ts`, `herdr.d.ts`, and `gpui-base.d.ts` if separate). If the real `gpui-kit.d.ts`
  declares the `gpui-base` module itself, `types/gpui-base.d.ts` and its `paths` entry are
  removed. The installed `herdr.d.ts` replaces the copy from the `v0.1.15` tag; every synced file
  carries the version header the check reads.

## Left to the builder

- Exact JSDoc types and refactors needed for AC1/AC2.
- actionlint delivery (binary or image), as long as it is pinned.
- The seed data's exact content and the compose service layout.
- The coverage floor value under the rule above.
