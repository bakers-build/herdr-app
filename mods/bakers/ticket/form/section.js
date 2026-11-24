// ticket/form/section: one Markdown section of the ticket panel (description, acceptance,
// summary) edited in a popup. cmd-Enter saves (keys "inline"), Esc writes nothing. Comments
// are create-only, so acceptance and summary post a new comment of that type and the panel
// shows the newest; the description is replaced whole. An empty, unchanged or oversized text
// writes nothing. Saving warns once when the section changed since the popup opened.
import { utf8Bytes } from "../../core/format.js";
import * as actions from "../commands.js";
import { readTicket } from "../repository.js";
import { isClosed, newest, SECTION_LIMITS } from "../rules.js";
import { getStore, ready, refresh } from "../store.js";

/** @typedef {"description" | "acceptance" | "summary"} Section */

const CLOSED = "A closed ticket cannot be changed any more.";

/** The section's text and the stamp that changes when someone else saves it. @param {any} ticket @param {any[]} comments @param {Section} section */
export function sectionText(ticket, comments, section) {
  if (section === "description") {
    const text = ticket?.description ?? "";
    return { text, stamp: text };
  }
  const c = newest(comments, section);
  return { text: c?.body ?? "", stamp: c?.id ?? null };
}

const capital = (/** @type {string} */ s) => s.charAt(0).toUpperCase() + s.slice(1);

/** @param {{ ticket: string, section: Section }} p */
export async function sectionForm(p) {
  const id = p.ticket;
  const section = p.section;
  await ready();
  const detail = await getStore().ticket(id);
  const opened = sectionText(detail.ticket, detail.comments, section);
  const limit = SECTION_LIMITS[section];
  let closedMeanwhile = false;
  return {
    kind: "dialog",
    keys: "inline",
    title: `Edit ${section} of ${id}`,
    text:
      section === "description"
        ? "Saving replaces the description."
        : `Saving posts a new ${section} comment; the panel and later runs read the newest.`,
    fields: [{ name: "body", type: "textarea", rows: 16, size: 12, value: opened.text }],
    hint: "cmd-Enter saves, Esc cancels",
    keep: "Cancel",
    submit: "Save",
    validate: (/** @type {any} */ v) => {
      const text = String(v.body ?? "").trim();
      if (!text) return { body: "Write something first." };
      if (text === opened.text.trim()) return { body: "Nothing changed." };
      const n = utf8Bytes(text);
      return n > limit ? { body: `${n} bytes; the limit is ${limit}.` } : null;
    },
    check: async () => {
      const t = await readTicket(id);
      if (isClosed(t)) {
        closedMeanwhile = true;
        return CLOSED;
      }
      return sectionText(t, t.comments, section).stamp !== opened.stamp
        ? `A newer ${section} of ${id} arrived since you opened this. cmd-Enter again saves over it.`
        : null;
    },
    steps: [
      {
        run: (/** @type {any} */ v) => {
          // The check warns once; a ticket closed meanwhile stays unwritten on the second send.
          if (closedMeanwhile) throw new Error(CLOSED);
          const text = String(v.body).trim();
          return section === "description"
            ? actions.describe(id, text)
            : actions.publish(id, section, text);
        },
        failed: "Not saved",
      },
    ],
    success: `${capital(section)} of ${id} saved`,
    after: refresh,
  };
}
