// core/herdr: reading Herdr's live data: a terminal's machine, the layout tree.

/** "this computer" for a bare address, else the machine before the slash. @param {any} terminal */
export function machineOf(terminal) {
  if (!terminal?.address) return null;
  const i = String(terminal.address).indexOf("/");
  return i < 0 ? "this computer" : String(terminal.address).slice(0, i);
}

/** A node of Herdr's live layout tree (layout()) by id. @param {any} node @param {string} id @returns {any} */
export function findNode(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}
