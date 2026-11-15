// Opening the bakers overlays: menus and pickers (popup), dialogs and Go to ticket.
// An overlay is its own mod copy, so a menu item carries an action (lib/actions.js) that
// the picker runs itself, and a dialog performs its own write after its primary button.
import { openOverlay } from "herdr";

/**
 * @typedef {{ label: string, action?: any[], current?: boolean, disabled?: boolean, separator?: boolean, sub?: boolean, note?: string }} MenuItem
 */

/** @param {MenuItem[]} items @param {{ x: number, y: number } | undefined} [at] */
export function openMenu(items, at) {
  return openOverlay({
    mod: "bakers",
    props: { view: "picker", kind: "menu", items },
    kind: "popup",
    width: 220,
    ...(at ? { at } : {}),
  });
}

/** @param {string} kind state | labels | conductor | project @param {Record<string, unknown>} [args] */
export function openPicker(kind, args = {}) {
  return openOverlay({
    mod: "bakers",
    props: { view: "picker", kind, ...args },
    kind: "popup",
    width: 220,
  });
}

/**
 * A confirm dialog (frame 4, R3-2): kind state | freeze | unfreeze | move | cancel.
 * @param {string} kind @param {Record<string, unknown>} args
 */
export function openConfirm(kind, args) {
  return openOverlay({
    mod: "bakers",
    props: { view: "confirm", kind, ...args },
    kind: "dialog",
    width: 460,
    modal: true,
  });
}

export function openNewTicket() {
  return openOverlay({
    mod: "bakers",
    props: { view: "new-ticket" },
    kind: "dialog",
    width: 460,
    modal: true,
  });
}
