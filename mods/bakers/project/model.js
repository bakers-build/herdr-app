// project/model: a project as the mod uses it.

/** @typedef {{ uuid: string, name: string }} Workspace */
/** @typedef {{ uuid: string, name: string, workspace: Workspace | null }} Project */

/** @param {any} p a normalized bb_project, its group and workspace included @returns {Project} */
export const asProject = (p) => {
  const w = p.group_id?.workspace_id;
  return {
    uuid: p.id,
    name: p.name ?? p.label ?? p.key ?? p.id,
    workspace: w?.id ? { uuid: w.id, name: w.name ?? w.id.slice(0, 8) } : null,
  };
};
