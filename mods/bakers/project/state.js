// project/state: the window's project, shared by every copy of the mod: the shared
// uuid, else the project named in .bakers/project.config.js of the active space, read
// through JSON:API (bb_project). Shared state carries identifiers only: the project uuid
// and the shown workspace's uuid (`none` for projects without a workspace).
import { readTextFile, setShared, shared, spaces } from "herdr";
import { openRoute } from "../core/router.js";
import { listProjects, readProject } from "./repository.js";
import { asProject } from "./model.js";

/** @typedef {import("./model.js").Project} Project */
/** @typedef {import("./model.js").Workspace} Workspace */

/** The workspace of projects whose workspace is unknown. */
export const OTHER = { uuid: "none", name: "Other" };

/** @type {Project | null} */
let project = null;
/** @type {Project[]} */
let choices = [];
let pickerServed = true;
/** @type {any} */
let lastError = null;
/**
 * The resolution under way: its answer, when it started, and how to end it early.
 * @type {{ promise: Promise<any>, started: number, settle: (p: any) => void } | null}
 */
let pending = null;
/** @type {Promise<Project[]> | null} */
let listing = null;
let listingStarted = 0;

/** The CLI's own timeout (core/cli.js): a resolution still open after it has failed. */
export const PROJECT_TIMEOUT_MS = 30000;

export function _resetForTests() {
  project = null;
  choices = [];
  pickerServed = true;
  lastError = null;
  pending = null;
  listing = null;
}

export const currentProject = () => project;
export const projectChoices = () => choices;
export const pickerAvailable = () => pickerServed;
export const projectError = () => lastError;

/**
 * Whether a resolution is under way. One open past PROJECT_TIMEOUT_MS ends here as an offline
 * failure: its callers get null and the next ensureProject starts anew. A clock check, read by
 * every call and by the Tickets list's poll, since the Herdr runtime has no setTimeout.
 */
export function projectResolving() {
  if (pending && Date.now() - pending.started >= PROJECT_TIMEOUT_MS) {
    const expired = pending;
    pending = null;
    lastError = Object.assign(
      new Error(`bakers offline: the project did not load within ${PROJECT_TIMEOUT_MS / 1000} s`),
      { offline: true },
    );
    expired.settle(null);
  }
  return pending !== null;
}

/** project.name from .bakers/project.config.js in the active space's folder. */
async function configuredName() {
  const s = spaces().find((x) => x.active);
  if (!s?.folder) return null;
  const text = await readTextFile(`${s.folder.replace(/\/$/, "")}/.bakers/project.config.js`, {
    on: s.machine,
  });
  const m = /project\s*:\s*\{[^}]*?name\s*:\s*['"]([^'"]+)['"]/.exec(text ?? "");
  return m ? m[1] : null;
}

/** The distinct workspaces of the choices by name, Other last when a project has none. */
export function workspaceChoices() {
  /** @type {Map<string, Workspace>} */
  const seen = new Map();
  for (const p of choices) if (p.workspace) seen.set(p.workspace.uuid, p.workspace);
  const all = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  if (choices.some((p) => !p.workspace)) all.push(OTHER);
  return all;
}

/** The workspace the picker shows: the shared one if offered, else the current project's. */
export function shownWorkspace() {
  const all = workspaceChoices();
  const uuid = shared("bakers.workspace");
  const picked = all.find((w) => w.uuid === uuid);
  if (picked) return picked;
  if (project) {
    const own = project.workspace ?? (all.includes(OTHER) ? OTHER : null);
    if (own) return own;
  }
  return all[0] ?? null;
}

/** @param {string} uuid a workspace uuid, or "none" for Other */
export function chooseWorkspace(uuid) {
  setShared("bakers.workspace", uuid);
}

/** @param {Workspace | null} ws @returns {Project[]} the choices of ws, all when null */
export function projectsOf(ws) {
  if (!ws) return choices;
  return choices.filter((p) => (p.workspace?.uuid ?? OTHER.uuid) === ws.uuid);
}

/** Sets the window's project and shares its uuid; the shown workspace is left alone.
 *  @param {Project} p */
export function adoptProject(p) {
  project = p;
  setShared("bakers.project", p.uuid);
  return p;
}

/** A person choosing a project: adopts it and shows its workspace, if known, else clears the
 *  shared workspace so the current project's is shown.
 *  @param {{ uuid: string, name: string, workspace?: Workspace | null }} p */
export function chooseProject(p) {
  const known = "workspace" in p ? p : choices.find((c) => c.uuid === p.uuid);
  const adopted = adoptProject(/** @type {Project} */ (known ?? p));
  setShared("bakers.workspace", known ? (known.workspace?.uuid ?? OTHER.uuid) : null);
  return adopted;
}

/**
 * Lists the readable projects into projectChoices(), once per copy of the mod: a copy that
 * draws the choices calls it, since a shared project is read on its own. A failed list is
 * read again on the next call, as is one still open after PROJECT_TIMEOUT_MS.
 */
export function loadChoices() {
  if (!listing || Date.now() - listingStarted >= PROJECT_TIMEOUT_MS) {
    const own = listProjects().then((all) => (choices = all.map(asProject)));
    listing = own;
    listingStarted = Date.now();
    own.catch(() => {
      if (listing === own) listing = null;
    });
  }
  return listing;
}

async function resolve() {
  const shared_ = /** @type {string | undefined} */ (shared("bakers.project"));
  if (shared_) {
    if (project?.uuid === shared_) return project;
    try {
      return adoptProject(asProject(await readProject(shared_)));
    } catch (/** @type {any} */ e) {
      if (e?.offline) throw e;
    }
  }
  const name = await configuredName();
  await loadChoices();
  const match = choices.find((p) => p.name === name);
  if (match) return adoptProject(match);
  if (choices.length) {
    adoptProject(choices[0]);
    openRoute("project.picker");
    return project;
  }
  return null;
}

/** The project and the choices, as the project button and the picker draw them. A failed
 *  list leaves no choices: the button then offers no picker, as with one project. */
export async function ensureChoices() {
  await Promise.all([ensureProject(), loadChoices().catch(() => null)]);
}

/** Resolves the project once; concurrent callers share the answer, null after a failure. */
export async function ensureProject() {
  if (project && project.uuid === shared("bakers.project")) return project;
  if (projectResolving()) return /** @type {NonNullable<typeof pending>} */ (pending).promise;
  /** @type {(p: any) => void} */
  let settle = () => {};
  const promise = new Promise((ok) => (settle = ok));
  const own = { promise, started: Date.now(), settle };
  pending = own;
  // A run that expired (projectResolving) no longer owns the slot: its late answer is dropped.
  resolve().then(
    (p) => {
      if (pending !== own) return;
      pending = null;
      lastError = null;
      settle(p);
    },
    (e) => {
      if (pending !== own) return;
      pending = null;
      lastError = e;
      settle(null);
    },
  );
  return promise;
}
