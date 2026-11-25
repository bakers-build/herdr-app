# Workspace choice in the project picker (HERDRAPP-24)

## Intent

A developer who belongs to several bakers workspaces (today: `bakers` and `keytec`) sees every
readable project of all of them in one flat project picker, with nothing saying which workspace a
project belongs to. The mod gets a workspace choice; the project picker then offers only that
workspace's projects, and the project button says which workspace the current project is in.

Acceptance criteria: AC1–AC7 of the ticket's qualification comment
`2f44bdb6-e937-4233-9a1a-dfcbb0be2448` (handoff_version 1); this design adds none.

## Goals

- A workspace switch at the top of the project picker; choosing a workspace there narrows the
  picker's rows to that workspace's projects (AC1).
- The chosen workspace is shared state (`bakers.workspace`, a uuid) and survives a restart; a
  project of another workspace becoming current, by any path, makes its workspace the shown one
  (AC2).
- With one readable workspace the switch is not drawn and the button stays as it is (AC3).
- With several workspaces the project button reads `<workspace> / <project>`, the workspace muted
  (AC4).

## Non-goals

Creating or editing workspaces; labels and ticket types per workspace (HERDRAPP-23); switching the
Tickets list to a workspace-wide view; a workspace without readable projects.

## Anti-goals

- Choosing a workspace silently changing the window's project, and with it the Tickets list.
- A second request per project (N+1) to learn its workspace.
- Any space taken by the workspace choice when there is only one workspace.

## Decisions

1. **Placement: a segmented switch at the top of the project picker, not a second header button.**
   The Tickets list header is already crowded (project button, filters, view menu), and the choice
   only matters while picking a project. The switch sits where its effect, the filtered rows, is
   visible at once. It is drawn through `PopupList.top()`, which the picker already inherits.
   One segment per workspace, sorted by name; the shown one is selected (`t.selected` background,
   semibold); segments wrap (`flex_wrap`) when the 220 px popup is too narrow.
2. **Choosing a workspace only filters the picker; the project changes when a project is picked.**
   The picker stays open after a workspace click. Reason: the Tickets list belongs to a project;
   switching it to some first project of the workspace would load rows the developer did not ask
   for. (Open question from qualification, decided here.)
3. **Keyboard:** Left and Right in the picker move to the previous or next workspace (cycling) and
   reset the row selection to 0; Up, Down, Enter and Esc stay as they are. Implemented in the
   picker's own key handling, not in the shared `PopupList`, through an optional
   `PopupList.onKey(e)` hook that returns true when it handled the key (the other pickers keep
   their behaviour).
4. **Where a project's workspace comes from:** `bb_project.group_id → bb_group.workspace_id →
   bb_workspace` (bakers server `BbProject::group_id`, `BbGroup::workspace_id`). The project list
   and the single project read add `include=group_id,group_id.workspace_id`, so one request yields
   every project's workspace uuid and name. `asProject` becomes
   `{ uuid, name, workspace: { uuid, name } | null }`.
5. **The workspaces are derived from the readable projects**, not from a separate
   `bb_workspace` listing: a workspace with no readable project would offer an empty picker, and
   one request less keeps the picker's load as it is. Sorted by name.
6. **A project whose workspace is unknown** (no group, or the include denied) has
   `workspace: null`. Such projects form one extra segment "Other" (stored as the sentinel uuid
   `none`), only when at least one exists; it is pickable like any workspace and counts as one for
   AC3 (one real workspace plus "Other" draws the switch: the two sets of projects differ). The
   button then shows the project name alone. A workspace whose name did not come with the
   include is named by its uuid's first 8 characters.
7. **Which workspace is shown** (`shownWorkspace()` in `project/state.js`): the shared
   `bakers.workspace` when it is one of the derived workspaces; else the current project's
   workspace; else the first workspace. A remembered workspace that is no longer readable thus
   falls back to the current project's (qualification's assumption, kept).
8. **Following the current project (AC2):** setting the window's project is split in two.
   `adoptProject(p)` sets the project and shares `bakers.project` only; `resolve()` uses it when a
   copy of the mod (every popup, every restart) reads the shared or configured project, so a
   workspace clicked in the picker survives reopening and restarts. `chooseProject(p)` is a person
   choosing a project (picker row, `project.choose` from any module): it adopts the project and
   also shares `bakers.workspace` = the project's workspace uuid when it is
   known: from the project object itself, else from the loaded choices by uuid. When neither knows
   it (choices not loaded yet), it **clears** `bakers.workspace` instead, so `shownWorkspace()`
   falls back to the current project's workspace as soon as that is known (decision 7). The
   `project.choose` action (uuid, name), used by the picker and by other modules, goes through the
   same lookup. The first-project fallback in `resolve()` (no configured match) adopts without
   sharing a workspace too. A picker click on a workspace sets `bakers.workspace` and holds until the next
   project choice.
9. **Shared state:** one new key, `bakers.workspace` (uuid only, like `bakers.project`).
   `docs/architecture.md` › *Where state lives* lists it.
10. **Picker rows:** unchanged shape (name, `current` hint); only the shown workspace's projects.
    The current project shows as current only when it is in the shown workspace.

## Constraints

- Herdr runtime: no `setTimeout`; popups are fresh copies of the mod that load their own data
  (`ensureChoices`), and read shared state on render.
- JSON:API through `core/api.js`; `search(..., { include })` and `read(..., include)` already pass
  includes in both fetch and dropsh modes.
- The fake JSON:API server (`tests/fixtures/jsonapi-server.ts`) resolves dotted includes; the shop
  fixture (`tests/fixtures/shop.ts`) gains `bb_group` and `bb_workspace` resources and an optional
  workspace per project.
- Types: `strictNullChecks`, JSDoc on every untyped parameter; Biome lint and format; coverage
  floor (92 % lines, 90 % functions) holds.
- Known: local `bun run check` fails at `herdr-types` (Herdr 0.1.16 pinned, 0.1.18 installed);
  record it, do not fix it here.

## Tests (AC6)

`tests/project/state.test.ts` and `tests/project/picker.test.ts`, on the shop fixture with two
workspaces:

- listing carries each project's workspace (one request, with the include);
- picker with two workspaces draws the switch, the shown workspace's projects only; clicking the
  other segment shares `bakers.workspace` and shows its projects, the project unchanged (AC1);
- Right/Left switch the shown workspace (AC1);
- a shared `bakers.workspace` is shown by a fresh copy (restart, AC2), also after that copy
  resolved the shared project; an unreadable one falls back to the current project's (AC2);
- `project.choose` of a project in another workspace shares that workspace (AC2);
- one workspace: no switch element, button text is the project name alone (AC3);
- two workspaces: the button reads the workspace and the project (AC4).

Contract test (`tests/contract/api.contract.test.ts`): `listProjects()` against the real server
returns projects whose `workspace` has a uuid and a name, proving the include is served.

## CI (AC7)

The branch passes CI (`test`, `contract`, `herdr-check`, `pr-title`). Locally the known
`herdr-types` failure is recorded, not fixed.

## Live check (AC5, in working)

`herdr-app shot` of the picker with the developer's real workspaces, before and after switching;
under the ticket's lock procedure.

## Left to the builder

Exact segment styling within the theme tokens; naming of helpers; test fixture shape.
