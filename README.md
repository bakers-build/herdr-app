# herdr-app

bakers.build inside the Herdr Desktop app: mods that show a project's tickets and one
ticket's state next to the agent terminals, so a developer does not switch to the browser.

## Status

The layout with the Tickets list (frame R2-4) and a ticket in its own tab (frame R2-3) are
built as one mod, `bakers`. Herdr places it in several blocks, tabs and overlays; each copy
gets a route (`ticket.list`, `ticket.view`, `ticket.context`, `ticket.search`,
`shell.sidebar`, ...), and the router runs that route's controller. The code is split into a
small framework (`core`, `form`, `list`, `components`) and modules (`ticket`, `project`,
`shell`), each with its model, repository, commands, store, lists, view modes, forms,
operations, controllers and routes. See [docs/architecture.md](docs/architecture.md).

## Install

Needs Herdr Desktop (started once) and a signed-in `bakers` CLI on the PATH.

```sh
bun install
bun run install:herdr            # --dry-run shows what it would write; --from <layout>
herdr-app do layout.switch --name bakers
```

The installer copies the mod into `~/.config/herdr-app/mods/` (`$HERDR_APP_HOME` honored),
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

## Data

Reads go to the bakers JSON:API with your own sign-in: the mod asks `bakers auth token` (CLI
0.10.1-next.11 or later) for a short-lived token, keeps it in memory only and asks again
after a 401. With an older CLI it reads through `bakers dropsh` instead. Writes (comment,
answer, edit, state, freeze, move, cancel, classify, labels) go through `bakers tools`.
The mod puts no ticket content into Herdr's shared state.

Still shown with the "API" chip: Mine (the mod does not know the signed-in user yet) and the
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
bun run check   # lint, format check, type check and tests; or `just check`
```

`bun run format` rewrites files to the house style. Which Herdr conventions this follows, and
where and why it deviates, is in [docs/conventions.md](docs/conventions.md).

## Not planned

- Changes to the Herdr Desktop app itself or to the bakers CLI.
