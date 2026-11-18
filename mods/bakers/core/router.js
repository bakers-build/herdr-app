// core/router: finds the view a route names. Each module's register.js registers its routes as
// { view }; the router only looks them up.
import { get } from "./registry.js";

/**
 * The view class a route names, or null when the route is not registered.
 * @param {string} route
 * @returns {any}
 */
export function viewOf(route) {
  return get("route", route)?.view ?? null;
}
