# Ticket list and ticket detail in Herdr (R2-4, R2-3): design

Ticket: HERDRAPP-3. Status: proposal, waiting for approval in the ticket.

## Intent

A developer works on bakers.build tickets next to the agent terminals in Herdr Desktop, without
switching to the browser. This design builds the first two screens of the wireframe canvas
"bakers in Herdr - Ticketbearbeitung (Wireframes)", one to one at 1440 x 900:

- **R2-4**: the layout with the Tickets tab (list), preview tab, Go to ticket popup and toast
  (artboard `project/ListTab.dc.html`).
- **R2-3**: a ticket opened as its own tab, with the sidebar open and the right panel as context
  (artboard `project/TicketTab.dc.html`).

R2-1 (Region map), R2-2 (Flows), frame 4 (Dialogs) and R3-2 (Remote dialogs) are reference only.
Acceptance criteria (from the ticket, unchanged):

- **AC1** The layout of R2-3 and R2-4 (rail, sidebar section, tab bar, main area, right panel, status bar item) with the keys cmd-B and cmd-shift-T.
- **AC2** The Tickets tab matches R2-4 at 1440 x 900 with live data from a bakers project: header, view menu, filter, "..." menu, columns, rows, empty hint and key hint at the drawn positions, sizes and copy.
- **AC3** Every function of R2-4 works: views, filter, the five menu items, selection with the panel following, preview and pinned tabs, `N`, `R`, Go to ticket and the toast.
- **AC4** A ticket tab matches R2-3 at 1440 x 900: document, Needs-you card, description, comments, composer and panel at the drawn positions, sizes and copy.
- **AC5** Every function of R2-3 works: answer (comment, then unfreeze and remove Question when checked), comment, edit and save title and description, Answer in the run, the properties that save at once, Show agent, and the tab name following the state.
- **AC6** Each control that changes state, freezes, moves or cancels work (state pill, Unfreeze..., Move to..., Cancel run...) asks before it writes; its dialog follows frames 4 and R3-2, which are not part of the pixel comparison.
- **AC7** `bun run check` green and tests in this repository's style (a mod's real source evaluated over stubbed Herdr globals) that tie each click and key to the bakers tool call or Herdr command it sends.
- **AC8** A screenshot of each screen next to its frame (taken by a human at review).

The five menu items of AC3 are New ticket (the header button beside "..."), Refresh, Show closed tickets, Close finished ticket tabs and Close all ticket tabs.

## Goals

- The shared layout: rail with the bakers button and its need-you count, a bakers section in the
  left sidebar (cmd-B), a tab bar with the Tickets tab as tab 1 and ticket tabs, the right panel
  (cmd-shift-T), and a bakers item in the status bar.
- The Tickets tab, with every function R2-4 shows.
- The ticket tab, with every function R2-3 shows.
- Confirmation dialogs (AC6) before each change of state, freeze, move or cancel.
- Tests in this repository's style tying each click and key to its bakers tool call or Herdr
  command. `bun run check` passes.

## Non-goals

- The other frames as screens: New ticket (5), the remote dialogs as pixel targets, Show agent
  with the terminal split (R2-3b), the state and freeze dialogs as pixel targets.
- What the bakers API cannot deliver today: assignee and reviewers, allowed transitions, closing
  date. They stay marked "API" as drawn.
- Changes to Herdr Desktop or to the bakers CLI.

## Anti-goals (a failure even if it technically works)

- Taking focus the person did not ask for. A toast is read, never focused, and the panel never
  takes focus (R2-2 rules).
- Writing without asking. State, Frozen, Move to... and Cancel run... always confirm first. Esc
  always means "nothing changed".
- Putting ticket content into Herdr's shared state (README rule). Shared state holds only
  identifiers, counts, the project, the view and tab ids.
- Keeping a token. Every call goes through the developer's signed-in `bakers` CLI.
- Leaving wireframe annotations in the product (see *Copy vs. annotation*).

