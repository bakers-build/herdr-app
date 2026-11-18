// shell/controller/contributions: the shell draws what modules contribute by route. Each
// contribution's controller is made once from its route, started with init, drawn with render
// (one element or an array of them) and stopped with close.
import { get } from "../../core/registry.js";

/**
 * Makes the controller a route names and starts it. `ready` is what its init returned.
 * @param {string} route @param {import("gpui-kit").AsyncContext} cx
 * @returns {{ c: any, ready: unknown }}
 */
export function launch(route, cx) {
  const C = get("route", route);
  const c = new C({ view: route });
  return { c, ready: c.init?.({ view: route }, cx) };
}

/** Redraws once every started controller has finished its init. @param {{ ready: unknown }[]} started @param {import("gpui-kit").AsyncContext} cx */
export function settle(started, cx) {
  cx.spawn(async (cx) => {
    await Promise.all(started.map((s) => s.ready));
    cx.notify();
  });
}

/** What a controller draws, always as an array. @param {any} c @param {import("gpui-kit").Context} cx */
export function draw(c, cx) {
  const out = c.render(cx);
  return Array.isArray(out) ? out : [out];
}

/** @param {any[]} controllers @param {import("gpui-kit").AsyncContext} cx */
export async function stop(controllers, cx) {
  for (const c of controllers) await c.close?.(cx);
}
