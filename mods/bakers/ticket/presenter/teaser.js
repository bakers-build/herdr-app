// ticket/presenter/teaser: a ticket as one row of a list (R2-4): Ticket, Title, Why (or State),
// Agent, Age; plus the columns and the key hint.
import { age } from "../../core/format.js";
import { agentStatus } from "./card.js";

export { KEY_HINT } from "./card.js";

/** @param {boolean} reason the list shows why a ticket needs you (Needs me) instead of its state */
export function columns(reason) {
  return [
    { label: "TICKET", w: 76 },
    { label: "TITLE", w: null },
    { label: reason ? "WHY" : "STATE", w: 170 },
    { label: "AGENT", w: 150 },
    { label: "AGE", w: 44 },
  ];
}

/** @param {any} record @param {{ reason: boolean, selected: boolean, now: number }} o */
export function teaser(record, o) {
  return {
    key: record.id,
    selected: o.selected,
    cells: [
      { text: record.id, mono: true },
      { text: record.title ?? "", truncate: true },
      o.reason
        ? { text: record.why ?? "", tone: "blocked", strong: true }
        : { text: record.state, tone: "muted" },
      { status: agentStatus(record, o.now) },
      { text: record.since == null ? "" : age(o.now - record.since), tone: "muted", size: 12 },
    ],
  };
}
