// features/freeze: Freeze and Unfreeze, each behind its frame-4 dialog where Keep is the
// default; the write is bakers_ticket_update frozen.
import { h_flex } from "gpui-base";
import { theme } from "herdr";
import { call } from "../../core/cli.js";
import { defineDialog, openDialog } from "../../core/dialog.js";

defineDialog("freeze", {
  copy: (p) => ({
    title: `Freeze ${p.ticket}?`,
    size: 15,
    text: "No conductor picks it up while it is frozen. A run that is already running continues until it ends.",
    keep: "Keep",
    act: "Freeze",
    primaryFirst: true,
    keepSolid: true,
  }),
  write: async (p) => {
    await call("bakers_ticket_update", { ticket: p.ticket, frozen: true });
    return `${p.ticket} frozen`;
  },
});

defineDialog("unfreeze", {
  copy: (p) => ({
    title: `Unfreeze ${p.ticket}?`,
    size: 15,
    text: "A conductor can pick it up again. The label Question stays until you remove it.",
    keep: "Keep frozen",
    act: "Unfreeze",
    primaryFirst: true,
    keepSolid: true,
  }),
  write: async (p) => {
    await call("bakers_ticket_update", { ticket: p.ticket, frozen: false });
    return `${p.ticket} unfrozen`;
  },
});

/** The "..." menu item. @param {any} ticket */
export function freezeItem(ticket) {
  const kind = ticket.frozen ? "unfreeze" : "freeze";
  return {
    label: ticket.frozen ? "Unfreeze..." : "Freeze...",
    action: ["dialog", kind, { ticket: ticket.identifier }],
  };
}

/** The Frozen pill in the ticket tab's header, when frozen. */
export function frozenPill() {
  const t = theme();
  return h_flex()
    .h(24)
    .px(8)
    .items_center()
    .rounded(12)
    .border(1)
    .border_color(t.foreground)
    .text_size(11)
    .child("Frozen");
}

/** @param {any} ticket */
export function askFreeze(ticket) {
  openDialog(ticket.frozen ? "unfreeze" : "freeze", { ticket: ticket.identifier });
}
