# herdr-app

bakers.build inside the Herdr Desktop app: mods that show a project's tickets and one
ticket's state next to the agent terminals, so a developer does not switch to the browser.

## Status

The tooling is in place (tests, lint, format, type check, CI); the only mod is a placeholder
(`mods/bakers/`). The proof of concept is built in the bakers-build repository under
`experimental/herdr-app/` (ticket BAKERS-187,
[pull request #148](https://github.com/bakers-build/bakers-build/pull/148)). This repository
is meant to become its home.

## Plan

- A `bakers` mod with four views: the board (tickets by state for a chosen project), the
  ticket in Herdr's right panel, a rail with a needs-you dot, and a confirm dialog for
  Cancel run, Freeze and Unfreeze.
- An installer that builds a `bakers` layout and a `bakers-tabs` tab bar from Herdr's `main`
  layout or a developer's own clone of it, and keeps that layout's own buttons and panels.
- Reads go through the bakers CLI tools. The only writes are cancelling a run and freezing
  or unfreezing a ticket, each behind a confirm dialog.
- The mod keeps no token and puts no ticket content in Herdr's shared state.

## Development

Needs [Bun](https://bun.sh) 1.4.4, the version Herdr uses:

```sh
curl -fsSL https://bun.sh/install | bash -s "bun-v1.4.4"
bun install
bun run check   # lint, format check, type check and tests; or `just check`
```

`bun run format` rewrites files to the house style. Which Herdr conventions this follows, and
where and why it deviates, is in [docs/conventions.md](docs/conventions.md).

## Not planned

- Changes to the Herdr Desktop app itself or to the bakers CLI.
