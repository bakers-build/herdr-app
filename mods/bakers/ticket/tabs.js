// ticket/tabs: which ticket the window is on. A ticket opens in the right panel, never as a tab:
// the selection (shared "bakers.selected") is the one source, and the panel's child "ticket"
// follows it. The tab kind "ticket" (ticket/register.js) only keeps the home tab "Tickets" and
// recognises leftover ticket tabs of older versions, which the window task closes.
import { focused, layout, panes, run, setShared, shared } from "herdr";
import { findNode } from "../core/herdr.js";
import { closeWhere, homeTab, openHome } from "../core/tabs.js";

const KIND = "ticket";

/** The selected ticket's identifier, or null. @returns {string | null} */
export function selectedTicket() {
  return /** @type {string | null} */ (shared("bakers.selected")) ?? null;
}

/** Selects a ticket and shows it in the panel, unhiding the panel. @param {string} id */
export function selectTicket(id) {
  setShared("bakers.selected", id);
  setShared("bakers.panelAt", Date.now());
  run("layout.select", { stack: "panel-body", child: "ticket" });
  run("layout.show", { id: "panel" });
}

export function ensureTicketsTab() {
  openHome(KIND);
}

/** Whether the panel is shown on its child "ticket". */
export function panelShowsTicket() {
  const root = layout();
  const panel = findNode(root, "panel");
  return Boolean(panel && !panel.hidden && findNode(root, "panel-body")?.active === "ticket");
}

/** The ticket the window is on: the selected ticket while the Tickets tab is focused or the panel
 *  shows it (also while its run has the focus), else null. @returns {string | null} */
export function frontTicket() {
  const id = selectedTicket();
  if (!id) return null;
  const home = homeTab(KIND);
  if (home && home.id === focused()?.tab) return id;
  return panelShowsTicket() ? id : null;
}

/** Whether a tab holds only bakers mod panes: no terminal, so closing it ends no shell or run.
 *  @param {string} tabId @param {import("herdr").PaneInfo[]} all */
function onlyModPanes(tabId, all) {
  const mine = all.filter((p) => p.tab === tabId);
  return mine.length > 0 && mine.every((p) => p.terminal == null && p.mod === "bakers");
}

/** Closes the ticket tabs left from versions that opened tickets as tabs: a tab named like one
 *  whose every pane is a bakers mod pane; never "Tickets", never a tab with a terminal or a run. */
export function closeAll() {
  const all = panes();
  closeWhere(KIND, ({ tab }) => tab.status == null && onlyModPanes(tab.id, all));
}
