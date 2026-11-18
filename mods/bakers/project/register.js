// project/register: what the project module contributes to the registry: its routes and the
// action that chooses a project.
import { define } from "../core/registry.js";
import routes from "./routes.js";
import { chooseProject } from "./state.js";

export function register() {
  for (const [name, C] of Object.entries(routes)) define("route", name, C);
  define("action", "project.choose", {
    run: (/** @type {string} */ uuid, /** @type {string} */ name) => chooseProject({ uuid, name }),
  });
}
