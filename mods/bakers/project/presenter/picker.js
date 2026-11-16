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
