# Workspace choice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A workspace switch in the project picker narrows it to one workspace's projects; the
choice is shared and follows the current project; the button names the workspace.

**Architecture:** Projects are read with `include=group_id,group_id.workspace_id`, so each carries
its workspace. `project/state.js` derives the workspaces from the projects and keeps the shown one
in shared `bakers.workspace`. The picker draws a segmented switch through `PopupList.top()` and
filters its rows; the button prefixes the workspace when there are several.

**Tech Stack:** Herdr mod (plain ES modules, gpui-kit/gpui-base/herdr), JSON:API via
`core/api.js`, Bun tests on the fake JSON:API server, Biome, `tsc -p jsconfig.json`.

**Spec:** `docs/superpowers/specs/2026-11-25-workspace-choice-design.md`

## Global Constraints

- Shared state carries identifiers only: new key `bakers.workspace` (workspace uuid).
- Include path exactly `group_id,group_id.workspace_id` on both `listProjects` and `readProject`.
- Workspaces sorted by name; projects without a known workspace form one segment `Other` (uuid
  sentinel `none`), last, only when any exist, and it counts as a workspace for AC3; a workspace without a name is labelled by its uuid's first 8 characters.
- One readable workspace (and no `Other`): no switch element, button text is the project name alone.
- Several workspaces: button text `<workspace> / <project>`, the workspace part in `t.muted`.
- Picker popup stays 220 px; segments wrap.
- No `setTimeout`; JSDoc on untyped parameters (`strictNullChecks`, `noImplicitAny`); Biome clean;
  coverage floor 92 % lines / 90 % functions.
- Local `bun run check` fails at `herdr-types` (pinned 0.1.16, installed 0.1.18): known, record it,
  do not fix. Run `bun run lint && bun run format:check && bun run typecheck && bun run hygiene && bun run test` instead.

## Review Focus

- A remembered `bakers.workspace` that is no longer readable (left a workspace): the picker shows
  the current project's workspace, never an empty list. → Task 2 test.
- A project chosen from outside the picker (`project.choose` with uuid, name) whose workspace is
  not in the loaded choices: `bakers.workspace` is cleared, the shown workspace then follows the
  project once known. → Task 2 test.
- The include denied or a project without group (`workspace: null`): the project stays pickable
  under `Other`, the button shows the name alone. → Task 1 and Task 3 tests.
- A fresh picker copy (popups are new mod copies) opened after a restart: it shows the shared
  workspace without a click. → Task 3 test.
- Left/Right with one workspace: nothing happens and the keys do not reach other handlers' logic
  wrongly (no throw, row selection unchanged). → Task 3 test.

---

### Task 1: Projects carry their workspace

**Files:**
- Modify: `mods/bakers/project/model.js`, `mods/bakers/project/repository.js`
- Modify: `tests/fixtures/shop.ts` (`resources`: projects may carry `workspace: { id, name } | null`;
  emit `bb_group--bb_group` (id `g-<workspace id>`, relationship `workspace_id`) and
  `bb_workspace--bb_workspace` (attribute `name`); project relationship `group_id`. Default project
  `p1` gets workspace `{ id: "w1", name: "acme" }`.)
- Test: `tests/project/state.test.ts`, `tests/contract/api.contract.test.ts`

**Interfaces:**
- Produces: `Project = { uuid: string, name: string, workspace: Workspace | null }`,
  `Workspace = { uuid: string, name: string }` (typedefs in `model.js`);
  `asProject(p)` reads `p.group_id?.workspace_id` (`id`, `name`; name fallback `id.slice(0, 8)`);
  `listProjects()` / `readProject(uuid)` request the include.

- [ ] **Step 1: Update and add failing tests in `tests/project/state.test.ts`**

  - Existing `project: matches project.config.js…`: expected fetch URL becomes
    `https://bakers.test/jsonapi/bb_project/bb_project?sort=name&include=group_id,group_id.workspace_id&page[limit]=50&page[offset]=0`;
    `ensureProject()` result `{ uuid: "p1", name: "acme-shop", workspace: { uuid: "w1", name: "acme" } }`
    (give `two` workspaces: p0 → `{ id: "w0", name: "infra-ws" }`, p1 → `{ id: "w1", name: "acme" }`).
  - Existing `already shared project is read by its uuid`: URL
    `…/bb_project/bb_project/p1?include=group_id,group_id.workspace_id`, result with workspace.
  - New `project: a project without a workspace has workspace null`: projects
    `[{ id: "p9", name: "loose", key: "L", workspace: null }]`, shared `p9` → `workspace: null`.
  - Contract: new test `listProjects: each project carries its workspace uuid and name` —
    `(await projects.listProjects()).map(asProject)` every `workspace.uuid` and `workspace.name` are
    non-empty strings.

