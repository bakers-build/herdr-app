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
/** @type {Promise<any> | null} */
let resolving = null;
/** @type {Promise<{ uuid: string, name: string }[]> | null} */
let listing = null;

export function _resetForTests() {
  project = null;
  choices = [];
  pickerServed = true;
  lastError = null;
  resolving = null;
  listing = null;
}

export const currentProject = () => project;
export const projectChoices = () => choices;
export const pickerAvailable = () => pickerServed;
export const projectError = () => lastError;

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

/**
 * Lists the readable projects into projectChoices(), once per copy of the mod: a copy that
 * draws the choices calls it, since a shared project is read on its own. A failed list is
 * read again on the next call.
 */
export function loadChoices() {
  if (!listing) {
    listing = listProjects().then((all) => (choices = all.map(asProject)));
    listing.catch(() => {
      listing = null;
    });
  }
  return listing;
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
  await loadChoices();
  const match = choices.find((p) => p.name === name);
  if (match) return chooseProject(match);
  if (choices.length) {
    chooseProject(choices[0]);
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

/** Resolves the project once; concurrent callers share the answer. */
export async function ensureProject() {
  if (project && project.uuid === shared("bakers.project")) return project;
  if (!resolving)
    resolving = resolve()
      .then((p) => {
        lastError = null;
        return p;
      })
      .catch((e) => {
        lastError = e;
        return null;
      })
      .finally(() => {
        resolving = null;
      });
  return resolving;
}
