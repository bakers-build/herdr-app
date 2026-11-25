// project/presenter/picker: the projects as picker items, the current one marked.

/** @param {{ uuid: string, name: string }[]} choices @param {string | null} current */
export function pickerItems(choices, current) {
  return choices.map((p) => ({
    key: p.uuid,
    label: p.name,
    current: p.uuid === current,
    hint: p.uuid === current ? "current" : undefined,
    action: ["project.choose", p.uuid, p.name],
  }));
}

/** The workspace switch's segments, the shown one marked.
 *  @param {{ uuid: string, name: string }[]} workspaces @param {string | null} shown */
export function workspaceSegments(workspaces, shown) {
  return workspaces.map((w) => ({ key: w.uuid, label: w.name, current: w.uuid === shown }));
}
