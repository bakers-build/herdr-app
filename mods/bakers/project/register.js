// project/register: what the project module contributes to the registry: its routes, its button in the
// Tickets list header and the action that chooses a project.
import { define } from "../core/registry.js";
import Button from "./view/button.js";
import Picker from "./view/picker.js";
import { chooseProject } from "./state.js";

export function register() {
  define("route", "project.picker", { view: Picker, open: { kind: "popup", width: 220 } }); // popup from the project button
  define("route", "project.button", { view: Button }); // the project button in the Tickets list header
  define("header.tool", "project.picker", { order: 0, route: "project.button" });
  define("action", "project.choose", {
    run: (/** @type {string} */ uuid, /** @type {string} */ name) => chooseProject({ uuid, name }),
  });
}
