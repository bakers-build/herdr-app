// ticket/controller/sidebar: the rows of the Tickets card in the shell's sidebar: the views with
// their counts (sidebar.section "ticket").
import { navRows } from "../../ui/components/nav.js";
import { navItems } from "../list/index.js";
import { currentView, setView } from "../state.js";
import { getStore, ready } from "../store.js";
import { ensureTicketsTab } from "../tabs.js";

export default class TicketSidebar {
  /** The shell awaits it, then redraws: the rows need the store. */
  init() {
    return ready();
  }

  render() {
    const rows = navItems(getStore().records(), currentView());
    return navRows(rows, (key) => {
      setView(key);
      ensureTicketsTab();
    });
  }
}
