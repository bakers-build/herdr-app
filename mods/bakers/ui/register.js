// ui/register: what the generic ui contributes: the popup menu, the dialog and the action
// that opens a dialog.
import { define } from "../core/registry.js";
import Menu from "./components/menu.js";
import Dialog, { openForm } from "./form/dialog.js";

export function register() {
  define("route", "menu", Menu);
  define("route", "dialog", Dialog);
  define("action", "form.open", {
    run: (/** @type {string} */ form, /** @type {any} */ p) => openForm(form, p),
  });
}
