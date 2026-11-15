// entity/project/data: the window's project, shared by every copy of the mod. Created lazily on first use, never at module top level (AGENTS.md: module code
// runs once and is shared by copies). Shared state carries only the project uuid.
import { openOverlay, readTextFile, setShared, shared, spaces } from "herdr";
import { register } from "../../core/actions.js";
import { call } from "../../core/cli.js";

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

const listProjects = async () => (await call("bakers_project_list", {}))?.projects ?? [];
/** @param {string} project key or UUID */
const readProject = (project) => call("bakers_project_read", { project });

/** "herdr-app" -> "HERDRAPP": a project key from its name. @param {string} name */
export const keyFromName = (name) => name.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** @param {any} p */
const asProject = (p) => ({ uuid: p.uuid ?? p.id, name: p.name ?? p.key ?? p.uuid ?? p.id });

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
  try {
    choices = (await listProjects()).map(asProject);
    pickerServed = true;
  } catch (/** @type {any} */ e) {
    if (!e?.unknownTool) throw e;
    pickerServed = false;
    choices = [];
    if (name) {
      try {
        choices = [asProject(await readProject(keyFromName(name)))];
      } catch (/** @type {any} */ e2) {
        if (e2?.offline) throw e2;
      }
    }
  }
  const match = choices.find((p) => p.name === name);
  if (match) return chooseProject(match);
  if (choices.length) {
    chooseProject(choices[0]);
    if (pickerServed)
      openOverlay({
        mod: "bakers",
        props: { view: "project-picker" },
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

register("project.choose", (uuid, name) => chooseProject({ uuid, name }));
