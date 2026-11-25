# herdr-app

bakers.build inside the Herdr Desktop app: mods that show a project's tickets and one
ticket's state next to the agent terminals, so a developer does not switch to the browser.

## Status

The layout with the Tickets list (frame R2-4) and the right panel as the selected ticket's work
area are built as one mod, `bakers`. The panel shows the whole ticket (header, state,
description, comments, agent, properties, activity) and, below it, the live run of
that ticket with its terminal, 50/50 and resizable. A ticket never opens as a tab. Herdr places
the mod in several blocks, tabs and overlays; each copy gets a route (`ticket.list`,
`ticket.context`, `ticket.run`, `ticket.actions`,
`project.button`, ...), and the router runs that route's view. The code is split into a
small framework (logic: `core`, `form`, `list`; drawing: `ui`) and modules (`ticket`, `project`,
`shell`), each with its model, repository, commands, store, lists, view modes, forms,
operations, views and routes. See [docs/architecture.md](docs/architecture.md).

## Releases

Needs Herdr Desktop (started once), [Bun](https://bun.sh) and a signed-in `bakers` CLI on the
PATH.

**Download.** Take `herdr-bakers-<version>.zip` from the latest release on
<https://github.com/bakers-build/herdr-app/releases/latest>. Pre-releases
(`<version>-next.<n>`) are built from `next` and are marked as such.

**Install.** Unpack it and run the installer; it needs no `bun install`:

```sh
unzip herdr-bakers-<version>.zip
bun herdr-bakers-<version>/scripts/install.ts      # --dry-run shows what it would write
herdr-app do layout.switch --name bakers
```

The first line it prints is `installing bakers <version>`.

**Update.** Download the newer ZIP and run its installer the same way. It replaces the installed
mod files, removes the ones a newer release dropped and rewrites `layouts/bakers.json`; your keys
are kept. If Herdr is open, the installer quits it first and starts it again at the end, and says
so; your terminals keep running. An open window would otherwise write its old layout back and lose
the project while the mod reloads.

**Check the version.** The installed version is the `version` in
`~/.config/herdr-app/mods/bakers/mod.json` (`$HERDR_APP_HOME/mods/bakers/mod.json`). A copy
installed from a git checkout shows `0.0.0-dev`.

## Install

From a git checkout, for development. Needs Herdr Desktop (started once) and a signed-in `bakers`
CLI on the PATH.

```sh
bun install
bun run install:herdr            # --dry-run shows what it would write; --from <layout>
herdr-app do layout.switch --name bakers
```

The installer syncs the mod into `~/.config/herdr-app/mods/` (`$HERDR_APP_HOME` honored),
writes `layouts/bakers.json` from your `main` layout and adds the keys below to `keys.json`.
It never overwrites a key you already use; it prints the ones it kept. An open Herdr is quit
and started again, as under *Update*. Run it outside a sandbox: if it cannot reach Herdr's
socket, it stops before writing anything.

## Keys

| Key | What it does |
|---|---|
| cmd-B | Herdr's sidebar (Spaces and Agents; the mod adds no box to it) |
| cmd-shift-T | Ticket panel: the selected ticket and its live run; Edit... on Description, Acceptance and Summary opens a popup: cmd-Enter saves, Esc cancels |
| cmd-shift-O | Go to ticket |
| cmd-shift-B | Tickets tab |
| cmd-shift-N | New ticket |
| cmd-K | Actions of the selected ticket (on the Tickets tab or while the panel shows it) and the bakers commands |
| Tickets tab | Up/Down select (the panel follows), Enter, cmd-Enter or a double click show the ticket in the panel, `/` filter, N new ticket, R refresh; the filter bar narrows the list: Needs me, Mine, State, Label, Type, Clear |
| Ticket panel (once clicked into) | A acts on the Needs-you card, E edits, G shows the agent and focuses its run, R moves the run; in the edit form cmd-Enter saves, Esc cancels |

The panel takes half the work area beside the list, also while a run shows; a dragged width
stays. Hide in the run's header leaves the run alone and gives the ticket the full
height until Show agent (G).

The run's header is a tab bar: the agent's tab `Run <n>` first, then `Shell 1`, `Shell 2`, ...
each with a close control, then Execute and Hide. Execute (only for a live run with a known
folder) starts the machine's own shell in the run's folder, local or on the run's machine, as a
new tab; focus stays where it is, and a failure shows a toast. The header shows the shown
terminal's address and machine. Shells belong to their ticket, stay when you select another
ticket and come back, and leave when they exit. When the run ends they keep running unseen and
return with the next run; Close or their own exit ends them.

Every change of state, freeze, move or cancel asks first; Esc writes nothing.

## Data

Reads go to the bakers JSON:API with your own sign-in: the mod asks `bakers auth token` (CLI
0.10.1-next.11 or later) for a short-lived token, keeps it in memory only and asks again
after a 401. With an older CLI it reads through `bakers dropsh` instead. Writes (comment,
edit, state, freeze, move, cancel, classify, labels) go through `bakers tools`.
The mod puts no ticket content into Herdr's shared state.

Mine is the tickets assigned to you: the mod reads the signed-in user from the API. Only when
that fails is Mine disabled and shown with the "API" chip. Still shown with the chip: the
allowed transitions (the state menu lists every state; the server refuses what the workflow
forbids). Assignee, reviewers, the closing date, the conductor list, the machine and activity
come from JSON:API.

Screenshots for the pixel comparison: [docs/screenshots.md](docs/screenshots.md). The Herdr
files this follows: [docs/herdr-reference.md](docs/herdr-reference.md).

## Development

Needs [Bun](https://bun.sh) 1.4.4, the version Herdr uses:

```sh
curl -fsSL https://bun.sh/install | bash -s "bun-v1.4.4"
bun install
bun run check   # every check below, as CI runs them; or `just check`
```

### Checks

`bun run check` runs, in order (CI job `test` runs the same steps):

- Actionlint (CI step; `bun run lint:ci` runs the same pinned image locally, needs Docker):
  the workflow files, including shellcheck on their `run:` scripts.
- `bun run lint`: Biome; unused imports and variables, floating promises and `console` in `mods/`
  are errors.
- `bun run format:check`: Biome formatting.
- `bun run typecheck`: `tsc` with `strictNullChecks` and `noImplicitAny` against the vendored
  Herdr types in `types/`.
- `bun run hygiene`: no committed cache, runtime or Herdr-written file (`.dropsh/`, `dist/`,
  `coverage/`, `mods/**/gpui-kit.d.ts`, ...).
- `bun run herdr-types`: the vendored Herdr types match `types/herdr-version.json`, and so does an
  installed `herdr-app`.
- `bun run test:contract` (CI job `contract`; needs Docker, not part of `check`): starts the bakers
  server from its release image on SQLite, seeds its e2e test world, and runs
  `tests/contract/*.test.ts`, the mod's JSON:API reads, against it with a real token.
- `bun run herdr-check` (CI job `herdr-check`, not part of `check`): loads each mod in the pinned
  Herdr (`herdr-app check`), which renders its eager elements in a hidden window. Uses `HERDR_APP`
  or an installed `herdr-app`; otherwise (Linux, as in CI) it downloads the pinned build from
  `releases.herdr.dev` and verifies its checksum (`types/herdr-version.json`).
- `bun run test`: `bun test --coverage`, then a repo-wide floor (lines 92 %, functions 90 %) that
  also fails on a source file no test loads. To run one file, use `bun test <file>`.

`bun run format` rewrites files to the house style. Which Herdr conventions this follows, and
where and why it deviates, is in [docs/conventions.md](docs/conventions.md).

## Release flow

As in bakers-build: `next` is the integration branch, `main` the release branch.

- Feature tickets branch from `next` and squash-merge into it; the PR title becomes the commit, so
  CI (`pr-title`) requires a Conventional Commits title (`feat(scope): …`, `fix: …`, `…!:` for
  breaking).
- The version comes from those commits since the last `v*` tag: breaking → minor while 0.x, major
  from 1.0; `feat` → minor; `fix`/`perf` → patch; other types release nothing. The repo's
  `mod.json` stays at `0.0.0-dev`; the release ZIP carries the real version.
- Dry run: `bun run release:version <SHA> --notes -` prints the next version and the notes, or
  nothing when there is nothing to release. `bun run release:package <version>` builds the ZIP into
  `dist/`.
- Every push to `next` with releasable commits publishes a pre-release `v<x.y.z>-next.<n>`.
- A deployment ticket (recipe `deploy-and-release`) freezes a SHA of `next` and merges it into `main`
  as `chore(release): <x.y.z>` with a merge commit. The `release` job on `main` tags that SHA
  `v<x.y.z>` and creates the GitHub release with the notes and the ZIP. `WORKFLOW.md` lists what
  herdr-app uses instead of the recipe's deploy, login and `npm view` checks.

Maintainer checklist, once, after the release flow lands on `main`:

1. Create `next` from `main` at that merge (`v0.1.0` is then reachable from both).
2. Set the project's base branch in bakers.build to `next`, and the forge merge rules in
   `.bakers/project.config.js` to `next`: squash, delete source; `main`: merge commit, keep source.
3. Set the GitHub default branch to `next`.
4. Make `test` and `pr-title` required checks on `next` and `main`. Allow merge commits, and set the
   squash default commit message to "Pull request title and description".
5. Create the release environment (`branch: main`; `base_url`: the repo's releases page, which is
   not checked) for deployment tickets.

## Not planned

- Changes to the Herdr Desktop app itself or to the bakers CLI.
