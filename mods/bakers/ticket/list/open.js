// ticket/list/open: every open ticket, grouped by state in workflow order; with Show closed
// tickets also the closed ones loaded so far.
import { STATES } from "../rules.js";

export default {
  id: "open",
  label: "Open by state",
  derived: [(/** @type {any} */ r, /** @type {any} */ ctx) => ctx.showClosed || !r.closed],
  exposed: { fields: ["id", "title"] },
  group: { by: "state", order: STATES },
  row: { mode: "teaser" },
  empty: "No other open tickets.",
  count: true,
};
