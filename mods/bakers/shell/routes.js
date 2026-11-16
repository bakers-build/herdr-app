// shell/routes: the bakers part of Herdr's frame, as layout blocks (scripts/layout.js).
import Rail from "./controller/rail.js";
import Sidebar from "./controller/sidebar.js";
import Status from "./controller/status.js";
import Tabs from "./controller/tabs.js";

export default {
  "shell.rail": Rail, // block bakers-rail, 56 px
  "shell.sidebar": Sidebar, // block bakers-sidebar, below Spaces and Agents
  "shell.tabs": Tabs, // block tabs, 40 px
  "shell.status": Status, // block bakers-status, beside Herdr's status
};
