// Reading Herdr's live layout tree (layout()).

/** @param {any} node @param {string} id @returns {any} */
export function findNode(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}
