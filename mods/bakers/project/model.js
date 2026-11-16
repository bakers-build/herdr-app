// project/model: a project as the mod uses it.

/** @typedef {{ uuid: string, name: string }} Project */

/** @param {any} p a normalized bb_project @returns {Project} */
export const asProject = (p) => ({ uuid: p.id, name: p.name ?? p.label ?? p.key ?? p.id });
