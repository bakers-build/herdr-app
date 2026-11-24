// shell/register: what the shell contributes to the registry: its routes and the Files and
// Changes panel buttons.
import { shared } from "herdr";
import { define } from "../core/registry.js";
import Rail from "./view/rail.js";
import Status from "./view/status.js";
import Tabs from "./view/tabs.js";

/** @param {string} id */
const panelOn = (id) => {
  const on = /** @type {string[] | undefined} */ (shared("workspace.panels"));
  return (on ?? ["files", "changes"]).includes(id);
};

export function register() {
  define("route", "shell.rail", { view: Rail }); // block bakers-rail, 56 px
  define("route", "shell.tabs", { view: Tabs }); // block tabs, 40 px
  define("route", "shell.status", { view: Status }); // block bakers-status, beside Herdr's status
  define("tabs.panel", "files", {
    order: 0,
    label: "Files",
    bordered: false,
    enabled: () => panelOn("files"),
  });
  define("tabs.panel", "changes", {
    order: 1,
    label: "Changes",
    bordered: false,
    enabled: () => panelOn("changes"),
  });
}
