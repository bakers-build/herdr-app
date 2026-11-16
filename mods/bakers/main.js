// The bakers mod: one mod in several places. Herdr gives each copy props().view, the name of
// a route; the router finds the route's controller in the modules' routes.js and runs it,
// as Herdr's win98 mod routes its roles (herdr-app v0.1.15 defaults/mods/win98/main.js).
//
//   core/ form/ list/ components/   the framework: technique, form handling, list engine,
//                                   generic drawing; knows no module
//   ticket/ project/ shell/         the modules: model, repository, commands, store, state,
//                                   presenters, lists, forms, operations, controllers, routes
//
// docs/architecture.md describes the layers; tests/architecture.test.ts keeps them apart.
import { div, View } from "gpui-kit";
import { props } from "herdr";
import Dialog from "./components/form/dialog.js";
import Menu from "./components/menu.js";
import project from "./project/routes.js";
import shell from "./shell/routes.js";
import ticket from "./ticket/routes.js";

/** @type {Record<string, any>} */
export const ROUTES = { ...ticket, ...project, ...shell, menu: Menu, dialog: Dialog };

export default class Bakers extends View {
  init(p, cx) {
    const C = ROUTES[props()?.view];
    this.inner = C ? new C(p) : null;
    this.inner?.init?.(p, cx);
  }

  render(cx) {
    return this.inner ? this.inner.render(cx) : div().child("bakers: unknown view");
  }

  async close(cx) {
    await this.inner?.close?.(cx);
  }
}
