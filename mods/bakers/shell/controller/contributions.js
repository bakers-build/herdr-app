// shell/controller/contributions: the shell draws what modules contribute by route. Each
// contribution's controller is made once from its route, started with init, drawn with render
// (one element or an array of them) and stopped with close.
import { viewOf } from "../../core/router.js";

/**
 * Makes the controller a route names and starts it. `ready` is what its init returned. A route
 * that is not registered gives null, so one wrong name cannot stop the rest of the shell.
 * @param {string} route @param {import("gpui-kit").AsyncContext} cx
 * @returns {{ c: any, ready: unknown } | null}
 */
export function launch(route, cx) {
  const C = viewOf(route);
  if (!C) return null;
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
