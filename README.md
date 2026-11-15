# herdr-app

bakers.build inside the Herdr Desktop app: mods that show a project's tickets and one
ticket's state next to the agent terminals, so a developer does not switch to the browser.

## Status

The layout with the Tickets tab (frame R2-4) and the ticket tab (frame R2-3) of the wireframe
canvas are built as two mods: `bakers` (one mod routed by `props().view`: rail, sidebar,
status, list, ticket, panel, goto, picker, confirm, new-ticket) and `bakers-tabs` (Herdr's
tab bar with the Tickets tab, the italic preview tab and the needs-you dot). The proof of
concept lives in the bakers-build repository under `experimental/herdr-app/`.

## Install

Needs Herdr Desktop (started once) and a signed-in `bakers` CLI on the PATH.

```sh
bun install
bun run install:herdr            # --dry-run shows what it would write; --from <layout>
herdr-app do layout.switch --name bakers
```

The installer copies both mods into `~/.config/herdr-app/mods/` (`$HERDR_APP_HOME` honored),
writes `layouts/bakers.json` from your `main` layout and adds the keys below to `keys.json`.
It never overwrites a key you already use; it prints the ones it kept.

## Keys

| Key | What it does |
|---|---|
| cmd-B | sidebar with the bakers section |
| cmd-shift-T | Ticket panel (the context of the focused ticket tab or the selected row) |
| cmd-shift-O | Go to ticket |
| cmd-shift-B | Tickets tab |
| cmd-shift-N | New ticket |
| Tickets tab | Up/Down select, Enter preview tab, cmd-Enter pinned tab, `/` filter, N new ticket, R refresh |
| Ticket tab | A acts on the Needs-you card, E edits, G shows the agent, R moves the run; cmd-Enter sends or saves, Esc cancels |

Every change of state, freeze, move or cancel asks first; Esc writes nothing.

## Limits of the bakers API

Shown with the "API" chip: assignee and reviewers (so Mine is empty), allowed transitions
(the state menu lists every state; the server refuses what the workflow forbids), closing
dates for Recently closed, the conductor list (Move to...), the activity list, and the
project list when the CLI does not serve it (the project then comes from
`.bakers/project.config.js` of the active space). All calls go through the developer's own
`bakers` CLI; the mods keep no token and put no ticket content into Herdr's shared state.

Screenshots for the pixel comparison: [docs/screenshots.md](docs/screenshots.md). The Herdr
files this follows: [docs/herdr-reference.md](docs/herdr-reference.md).

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
