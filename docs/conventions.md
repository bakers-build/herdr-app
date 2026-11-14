# Conventions

How this repository builds and checks its mods, and where that follows Herdr.

Reference: [herdrdev/herdr-app](https://github.com/herdrdev/herdr-app) at tag `v0.1.15`
(commit `9950887`). The layout examples in `herdrdev/herdr-layout-examples` show the same mod
format.

| Item | Herdr | herdr-app | Adopted / Deviation | Reason |
|---|---|---|---|---|
| Mod format | Plain ES-module JavaScript, `mods/<name>/main.js` + `mod.json`, imports from `gpui-kit`, `gpui-base` and `herdr`; no build | The same, starting with the placeholder `mods/bakers/` | Adopted | Herdr loads mods as they are, so mods need no build or TypeScript. |
| Runtime version | Bun, pinned to `1.4.4` in CI | Bun `1.4.4`, pinned in `package.json` (`packageManager`, `engines`) and in CI; `bun.lock` committed | Adopted | Same runtime as Herdr's own scripts and tests. |
| Tests | `bun test` over `scripts/*.test.ts`; each test reads a mod's `main.js`, strips the imports, evaluates it with `new Function` over stubbed globals and asserts on the element tree | `bun test` over `tests/*.test.ts`, the same pattern (`tests/bakers.test.ts`) | Adopted | Tests a mod's real source without a Herdr window or core. |
| Type check | Herdr writes a `jsconfig.json` beside mods: `target`/`module` `ES2022`, `moduleResolution` `bundler`, `lib` `ES2022`, `checkJs`, `strict`, `strictNullChecks: false`, `noEmit` | `tsc -p jsconfig.json` (`bun run typecheck`) with the same options, a root `jsconfig.json`, `paths` to the vendored types, and `@types/bun` for the tests; TypeScript `7.0.2` accepts every option, so no older version is needed | Adopted | Mods are checked as Herdr's editor setup checks them. |
| Vendored types | `herdr.d.ts` ships in `defaults/`; `gpui-kit.d.ts` is generated at runtime from Herdr's component and style registries | `types/herdr.d.ts` is copied verbatim from `v0.1.15` (licence in `types/LICENSE-herdr`). `types/gpui-kit.d.ts` is a minimal hand-written shim | Deviation (shim) | The real `gpui-kit.d.ts` exists only in an installed Herdr. To replace the shim, copy `~/.config/herdr-app/gpui-kit.d.ts` from a Herdr install over `types/gpui-kit.d.ts`. |
| Lint / format | None for JavaScript (Rust only) | Biome `2.6.7` with the recommended preset: `bun run lint`, `bun run format:check`, `bun run format`. `types/`, `.bakers/` and Markdown are excluded | Deviation | The repository requires lint and format checks. One tool does both, with a single dev dependency, and it runs fast under Bun. |
| Editor config | None | `.editorconfig`: UTF-8, LF, final newline, trimmed whitespace, 2-space indent, matching Biome | Deviation | Herdr has none; this keeps editors in line with the formatter. |
| Task runner | `justfile` (`just test`, `just check`) | `justfile` with `test` and `check` recipes, which call the `bun run` scripts | Adopted | Same entry points as Herdr. CI calls the scripts directly, so `just` is optional. |
| CI triggers | `push` to `master` and every `pull_request` | `push` on every branch and every `pull_request` | Deviation | Every push is checked, as this repository requires. A branch with an open PR runs twice (push and PR). |
| CI jobs / check name | A per-platform test matrix plus an aggregate check named `test`; job `timeout-minutes` | A single Linux job named `test` (install, lint, format check, type check, test), `timeout-minutes: 10` | Adopted (check name, timeouts); Deviation (no matrix) | The mods are plain JavaScript with no native code, so one platform is enough. |
| CI permissions and pinning | `permissions: contents: read`; actions pinned to commit SHAs with a version comment; `persist-credentials: false`; `concurrency` cancels older runs per PR or ref | The same, with the same `actions/checkout` and `actions/cache` pins | Adopted | Herdr's org rules for supply-chain safety. |
| Caching | `actions/cache/restore` + `save`; only pushes to the default branch save; keys carry the pinned toolchain version | `~/.bun/install/cache`, keyed on Bun version and `bun.lock`; only pushes to `main` save | Adopted | PR caches can't evict the one everybody restores. `bun install --frozen-lockfile` runs after the restore, so a stale cache only slows a run. |
| Dependency updates | Dependabot for `github-actions`, monthly, grouped | The same file, verbatim | Adopted | Keeps the commit-pinned actions current. |
