// ticket/window: what the ticket module does once per window, every 60 s: refresh the store,
// publish the needs-you count and toast new questions. On its first run it closes the ticket
// tabs left from versions that opened tickets as tabs; a ticket now shows in the panel.
import { closeAll } from "./tabs.js";
import { watchNeeds } from "./needs.js";
import { getStore, publishNeeds, ready } from "./store.js";

/** The window task, with its own memory of who asked at the last refresh. */
export function windowTask() {
  /** @type {string[] | null} */
  let asked = null;
  let swept = false;
  return {
    every: 60000,
    async run() {
      if (!swept) {
        swept = true;
        closeAll();
      }
      if (!(await ready())) return;
      const store = getStore();
      if (store.updated && Date.now() - store.updated > 1000) await store.refresh();
      publishNeeds();
      asked = watchNeeds(asked, store);
    },
  };
}
