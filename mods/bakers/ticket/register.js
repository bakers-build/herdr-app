// ticket/register: what the ticket module contributes to the registry: its routes, lists,
// forms and the actions its menus run.
import { define } from "../core/registry.js";
import { closeAll, closeFinished } from "../core/tabs.js";
import { classify, labels } from "./commands.js";
import { cancelForm, freezeForm, moveForm, stateForm, unfreezeForm } from "./form/confirm.js";
import { createForm } from "./form/create.js";
import closed from "./list/closed.js";
import mine from "./list/mine.js";
import needsMe from "./list/needs-me.js";
import open from "./list/open.js";
import state from "./list/state.js";
import routes from "./routes.js";
import { setView, showClosed } from "./state.js";
import { refresh } from "./store.js";
import { setShared } from "herdr";

export function register() {
  for (const [name, C] of Object.entries(routes)) define("route", name, C);
  for (const list of [needsMe, mine, open, state, closed]) define("list", list.id, list);
  define("form", "create", { build: createForm });
  define("form", "state", { build: stateForm });
  define("form", "freeze", { build: freezeForm });
  define("form", "unfreeze", { build: unfreezeForm });
  define("form", "move", { build: moveForm });
  define("form", "cancel", { build: cancelForm });
  define("action", "ticket.classify", { run: classify });
  define("action", "ticket.labels", { run: labels });
  define("action", "ticket.refresh", { run: () => refresh() });
  define("action", "ticket.view", { run: (/** @type {string} */ view) => setView(view) });
  define("action", "ticket.toggleClosed", {
    run: () => setShared("bakers.showClosed", !showClosed()),
  });
  define("action", "tabs.closeFinished", { run: () => closeFinished() });
  define("action", "tabs.closeAll", { run: () => closeAll() });
}
