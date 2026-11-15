// The bakers mod: one mod in several places, routed by props().view, as Herdr's win98 mod
// routes its roles (herdr-app v0.1.15 defaults/mods/win98/main.js).
//
//   core/        technique: CLI call, error kinds, Herdr tabs and layout, action registry, theme
//   form/        form handling: state, submit in steps with partial failures, keys, registry
//   components/  generic drawing, no entity
//   entity/      per entity: data, rules, actions (the only bakers writes),
//                presenter/ (view modes -> props), form/ (form definitions)
//   ui/          the Herdr placements: fetch, map, draw, wire
//
// Imports point down: core <- form <- components <- entity <- ui (tests/architecture.test.ts).
// Importing the forms here registers them, so a dialog copy finds any form by its kind.
// docs/architecture.md has more.
import { div, View } from "gpui-kit";
import { props } from "herdr";
import Dialog from "./components/form/dialog.js";
import Menu from "./components/menu.js";
import "./entity/ticket/actions.js";
import "./entity/ticket/form/confirm.js";
import "./entity/ticket/form/create.js";
import Goto from "./ui/goto.js";
import Rail from "./ui/layout/rail.js";
import Sidebar from "./ui/layout/sidebar.js";
import Status from "./ui/layout/status.js";
import BakersTabs from "./ui/layout/tabs-bar.js";
import Panel from "./ui/panel.js";
import { ConductorPicker, LabelPicker, ProjectPicker } from "./ui/pickers.js";
import TicketTab from "./ui/ticket-tab.js";
import TicketsTab from "./ui/tickets-tab.js";

/** @type {Record<string, any>} */
const VIEWS = {
  // layout blocks
  rail: Rail,
  sidebar: Sidebar,
  status: Status,
  tabs: BakersTabs,
  panel: Panel,
  // tabs
  list: TicketsTab,
  ticket: TicketTab,
  // overlays
  goto: Goto,
  menu: Menu,
  dialog: Dialog,
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
