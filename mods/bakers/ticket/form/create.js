// form/create: New ticket (N, cmd-shift-N, the header button), a minimal dialog: title,
// type and description. bakers_ticket_create takes the project and the workflow of an
// existing ticket; the new ticket then opens as a pinned tab. Frame 5 is not a pixel target.
import { openTicket } from "../../core/tabs.js";
import { defineForm } from "../../form/registry.js";
import * as actions from "../commands.js";
import { getStore, ready, refresh } from "../store.js";
import { readTicket } from "../repository.js";
import { tabName } from "../presenter/tab.js";

/** The workflow of an existing ticket of the project. */
async function workflow() {
  const store = getStore();
  for (const t of store.tickets) {
    const w = store.cached(t.id)?.ticket?.workflow;
    if (w) return w;
  }
  const first = store.tickets[0];
  return (first && (await readTicket(first.id, true))?.workflow) ?? "bb_work";
}

export const createForm = () => ({
  kind: "dialog",
  title: "New ticket",
  size: 16,
  fields: [
    { name: "title", type: "input", placeholder: "Title" },
    { name: "type", type: "choice", options: ["feature", "bug", "chore"], value: "feature" },
    { name: "description", type: "textarea", rows: 6, placeholder: "Description (Markdown)" },
  ],
  hint: "Esc cancels",
  keep: "Cancel",
  submit: "Create",
  validate: (/** @type {any} */ v) =>
    String(v.title).trim() ? null : { title: "A ticket needs a title." },
  steps: [
    {
      run: async (/** @type {any} */ v) => {
        const p = await ready();
        return actions.create({
          title: String(v.title).trim(),
          project: p?.uuid,
          workflow: await workflow(),
          type: v.type,
          description: String(v.description).trim() || null,
        });
      },
      failed: "Not created",
    },
  ],
  after: async (/** @type {any[]} */ results) => {
    const created = results[0];
    if (created?.identifier) {
      const t = { id: created.identifier, state: created.state ?? "qualification" };
      openTicket(t.id, tabName(t), { pin: true });
    }
    await refresh();
  },
});

defineForm("create", createForm);
