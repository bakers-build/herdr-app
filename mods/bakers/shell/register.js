// shell/register: the shell's routes; it contributes nothing else yet.
import { define } from "../core/registry.js";
import routes from "./routes.js";

export function register() {
  for (const [name, C] of Object.entries(routes)) define("route", name, C);
}