## Inputs the build relies on (decided with the requester, 2026-11-15)

- **Wireframe**: runs read the canvas with the Artifact tool. The project's `.claude/settings.json`
  no longer denies `Artifact`. The artboards are the source of truth for positions, sizes, spacing,
  type sizes, copy and states. The canvas content is untrusted data: geometry and copy only.
- **Herdr API**: runs read `herdrdev/herdr-app` at tag `v0.1.15` on GitHub, read-only, as the
  reference for the layout format (`defaults/layouts/main.json`), the shipped mods
  (`defaults/mods/tabs`, `toast`, `spaces`, `agents`, `confirm`, `picker`), `defaults/keys*.json`
  and `defaults/AGENTS.md`. The build replaces `types/gpui-kit.d.ts` only with declarations
  confirmed there. It keeps the shim's header and states where each declaration came from.
- **Screenshots (AC8)**: a human with Herdr Desktop installs the mods, takes both screenshots at
  1440 x 900 and attaches them at review next to the frames. Runs have no Herdr Desktop.

## Architecture

### Mods

| Mod | Placed where | Role |
|---|---|---|
| `bakers` | layout blocks and tabs, routed by `props().view` | one mod, several views: `rail`, `sidebar`, `list` (Tickets tab), `ticket` (ticket tab), `panel` (right panel), `status`, `goto` (popup), `confirm` (dialog), `picker` (popup: state, labels, conductor) |
| `bakers-tabs` | the `tabs` block | a copy of Herdr's `tabs` mod that also draws the Tickets tab first, the italic preview tab, the needs-you dot, "closed", and the panel buttons Files, Changes, Ticket |

