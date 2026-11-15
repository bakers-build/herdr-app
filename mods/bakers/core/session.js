// core/session: what every copy of the bakers mod shares in this window, one store and
// the chosen project. Created lazily on first use, never at module top level (AGENTS.md: module code
// runs once and is shared by copies). Shared state carries only the project uuid.
import { openOverlay, readTextFile, setShared, shared, spaces } from "herdr";
import * as cli from "./cli.js";
import { createStore } from "./store.js";

/** @type {any} */
let store = null;
/** @type {{ uuid: string, name: string } | null} */
let project = null;
/** @type {{ uuid: string, name: string }[]} */
let choices = [];
let pickerServed = true;
/** @type {any} */
let lastError = null;
/** @type {Promise<any> | null} */
let resolving = null;
/** @type {Promise<any> | null} */
let loading = null;

export function _resetForTests() {
  store = null;
  project = null;
  choices = [];
  pickerServed = true;
  lastError = null;
  resolving = null;
  loading = null;
}

export function getStore() {
  if (!store) store = createStore(cli);
  return store;
}

export const currentProject = () => project;
export const projectChoices = () => choices;
export const pickerAvailable = () => pickerServed;
export const error = () => lastError ?? getStore().error;

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
      return chooseProject(asProject(await cli.readProject(shared_)));
    } catch (/** @type {any} */ e) {
      if (e?.offline) throw e;
    }
  }
  const name = await configuredName();
  try {
    choices = (await cli.listProjects()).map(asProject);
    pickerServed = true;
  } catch (/** @type {any} */ e) {
    if (!e?.unknownTool) throw e;
    pickerServed = false;
    choices = [];
    if (name) {
      try {
        choices = [asProject(await cli.readProject(keyFromName(name)))];
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

/** The project, with the store loaded for it. */
export async function ready() {
  const p = await ensureProject();
  if (!p) return null;
  const s = getStore();
  if (s.project !== p.uuid || loading) {
    if (!loading) loading = s.load(p.uuid).finally(() => (loading = null));
    await loading;
  }
  return p;
}

/** Refreshes the store and shares the needs-you count with every copy (rail, tabs, status). */
export async function refresh() {
  await ready();
  const s = getStore();
  await s.refresh();
  publishNeeds();
}

export function publishNeeds() {
  const s = getStore();
  const needs = s.needs();
  setShared("bakers.needs", { count: needs.count, ids: needs.ids, updated: s.updated });
}
