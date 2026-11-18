// project/state: the window's project, shared by every copy of the mod: the shared
// uuid, else the project named in .bakers/project.config.js of the active space, read
// through JSON:API (bb_project). Shared state carries only the project uuid.
import { openOverlay, readTextFile, setShared, shared, spaces } from "herdr";
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

export function _resetForTests() {
  project = null;
  choices = [];
  pickerServed = true;
  lastError = null;
  resolving = null;
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
    openOverlay({
      mod: "bakers",
      props: { view: "project.picker" },
      kind: "popup",
      width: 220,
    });
    return project;
  }
  return null;
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
