// The bakers mod: one mod in several places, routed by props().view, as Herdr's win98 mod
// routes its roles (herdr-app v0.1.15 defaults/mods/win98/main.js).
//
//   core/      the kernel: CLI, session (project and store), tabs, views, kit, menu, dialog
//   features/  one folder per function, each with its UI parts, bakers calls and actions
//   screens/   compose features into a placement: ticket tab, panel, sidebar, status
//
// Imports point down only: screens -> features -> core (tests/architecture.test.ts).
// Importing every feature here also registers its menu actions and dialogs, so an overlay
// copy (a menu, a dialog) can run what any slice asked for. docs/architecture.md has more.
import { div, View } from "gpui-kit";
import { props } from "herdr";
import Dialog from "./core/dialog.js";
import Menu from "./core/menu.js";
import "./features/freeze/freeze.js";
import Goto from "./features/goto/goto.js";
import List from "./features/list/tickets.js";
import Rail from "./features/needs/rail.js";
import NewTicket from "./features/new-ticket/new-ticket.js";
import ProjectPicker from "./features/project/project.js";
import { LabelPicker } from "./features/properties/properties.js";
import { ConductorPicker } from "./features/run/run.js";
import "./features/state/state.js";
import BakersTabs from "./features/tabs-bar/tabs-bar.js";
import Panel from "./screens/panel.js";
import Sidebar from "./screens/sidebar.js";
import Status from "./screens/status.js";
import TicketTab from "./screens/ticket-tab.js";

/** @type {Record<string, any>} */
const VIEWS = {
  // layout blocks
  rail: Rail,
  sidebar: Sidebar,
  status: Status,
  tabs: BakersTabs,
  panel: Panel,
  // tabs
  list: List,
  ticket: TicketTab,
  // overlays
  goto: Goto,
  menu: Menu,
  dialog: Dialog,
  "new-ticket": NewTicket,
  "project-picker": ProjectPicker,
  "conductor-picker": ConductorPicker,
  "label-picker": LabelPicker,
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
