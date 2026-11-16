// form/edit: title and description of a ticket, edited in place. The description is
// replaced whole without a revision check (API), so the form warns once when the ticket
// changed since editing began; sending again saves over it.
import * as actions from "../commands.js";
import { readTicket } from "../repository.js";
import { stamp } from "../rules.js";

/** @param {any} ticket */
export function editForm(ticket) {
  const id = ticket.identifier;
  const base = stamp(ticket);
  return {
    kind: "inline",
    gap: 8,
    fields: [
      { name: "title", type: "input", value: ticket.title ?? "", size: 22, strong: true },
      {
        name: "description",
        type: "textarea",
        value: ticket.description ?? "",
        rows: 10,
        size: 13,
        heading: "Description",
      },
    ],
    hint: "cmd-Enter saves, Esc cancels",
    buttons: [],
    defaultVariant: "save",
    check: async () =>
      stamp(await readTicket(id)) !== base
        ? `${id} changed since you started editing. cmd-Enter again saves over it.`
        : null,
    steps: [
      {
        run: (/** @type {any} */ v) =>
          actions.edit(id, { title: v.title, description: v.description }),
        failed: "Not saved",
      },
    ],
  };
}
