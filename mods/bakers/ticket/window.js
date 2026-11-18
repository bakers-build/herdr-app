// ticket/window: what the ticket module does once per window, every 60 s: refresh the store,
// publish the needs-you count, rename the tabs to follow the state and toast new questions.
import { syncTicketNames } from "./tabs.js";
import { watchNeeds } from "./needs.js";
import { tabName } from "./presenter/tab.js";
import { getStore, publishNeeds, ready } from "./store.js";

/** The window task, with its own memory of who asked at the last refresh. */
export function windowTask() {
  /** @type {string[] | null} */
  let asked = null;
  return {
    every: 60000,
    async run() {
      if (!(await ready())) return;
      const store = getStore();
      if (store.updated && Date.now() - store.updated > 1000) await store.refresh();
      publishNeeds();
      syncTicketNames((id) => {
        const r = store.byId(id);
        return r ? tabName(r) : null;
      });
      asked = watchNeeds(asked, store);
    },
  };
}
