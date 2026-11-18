// project/register: what the project module contributes to the registry: its routes, its button in the
// sidebar and the action that chooses a project.
import { define } from "../core/registry.js";
import Picker from "./controller/picker.js";
import SidebarTool from "./controller/sidebar-tool.js";
import { chooseProject } from "./state.js";

export function register() {
  define("route", "project.picker", { view: Picker, open: { kind: "popup", width: 220 } }); // popup from the sidebar's project button
  define("route", "project.sidebar-tool", { view: SidebarTool }); // the project button in the Tickets card's header
  define("sidebar.tool", "project.picker", {
    section: "ticket",
    order: 0,
    route: "project.sidebar-tool",
  });
  define("action", "project.choose", {
    run: (/** @type {string} */ uuid, /** @type {string} */ name) => chooseProject({ uuid, name }),
  });
}
