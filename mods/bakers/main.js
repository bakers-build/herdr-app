// main: the bakers mod, one mod in several places. Herdr gives each copy props().view, the name of
// a route; the router finds the route's view in the registry, where each module's
// register.js put it, and runs it, as Herdr's win98 mod routes its roles
// (herdr-app v0.1.15 defaults/mods/win98/main.js).
//
//   core/ form/ list/ ui/           the framework: technique, form handling, list engine,
//                                   generic drawing; knows no module
//   ticket/ project/ shell/         the modules: model, repository, commands, store, state,
//                                   presenters, lists, forms, operations, views, routes,
//                                   register.js (what the module adds to the registry)
//
// docs/architecture.md describes the layers; tests/architecture.test.ts keeps them apart.
import { div, View } from "gpui-kit";
import { props } from "herdr";
import { viewOf } from "./core/router.js";
import { register as registerProject } from "./project/register.js";
import { register as registerShell } from "./shell/register.js";
import { register as registerTicket } from "./ticket/register.js";
import { register as registerUi } from "./ui/register.js";

/** Fills the registry: ui first, then the modules. Every mod copy calls it once when it loads. */
export function registerAll() {
  registerUi();
  registerProject();
  registerTicket();
  registerShell();
}

registerAll();

export default class Bakers extends View {
  /** The inner view gets this copy's root view too: work that must outlive the call it starts in
   *  names it as its owner (gpui-kit TaskOptions.owner).
   *  @param {import("gpui-shell").Props | undefined} p @param {import("gpui-kit").AsyncContext} cx */
  init(p, cx) {
    const C = viewOf(props()?.view);
    this.inner = C ? new C(p) : null;
    this.inner?.init?.(p, cx, this);
  }

  /** @param {import("gpui-kit").Context} cx */
  render(cx) {
    return this.inner ? this.inner.render(cx) : div().child("bakers: unknown view");
  }

  /** @param {import("gpui-kit").AsyncContext} cx */
  async close(cx) {
    await this.inner?.close?.(cx);
  }
}
