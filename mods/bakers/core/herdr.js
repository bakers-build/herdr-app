// core/herdr: reading Herdr's live data: a terminal's machine, the layout tree (find a node, put a node).

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

/** @param {any} node @param {string} id @returns {any} the node whose child has the id */
function parentOf(node, id) {
  for (const child of node?.children ?? []) {
    if (child.id === id) return node;
    const found = parentOf(child, id);
    if (found) return found;
  }
  return null;
}

/**
 * A copy of a layout tree with `node` in place of the node of its id, or, when there is none,
 * inserted into `parent`'s children right after the child `after`; null when it cannot go in.
 * @param {any} root @param {any} node @param {string} parent @param {string} after @returns {any}
 */
export function withNode(root, node, parent, after) {
  // Herdr's mod runtime has no structuredClone; a layout tree is plain JSON.
  const copy = JSON.parse(JSON.stringify(root));
  const add = JSON.parse(JSON.stringify(node));
  const at = parentOf(copy, node.id);
  if (at) {
    at.children[at.children.findIndex((/** @type {any} */ c) => c.id === node.id)] = add;
    return copy;
  }
  const p = findNode(copy, parent);
  const i = (p?.children ?? []).findIndex((/** @type {any} */ c) => c.id === after);
  if (i < 0) return null;
  p.children.splice(i + 1, 0, add);
  return copy;
}
