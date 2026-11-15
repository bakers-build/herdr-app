// The bakers mod: one mod placed in several blocks, routed by props().view.
// rail, sidebar and status sit in the layout; list (the Tickets tab) and ticket (a ticket
// tab) are tab mods; panel is the right panel's ticket child; goto, picker, confirm and
// new-ticket open as overlays. Shared code lives in lib/, one file per view in views/.
import { div, View } from "gpui-kit";
import { props } from "herdr";
import Confirm from "./views/confirm.js";
import Goto from "./views/goto.js";
import List from "./views/list.js";
import NewTicket from "./views/new-ticket.js";
import Panel from "./views/panel.js";
import Picker from "./views/picker.js";
import Rail from "./views/rail.js";
import Sidebar from "./views/sidebar.js";
import Status from "./views/status.js";
import Ticket from "./views/ticket.js";

/** @type {Record<string, any>} */
const VIEWS = {
  rail: Rail,
  sidebar: Sidebar,
  status: Status,
  list: List,
  goto: Goto,
  ticket: Ticket,
  panel: Panel,
  picker: Picker,
  confirm: Confirm,
  "new-ticket": NewTicket,
};

export default class Bakers extends View {
  init(p, cx) {
    const V = VIEWS[props()?.view];
    this.inner = V ? new V(p) : null;
    this.inner?.init?.(p, cx);
  }

  render(cx) {
    return this.inner ? this.inner.render(cx) : div().child("bakers: unknown view");
  }

  async close(cx) {
    await this.inner?.close?.(cx);
  }
}
