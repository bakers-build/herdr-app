// project/routes: the project module's entry points.
import Picker from "./controller/picker.js";
import SidebarTool from "./controller/sidebar-tool.js";

export default {
  "project.picker": Picker, // popup from the sidebar's project button
  "project.sidebar-tool": SidebarTool, // the project button in the Tickets card's header
};
