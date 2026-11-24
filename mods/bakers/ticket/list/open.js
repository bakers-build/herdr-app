// ticket/list/open: every open ticket, grouped by state in workflow order.
import { STATES } from "../rules.js";

export default {
  id: "open",
  label: "Open by state",
  derived: [(/** @type {any} */ r) => !r.closed],
  exposed: { fields: ["id", "title"] },
  group: { by: "state", order: STATES },
  empty: "No other open tickets.",
  count: true,
};
