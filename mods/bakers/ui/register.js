// ui/register: what the generic ui contributes: the popup menu, the dialog and the action
// that opens a dialog.
import { define } from "../core/registry.js";
import Menu from "./components/menu.js";
import Dialog, { openForm } from "./form/dialog.js";

export function register() {
  define("route", "menu", { view: Menu, open: { kind: "popup", width: 220 } });
  define("route", "dialog", { view: Dialog, open: { kind: "dialog", width: 460, modal: true } });
  define("action", "form.open", {
    run: (/** @type {string} */ form, /** @type {any} */ p) => openForm(form, p),
  });
}
