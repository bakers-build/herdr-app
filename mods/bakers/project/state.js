// project/state: the window's project, shared by every copy of the mod: the shared
// uuid, else the project named in .bakers/project.config.js of the active space, read
// through JSON:API (bb_project). Shared state carries only the project uuid.
import { readTextFile, setShared, shared, spaces } from "herdr";
import { openRoute } from "../core/router.js";
import { listProjects, readProject } from "./repository.js";
import { asProject } from "./model.js";

/** @type {{ uuid: string, name: string } | null} */
let project = null;
/** @type {{ uuid: string, name: string }[]} */
let choices = [];
let pickerServed = true;
/** @type {any} */
let lastError = null;
/**
 * The resolution under way: its answer, when it started, and how to end it early.
 * @type {{ promise: Promise<any>, started: number, settle: (p: any) => void } | null}
 */
let pending = null;

/** The CLI's own timeout (core/cli.js): a resolution still open after it has failed. */
export const PROJECT_TIMEOUT_MS = 30000;

export function _resetForTests() {
  project = null;
  choices = [];
  pickerServed = true;
  lastError = null;
  pending = null;
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

/** @param {{ uuid: string, name: string }} p */
export function chooseProject(p) {
  project = p;
  setShared("bakers.project", p.uuid);
  return p;
}

async function resolve() {
  const shared_ = /** @type {string | undefined} */ (shared("bakers.project"));
  if (shared_) {
    if (project?.uuid === shared_) return project;
    try {
      return chooseProject(asProject(await readProject(shared_)));
    } catch (/** @type {any} */ e) {
      if (e?.offline) throw e;
    }
  }
  const name = await configuredName();
  choices = (await listProjects()).map(asProject);
  const match = choices.find((p) => p.name === name);
  if (match) return chooseProject(match);
  if (choices.length) {
    chooseProject(choices[0]);
    openRoute("project.picker");
    return project;
  }
  return null;
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
