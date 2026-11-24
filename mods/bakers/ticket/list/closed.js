// ticket/list/closed: closed tickets, newest closing first. Closed tickets grow without end,
// so the server filters, sorts and pages them (50 at a time).
import { query } from "../repository.js";

export default {
  id: "closed",
  label: "Recently closed",
  dim: true,
  query: {
    filters: [
      { field: "project_id.id", op: "=", value: (/** @type {any} */ ctx) => ctx.project },
      { field: "closed", op: "=", value: true },
    ],
    sort: "-closed_date",
  },
  load: query,
  exposed: { fields: ["id", "title"] },
  pager: { type: "more", limit: 50 },
  empty: "No other closed tickets.",
  count: false,
};