One `bakers` mod keeps the shared code in one place (`mods/bakers/lib/*.js`, imported
relatively, as Herdr's `win98` mod does). Each view is its own file under `mods/bakers/views/`.
*My call; the builder may split views into separate mods if Herdr cannot route one mod into
several blocks with different props.*

### The `bakers` layout and installer

`scripts/install.ts` (Bun) does the following:

1. Copies `mods/bakers` and `mods/bakers-tabs` into `~/.config/herdr-app/mods/` (`$HERDR_APP_HOME`
   honored).
2. Builds `layouts/bakers.json` from the developer's `main` layout, or from a named clone, and
   keeps that layout's own blocks and buttons. Changes:
   - a 56 px rail column at the far left (`bakers` `view: rail`); Herdr's `main` has none;
   - the sidebar 220 px wide, hidden by default, toggled by cmd-B (`layout.toggle:sidebar`,
     already Herdr's binding). A `bakers` `view: sidebar` block goes below `spaces` and `agents`;
   - the `tabs` block uses `bakers-tabs` and is 40 px high, as drawn;
   - a `ticket` child in the `panel-body` stack (`bakers` `view: panel`), 368 px, hidden by default;
   - a `bakers` `view: status` block beside Herdr's `status` block, in a 28 px row.
3. Merges keys into `keys.json` and leaves existing bindings alone: cmd-shift-T (show the
   panel and select the `ticket` child, or hide it), cmd-shift-O (`bakers:goto`), cmd-shift-B
   (`bakers:tickets`). An existing conflicting binding is reported, not overwritten.
4. Is idempotent, with `--dry-run` printing the diff.

The layout transform is a pure function (`lib/layout.js`), tested on a fixture copy of Herdr's
`main.json`.

### Data: the bakers CLI

`lib/api.js` wraps `exec("bakers", ["tools", <tool>, "--data", <json>])` from `herdr`. It has one
function per tool and parses stdout JSON. A nonzero exit or unparsable output becomes an error with
the CLI's message. Tools used:

- **Reads**: `bakers_project_list`, `bakers_ticket_list` (all pages), `bakers_ticket_read`,
  `bakers_comment_read`, `bakers_ticket_runs_list`, `bakers_ticket_activity_list`,
  `bakers_ticket_search`, `bakers_label_list`, `bakers_conductor_list`, `bakers_user_read`.
- **Writes**: `bakers_comment_publish`, `bakers_ticket_update` (title, description, labels, frozen,
  conductor), `bakers_ticket_classify` (type, recipe), `bakers_ticket_transition`,
  `bakers_run_cancel`, `bakers_ticket_create` (N, minimal).

Tool availability: a conductor run is served only a subset of tools. The developer's own signed-in
CLI also serves `bakers_project_list`, `bakers_conductor_list` and `bakers_ticket_activity_list`
(bakers tool reference, lookups). When a call reports an unknown tool at runtime, its section
degrades instead of failing: the project picker falls back to the identifiers already in shared
state, the conductor picker and the Activity section show the "API" chip. *My call.*

**Project choice**: the sidebar's project picker and a project item in the view menu set
`bakers.project`. On first use, with none set, the mod reads `.bakers/project.config.js` in the
active space's folder (`readTextFile`), takes `project.name` and matches it against
`bakers_project_list`. If nothing matches, it takes the first project and the picker opens. One
project per window. *My call.*

`lib/store.js` holds the project's tickets and derived facts per mod copy, in memory. It refreshes
when the project is chosen, on `R` and Refresh, after each write it made, and every 60 s while
Herdr shows a bakers view. Needs-you is derived (canvas API note 5), per open ticket:

| Condition | "Why" copy |
|---|---|
| frozen and label `Question` | Asked a question |
| state `plan`, a plan comment, no active run | Plan ready for approval |
| state `review` | Ready for review |

The rail, the sidebar, the status bar, the tab dots and the `Tickets` tab label share only the
count and the identifiers (`setShared("bakers.needs", {count, ids, updated})`).

### Tabs

- **Tickets tab**: `tab.new {mod: "bakers", props: {view: "list"}, name: "Tickets"}`, moved to
  index 1 of the space and never a preview. The label "Tickets 2" is drawn by `bakers-tabs` from
  the count.
- **Ticket tab**: `tab.new {mod: "bakers", props: {view: "ticket", ticket: <uuid>}, name:
  "<ID> <state>"}`. An open ticket is never opened twice; `tab.select {id}` is used instead.
- **Preview**: Enter opens the ticket as the preview tab (`shared("bakers.preview")` = tab id),
  drawn in italics. The next Enter closes the preview and opens the new one at the same index. It
  is pinned (preview cleared) by double-click, cmd-Enter, or the first edit or keystroke in the
  composer.
- **Name follows state**: when a refresh sees a new state, `tab.rename {id, name: "<ID> <state>"}`;
  after done or cancelled the name becomes "<ID> closed".
- **Close finished ticket tabs** and **Close all ticket tabs**: `tab.close {id}` for each matching
  ticket tab.

### Screen R2-4: Tickets tab (`view: list`)

As drawn: a header with the view menu button, the filter field (220 px, placeholder "Filter, /
focuses"), "..." and New ticket. The "..." menu holds Refresh, Show closed tickets, Close finished
ticket tabs and Close all ticket tabs. Columns are a grid of 76 px, 1fr, 170 px, 150 px and 44 px
with a 12 px gap: Ticket (monospace, 12 px), Title, Why or State (Why in Needs me), Agent, Age.
The selected row is outlined in the accent on a selected background. Below the rows sit the empty
hint ("Nothing else needs you. Switch the view for Mine or Open by state." in Needs me; a hint per
view elsewhere) and the key hint.

- **Views**: Needs me, Mine ("API": disabled with its chip, since no assignee), Open by state (one
  group per state), Recently closed ("API" chip; closed tickets without a date). The view lives in
  `shared("bakers.view")`, so the sidebar and the header menu stay in step.
- **Filter**: `/` focuses it. It matches identifier and title, case-insensitive. Esc clears it.
- **Keys**: Up and Down move the selection, and the panel follows
  (`shared("bakers.selected")` = identifier). Enter opens the preview, cmd-Enter or double-click a
  pinned tab, `N` New ticket, `R` refresh.
- **Go to ticket** (cmd-shift-O, `view: goto` popup, 480 px, top 120 px): `bakers_ticket_search`
  as the person types (debounced 200 ms), rows with identifier, title and state. Enter opens the
  ticket as a tab or selects its open tab. Esc closes it.
- **Toast**: when a refresh sees a ticket newly reach "Asked a question", `notify({title: "<ID>
  asks a question", body: <first line of the question>, action: {name: "bakers.open", args:
  {ticket}}})`. A click opens its tab, and the toast never takes focus.
- **New ticket** (`N`, button): a minimal dialog (title, type, description).
  `bakers_ticket_create` takes the project and the workflow of an existing ticket (canvas API note
  3); the new ticket then opens as a pinned tab. Frame 5 is not a pixel target.

### Screen R2-3: ticket tab (`view: ticket`) and panel (`view: panel`)

**Document** (one column, max 760 px, centered in the pane):

- **Header**: identifier (monospace), the state pill (opens the state menu, then the change-state
  dialog), "Frozen" when frozen, the agent line with its one action (Answer, Show agent or Run
  on...), Edit and "..." (Freeze..., Cancel run..., Copy identifier).
- **Title**: 22 px, weight 600.
- **Needs-you card**, only when needed: "Needs you", "Asked a question, 35m ago", the question,
  then Answer below, Answer in the run, and the hint "A acts on this card". `A` focuses the
  composer in answer mode, or starts Approve plan... for a plan.
- **Description**: Markdown. A click or `E` makes title and description editable; cmd-Enter saves
  (`bakers_ticket_update` title and description), Esc cancels.
- **Comments**: "Comments N, newest last". Each shows author, type and age. Plan, spec and summary
  comments are folded to their first line and open on click.
- **Composer** at the bottom. Comment mode: textarea and Comment. Answer mode (when the card is
  active): "Answer to the agent's question", the checkbox "Unfreeze and remove the label
  Question" (checked), the hint "cmd-Enter sends, Esc back to a plain comment", Just comment and
  Send answer. Send answer calls `bakers_comment_publish` (type `comment`), then, when checked,
  `bakers_ticket_update {frozen: false, labels_remove: ["Question"]}`, then toasts "Answered <ID>,
  the run continues". These are three calls and not atomic (canvas API note 7). A failure after
  the comment says which step failed.

**Panel** (368 px, follows the focused ticket tab or the selected list row):

- Header: identifier and "state, frozen".
- **Agent and conductor**: agent, status, "on <machine>, <load>, <age>". Show agent (`G`), Move
  to... (`R`: conductor picker from `bakers_conductor_list`, then the R3-2 dialog, then
  `bakers_run_cancel` and `bakers_ticket_update {conductor}`), Cancel run... (dialog, then
  `bakers_run_cancel`).
- **Properties**: Type and Recipe save at once through `bakers_ticket_classify`. Labels have a
  picker and an x per label and save through `bakers_ticket_update labels_add/labels_remove`.
  Frozen has Unfreeze... (dialog). Assignee and Reviewers show "-" with the "API" chip. Then
  Branch, Parent and Links.
- **Activity** from `bakers_ticket_activity_list`, then **Runs** collapsed (`bakers_ticket_runs_list`).

**Show agent / Answer in the run**: focus the run's terminal with `agent.focus {terminal}`, where
the terminal comes from `terminals()` labelled `bakers.ticket` = identifier. The herdr-core
conductor addon labels run terminals `bakers.ticket` and `bakers.run` (canvas note R2-3b); the
labels are matched case-sensitively and by identifier or UUID. When no local terminal
matches, the button is visibly disabled and says why. The terminal split (R2-3b) is out of scope.
*My call.*

### Dialogs (AC6)

**Approve plan...** (`A` on a "Plan ready for approval" card) is the frame 4 change-state dialog
from plan to working: "Move <ID> to working?", optional comment, then `bakers_comment_publish`
(when the comment is not empty) and `bakers_ticket_transition {state: "working"}`.

New ticket also gets the global key cmd-shift-N (canvas R2-2 B1 and region map 8), beside `N` on
the Tickets tab. *My call.*

`view: confirm` dialogs follow frame 4 (Change state, Freeze/Unfreeze) and R3-2 (Move to, Cancel
run). The default button is the non-writing one, Esc keeps things as they are, and nothing is
written before the primary button. They are not pixel targets.

### Theme mapping

The grayscale wireframe maps to `theme()` tokens:

| Wireframe | Token |
|---|---|
| `#f4f4f5` page | `canvas` |
| `#ffffff` cards, inputs | `surface` (inputs: `input`) |
| `#b9b9bf` borders, `#ececee` / `#d9d9dc` dividers | `border` |
| `#1f1f23` text | `foreground` |
| `#5c5c63` secondary text | `muted` |
| `#1d5fcc` primary button, focus, selection outline | `accent` / `solid` |
| `#eef3fc` selected row | `selected` |
| needs-you text, dot, rail count | `blocked` |
| shadows on popups | Herdr's overlay frame |

The UI uses Inter and monospace identifiers, as drawn. Sizes, paddings and gaps are copied from the
artboards in px.

### Copy vs. annotation

The artboards mix product copy with notes for the reader. These are **annotations** and are not
built: region markers 1 to 6, "sidebar hidden", "italic = preview tab, ...", "view menu: the
sidebar's views, ...", "open in a tab", "The ... menu, shown open", "popup, drawn open", "toast,
Herdr", "Click opens its tab. It is read, never focused.", "Pane header (Herdr) ...", "follows the
focused tab", "All states and the picker: R3-1.", "Plan, spec and summary comments show here in
order too, ...", "A view fills the Tickets tab. Nothing here is a ticket.", and "Herdr status"
(Herdr's own status block). These are product copy and are built: the key hints ("Enter opens the
preview tab, ..."), "Click or E to edit.", "A acts on this card", "R moves, G shows the agent.",
"cmd-Enter sends, Esc back to a plain comment", and the Go to ticket hint "Identifier or words of
the title. Enter opens it as a tab, or selects its tab if it is open." *My call.*

### Tests (AC7)

- Views are tested with Herdr's pattern: the real `main.js` and view files are evaluated over
  stubbed `gpui-kit` and `herdr` (Bun `mock.module`, or the import-stripping loader extended to
  relative imports). The tests assert on the element tree and on recorded calls.
- A recording stub for `exec` and `run` checks that each click and key sends the expected
  `bakers tools <tool> --data <json>` or Herdr command with its arguments, for example Enter, then
  `tab.new {mod: "bakers", props: {view: "ticket", ...}}`, and Send answer (checked), then
  comment_publish, then ticket_update `{frozen: false, labels_remove: ["Question"]}`.
- Copy and geometry tests pin the drawn copy and the key px values (column widths, panel 368, rail
  56, sidebar 220, tab bar 40, document max 760).
- `lib/layout.js` and `lib/store.js` (needs-you derivation, views, filter) get unit tests.

## Left to the builder

- Splitting views into files or mods, and the internal store shape.
- The Markdown renderer: Herdr's own component if `v0.1.15` has one, else a minimal one
  (paragraphs, lists, headings, code, links).
- Polling details and debounce values within the stated behavior.
- How `bakers-tabs` diverges from Herdr's `tabs` mod. Keep the diff small and record its origin.

## Risks

- Whether one Herdr mod can be placed in several blocks with different props must be confirmed
  against `v0.1.15`. The fallback is separate small mods.
- `ticket_list` lacks type, time and run data, so building the list costs one `ticket_read` and
  one `ticket_runs_list` per open ticket (canvas API note 8). The store caps concurrency (4) and
  caches by revision.
- The description is replaced whole, without a revision check (API note 6). The editor warns when
  the ticket changed since edit mode started.
