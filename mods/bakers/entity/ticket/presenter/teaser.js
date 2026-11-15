// presenter/teaser: a ticket as one row of the Tickets tab (R2-4): Ticket, Title, Why (or
// State outside Needs me), Agent, Age; plus the columns and the hints below the rows.
import { age } from "../../../core/format.js";
import { agentLine } from "./agent.js";

export const KEY_HINT =
  "Enter opens the preview tab, cmd-Enter a pinned tab, N a new ticket, / the filter, R refreshes. Up and down move the selection; the Ticket panel, when shown, follows it.";

/** @param {string} view */
export function columns(view) {
  return [
    { label: "TICKET", w: 76 },
    { label: "TITLE", w: null },
    { label: view === "needs-me" ? "WHY" : "STATE", w: 170 },
    { label: "AGENT", w: 150 },
    { label: "AGE", w: 44 },
  ];
}

/** @param {any} record @param {{ view: string, selected: boolean, now: number }} o */
export function teaser(record, o) {
  const agent = agentLine(record, null, o.now);
  return {
    key: record.id,
    selected: o.selected,
    cells: [
      { text: record.id, mono: true },
      { text: record.title ?? "", truncate: true },
      o.view === "needs-me"
        ? { text: record.why ?? "", tone: "blocked", strong: true }
        : { text: record.state, tone: "muted" },
      { status: { tone: agent.tone, ring: agent.ring, text: agent.text } },
      { text: record.since == null ? "" : age(o.now - record.since), tone: "muted", size: 12 },
    ],
  };
}

/** The hint below the rows. @param {string} view @param {string} query */
export function emptyHint(view, query) {
  if (query) return `Nothing else matches "${query}".`;
  if (view === "needs-me")
    return "Nothing else needs you. Switch the view for Mine or Open by state.";
  if (view === "mine") return "Mine needs the assignee from the bakers API.";
  if (view === "closed") return "No other closed tickets.";
  if (view.startsWith("state:")) return `No other tickets in ${view.slice(6)}.`;
  return "No other open tickets.";
}
