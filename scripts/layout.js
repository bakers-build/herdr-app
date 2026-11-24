// scripts/layout: the bakers layout, a pure transform of Herdr's `main` layout (herdr-app v0.1.15
// defaults/layouts/main.json) or a developer's clone of it. It keeps that layout's own
// blocks and adds, as drawn in R2-4 and R2-3: a 56 px rail, the sidebar at 220 px hidden
// (cmd-B) with the bakers section after Agents, the bakers tab bar (view "tabs") at 40 px, the ticket
// child of the right panel (368 px, hidden; cmd-shift-T), the bakers status item beside
// Herdr's status, and 8 px pane corners. Applying it twice changes nothing.

/** The keys the installer merges into keys.json (global section). */
export const BAKERS_KEYS = {
  "cmd-b": "layout.toggle:sidebar",
  "cmd-shift-t": "bakers.panel",
  "cmd-shift-o": "bakers.goto",
  "cmd-shift-b": "bakers.tickets",
  "cmd-shift-n": "bakers.new",
  "cmd-k": "bakers.actions",
};

/** @param {any} node @param {string} id @returns {any} */
function find(node, id) {
  if (node?.id === id) return node;
  for (const c of node?.children ?? []) {
    const f = find(c, id);
    if (f) return f;
  }
  return null;
}

/** @param {any} node @param {string} id @returns {any} */
function parentOf(node, id) {
  for (const c of node?.children ?? []) {
    if (c.id === id) return node;
    const f = parentOf(c, id);
    if (f) return f;
  }
  return null;
}

/** @param {any} main the source layout @returns {any} */
export function bakersLayout(main) {
  const l = structuredClone(main);
  if (!find(l, "bakers-rail"))
    l.children.unshift({
      id: "bakers-rail",
      type: "block",
      size: { px: 56 },
      resizable: false,
      content: { mod: "bakers", props: { view: "shell.rail" } },
    });

  const sidebar = find(l, "sidebar");
  if (sidebar) {
    sidebar.size = { px: 220 };
    sidebar.hidden = true;
  }
  const list = parentOf(l, "agents");
  if (list && !find(l, "bakers-sidebar")) {
    const i = list.children.findIndex((/** @type {any} */ c) => c.id === "agents");
    list.children.splice(i + 1, 0, {
      id: "bakers-sidebar",
      type: "block",
      size: { weight: 1 },
      min: 200,
      content: { mod: "bakers", props: { view: "shell.sidebar" } },
    });
  }

  const tabs = find(l, "tabs");
  if (tabs) {
    tabs.size = { px: 40 };
    tabs.content = { mod: "bakers", props: { view: "shell.tabs" } };
  }

  const body = find(l, "panel-body");
  if (body && !find(body, "ticket"))
    body.children.push({
      id: "ticket",
      type: "block",
      content: { mod: "bakers", props: { view: "ticket.context" } },
    });
  const panel = find(l, "panel");
  if (panel) {
    panel.size = { px: 368 };
    panel.hidden = true;
  }

  if (!find(l, "status-row")) {
    const parent = parentOf(l, "status");
    if (parent) {
      const i = parent.children.findIndex((/** @type {any} */ c) => c.id === "status");
      const status = parent.children[i];
      const size = status.size ?? { px: 28 };
      parent.children[i] = {
        id: "status-row",
        type: "row",
        size,
        resizable: false,
        children: [
          { ...status, size: { weight: 1 } },
          {
            id: "bakers-status",
            type: "block",
            size: { px: 320 },
            content: { mod: "bakers", props: { view: "shell.status" } },
          },
        ],
      };
    }
  }

  const pane = find(l, "main")?.content?.pane;
  if (pane) pane.radius = 8;
  return l;
}

/**
 * Adds the bakers keys to keys.json's global section; an existing different binding is
 * reported, never overwritten.
 * @param {any} keys
 * @returns {{ keys: any, conflicts: string[] }}
 */
export function mergeKeys(keys) {
  const out = structuredClone(keys ?? {});
  out.global = out.global ?? {};
  const conflicts = [];
  for (const [k, action] of Object.entries(BAKERS_KEYS)) {
    const have = out.global[k];
    if (have === undefined) out.global[k] = action;
    else if (JSON.stringify(have) !== JSON.stringify(action))
      conflicts.push(
        `${k} is ${typeof have === "string" ? have : JSON.stringify(have)}, not ${action}`,
      );
  }
  return { keys: out, conflicts };
}
