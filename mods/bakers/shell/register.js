// shell/register: what the shell contributes to the registry: its routes and the Files and
// Changes panel buttons.
import { shared } from "herdr";
import { define } from "../core/registry.js";
import routes from "./routes.js";

/** @param {string} id */
const panelOn = (id) => {
  const on = /** @type {string[] | undefined} */ (shared("workspace.panels"));
  return (on ?? ["files", "changes"]).includes(id);
};

export function register() {
  for (const [name, C] of Object.entries(routes)) define("route", name, C);
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