- [ ] **Step 2: Run** `bun test tests/project/state.test.ts` — Expected: the changed tests FAIL (URL lacks include, no `workspace`).

- [ ] **Step 3: Implement** the include in `repository.js` (`search(..., { sort: "name", include: ["group_id", "group_id.workspace_id"], limit: 50, all: true })`, `read(..., uuid, [same])`) and `asProject` in `model.js`; fixture as above. Adjust any other test whose exact project object or URL now differs (grep `asProject`, `bb_project/bb_project`).

- [ ] **Step 4: Run** `bun test` — Expected: PASS.

- [ ] **Step 5: Commit** `feat(project): projects carry their workspace`

### Task 2: The shown workspace in project state

**Files:**
- Modify: `mods/bakers/project/state.js`, `mods/bakers/project/register.js`
- Test: `tests/project/state.test.ts`

**Interfaces:**
- Consumes: `Project`, `Workspace` from Task 1.
- Produces (exports of `state.js`):
  - `workspaceChoices(): Workspace[]` — distinct workspaces of `projectChoices()`, by name, plus
    `OTHER = { uuid: "none", name: "Other" }` (exported) last when a choice has `workspace: null`.
  - `shownWorkspace(): Workspace | null` — spec decision 7: shared `bakers.workspace` if among
    `workspaceChoices()`; else `currentProject()?.workspace` (or `OTHER` when the current project's
    workspace is null and `OTHER` is offered); else `workspaceChoices()[0] ?? null`.
  - `chooseWorkspace(uuid: string): void` — `setShared("bakers.workspace", uuid)`.
  - `projectsOf(ws: Workspace | null): Project[]` — choices whose `workspace?.uuid ?? "none"` equals `ws?.uuid`; all choices when `ws` is null.
  - `adoptProject(p: Project): Project` — today's `chooseProject` body (sets `project`, shares
    `bakers.project`); every call inside `resolve()` uses it, so resolving never touches `bakers.workspace`.
  - `chooseProject(p)` = `adoptProject(p)` plus: workspace = `p.workspace` if the key is present,
    else the matching choice's `workspace`; when a value is found share `ws?.uuid ?? "none"`, when the
    project is in no choice `setShared("bakers.workspace", null)`.
  - `_resetForTests` unchanged in shape.
- `register.js`: `project.choose` stays `(uuid, name)` → `chooseProject({ uuid, name })` (the lookup lives in `chooseProject`).

- [ ] **Step 1: Write failing tests** (two workspaces fixture from Task 1):
  - `workspace: the shown workspace is the current project's when nothing is shared` → after `ensureChoices()`, `shownWorkspace()` `{ uuid: "w1", name: "acme" }`; `workspaceChoices().map(w => w.name)` `["acme", "infra-ws"]`.
  - `workspace: a shared workspace is shown and narrows the projects` → `env.shared["bakers.workspace"] = "w0"`; `shownWorkspace().uuid` `"w0"`; `projectsOf(shownWorkspace()).map(p => p.uuid)` `["p0"]`.
  - `workspace: an unreadable shared workspace falls back to the current project's` → shared `"gone"` → `"w1"`.
  - `workspace: choosing a project shares its workspace` → `chooseProject({ uuid: "p0", name: "infra" })` after choices loaded → `env.shared["bakers.workspace"]` `"w0"`, `env.shared["bakers.project"]` `"p0"`.
  - `workspace: a project unknown to the choices clears the shared workspace` → shared `"w0"`, `chooseProject({ uuid: "p7", name: "x" })` → `env.shared["bakers.workspace"]` `null`.
  - `workspace: projects without a workspace form Other` → add `{ id: "p9", name: "loose", workspace: null }` → last of `workspaceChoices()` is `{ uuid: "none", name: "Other" }`, `projectsOf(it)` `["p9"]`.
  - `workspace: resolving the shared project keeps a clicked workspace` → shared project `"p1"`, shared workspace `"w0"`, `ensureChoices()` → `env.shared["bakers.workspace"]` still `"w0"`, `shownWorkspace().uuid` `"w0"`.

- [ ] **Step 2: Run** `bun test tests/project/state.test.ts` — Expected: FAIL (`shownWorkspace` not a function).

- [ ] **Step 3: Implement** the exports above in `state.js`; update the file's header comment (shared state now carries the project and the shown workspace).

- [ ] **Step 4: Run** `bun test` — Expected: PASS.

- [ ] **Step 5: Commit** `feat(project): the shown workspace follows the current project`

### Task 3: Workspace switch in the picker, workspace on the button

