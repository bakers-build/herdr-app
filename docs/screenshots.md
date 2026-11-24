# Screenshots next to the frames (AC8)

The pixel comparison needs Herdr Desktop, so a person takes both screenshots at review and
attaches them to the ticket next to frames R2-4 and R2-3 of the canvas "bakers in Herdr -
Ticketbearbeitung (Wireframes)".

## Setup

1. Sign the bakers CLI in (`bakers tools bakers_ticket_list --data '{"project":"<uuid>"}'`
   answers) and start Herdr Desktop once, so `~/.config/herdr-app/layouts/main.json` exists.
2. In this repository: `bun install`, then `bun run install:herdr`. It prints any key it kept
   because you already use it (`kept your key: ...`). Check `herdr-app status` for errors.
3. Run `herdr-app check ~/.config/herdr-app/mods/bakers`; it must pass.
4. Switch layouts: `herdr-app do layout.switch --name bakers` (or cmd-shift-L).
5. Size the window to 1440 x 900 logical pixels at zoom 1 (`app.zoom_reset`).
6. Open a space whose folder holds the project's `.bakers/project.config.js`, so the mods
   pick that project (or choose it with the project button in the list header).

Take each shot with `herdr-app shot r2-4.png` and `herdr-app shot r2-3.png`.

## R2-4: Tickets tab

- Sidebar closed (cmd-B), Ticket panel closed.
- Click the bakers button in the rail: it opens the Tickets tab with the filter Needs me
  (cmd-shift-B opens the tab with the filter as it was, by default Open).
- Select the first row; press Enter once, so a preview tab (italic) is open; go back with cmd-1.
- Open the "..." menu.
- Press cmd-shift-O and type `deliv` (the popup is drawn open).
- To show the toast, freeze a ticket of the project with the label Question while Herdr runs
  (the next refresh, at most 60 s, posts "<ID> asks a question").

## R2-3: ticket tab

- Sidebar open (cmd-B), Ticket panel open (cmd-shift-T).
- Open a ticket that asked a question (frozen, label Question) as a tab.
- Press A, so the composer is in answer mode, and type an answer without sending it.

## What to compare

| Item | Frame value |
|---|---|
| Rail | 56 px wide; bakers button 36 x 36, 10 px semibold |
| Sidebar | 220 px; Herdr's Spaces and Agents only, no bakers box |
| Tab bar | 40 px; tabs 26 px high, 10 px padding, 12 px text, 6 px apart |
| Status bar | 28 px; 11 px text; "2 need you" semibold in the blocked color |
| List header | 10/12 px padding; buttons 28 px; filter 220 px |
| List cards | 8 px apart; 10/12 px padding, 6 px corners, 2 px border; identifier monospace 12 px; title 13 px semibold, at most two lines; selected card accent border on the selected color |
| Go to ticket | 480 px wide, 120 px from the top, 10 px padding, field 32 px with a 2 px accent border |
| Document | at most 760 px; padding 20/24 px; 16 px between blocks; title 22 px semibold |
| Needs-you card | 1 px accent border, 8 px corners, 12/14 px padding |
| Composer | 2 px accent top border in answer mode; buttons 26 px |
| Panel | 368 px; header 40 px; body 12 px padding, 14 px between sections; small buttons 24 px, 11 px |

The annotations in the frames (region numbers, "sidebar hidden", "italic = preview tab ...",
"popup, drawn open", "toast, Herdr", "follows the focused tab" and the like) are notes for
the reader and are not built. Colors follow the Herdr theme, not the wireframe's grays.

## Known differences

- Herdr draws a pane header on every pane of the main area, so the Tickets tab has one too
  (R2-4 draws the list without it).
- Only the allowed states keep the "API" chip (Mine too, when the signed-in user is
  unknown). Assignee, Reviewers and Recently closed show data from JSON:API, where the frames
  draw "-" and the chip.
- The agent line in the list names the claiming machine ("needs you, studio-mac"); in the
  ticket header and the panel the machine comes from the run's terminal when Herdr shows it.
