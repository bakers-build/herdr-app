// core/router: finds the view a route names and opens a route as an overlay. Each module's
// register.js registers its routes as { view, open? }; `open` holds the route's fixed
// openOverlay fields (kind, width, height, modal, frame, key, keep).
import { openOverlay } from "herdr";
import { get } from "./registry.js";

/**
 * The view class a route names, or null when the route is not registered.
 * @param {string} route
 * @returns {any}
 */
export function viewOf(route) {
  return get("route", route)?.view ?? null;
}

/**
 * Opens a route as an overlay of this mod. `params` join the view's props; `extra` holds the
 * fields computed per call (at, a measured width) and wins over the route's `open`.
 * @param {string} route @param {Record<string, unknown>} [params] @param {Record<string, unknown>} [extra]
 * @returns {any} the overlay id, or null when the route is not registered
 */
export function openRoute(route, params = {}, extra = {}) {
  const def = get("route", route);
  if (!def) return null;
  return openOverlay({ mod: "bakers", props: { view: route, ...params }, ...def.open, ...extra });
}