**Files:**
- Modify: `mods/bakers/ui/components/menu.js` (`PopupList.onKey(e: any): boolean` hook, default
  `false`, called first in `on_key_down`; when it returns true: `stop_propagation`, `notify`)
- Modify: `mods/bakers/project/presenter/picker.js`, `mods/bakers/project/view/picker.js`,
  `mods/bakers/project/view/button.js`
- Modify: `docs/architecture.md` (*Where state lives*: add `bakers.workspace`)
- Test: `tests/project/picker.test.ts`

**Interfaces:**
- Consumes: Task 2 exports.
- Produces: `workspaceSegments(workspaces: Workspace[], shown: string | null): { key: string, label: string, current: boolean }[]` in `presenter/picker.js`; element ids `workspace-switch` (the row) and `ws-<uuid>` (segments; `ws-none` for Other) — tests rely on them; picker rows keep `pick-<project uuid>`.
- Picker: `items()` uses `projectsOf(shownWorkspace())`; `top(t)` returns null when
  `workspaceChoices().length < 2`, else an `h_flex().flex_wrap()` of segments (selected: `t.selected`
  bg, semibold; click → `chooseWorkspace(uuid)`, `this.at = 0`, `cx.notify()`); `onKey`: `left`/`right`
  cycle `workspaceChoices()` from `shownWorkspace()` and set `this.at = 0`, return true; with fewer
  than 2 workspaces return false.
- Button: when `workspaceChoices().length > 1` and `currentProject()?.workspace`, children are a
  muted `"<ws name> / "` then the project name (texts `["acme / ", "acme-shop"]` or similar — keep the
  test exact to what is drawn).

- [ ] **Step 1: Write failing tests** in `tests/project/picker.test.ts` (fixture `TWO` gains
  workspaces w0 `infra-ws` for p0 and w1 `acme` for p1; add a `ONE` set where both share w1):
  - `with two workspaces the picker draws the switch and only the shown workspace's projects` → `find(root, "workspace-switch")` defined; `ws-w1` texts `["acme"]`; `pick-p1` defined, `pick-p0` undefined.
  - `clicking a workspace shows its projects and keeps the project` → click `ws-w0`; `env.shared["bakers.workspace"]` `"w0"`; after render `pick-p0` defined, `pick-p1` undefined; `env.shared["bakers.project"]` still `"p1"`; no `closeOverlay` call.
  - `Right and Left switch the workspace` → `key(root, "right")` → shared `"w0"`; `key(root, "left")` → `"w1"`.
  - `a fresh picker copy shows the shared workspace` → `env.shared["bakers.workspace"] = "w0"` before mount → `pick-p0` defined, `pick-p1` undefined.
  - `choosing a project of another workspace shares that workspace` → shared `"w0"` view, click `pick-p0` → `bakers.project` `"p0"`, `bakers.workspace` `"w0"`.
  - `with one workspace there is no switch and the button shows the project alone` (AC3) → `workspace-switch` undefined in the picker; button texts `["acme-shop"]`; `key(root, "right")` changes nothing.
  - `with two workspaces the button names the workspace` (AC4) → button texts contain `"acme"` and `"acme-shop"` in that order.
  - Existing tests: `a fresh picker copy lists every project…` becomes one workspace (`ONE`) or asserts per workspace; keep the Esc test.

- [ ] **Step 2: Run** `bun test tests/project/picker.test.ts` — Expected: FAIL (no `workspace-switch`).

- [ ] **Step 3: Implement** `onKey` in `menu.js`, `workspaceSegments`, the picker's `top`/`items`/`onKey`, the button prefix; add `bakers.workspace` to `docs/architecture.md`.

- [ ] **Step 4: Run** `bun run lint && bun run format:check && bun run typecheck && bun run hygiene && bun run test` — Expected: all pass, coverage floor met. (`bun run herdr-types` fails locally for the known version mismatch; record it.)

- [ ] **Step 5: Commit** `feat(project): choose the workspace in the project picker`

AC7 (CI green) is checked at delivery: the PR's CI checks `test`, `contract`, `herdr-check`,
`pr-title` all pass.

### Task 4: Live check (AC5)

No code. Under the ticket's lock (`mkdir ~/.config/herdr-app/live-check.lock`, remove afterwards):
`bun run install:herdr` from the worktree; open the picker (`herdr-app do` the project button route);
`herdr-app shot` before switching (shows `bakers` and `keytec` segments, `bakers` projects) and after
pressing Right / choosing `keytec` (its projects). Attach both to the coding summary. Then reinstall
`origin/next` from a clean checkout. What cannot be driven (real key presses) is recorded as
unverified under Problems.
