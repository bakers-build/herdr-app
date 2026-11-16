// ticket/list/state: the open tickets in one state; the state is the argument
// ("state:working").
import { defineList } from "../../list/registry.js";

const cap = (/** @type {string} */ s) => s.charAt(0).toUpperCase() + s.slice(1);

export default defineList({
  id: "state",
  label: (/** @type {string[]} */ args) => cap(args[0] ?? ""),
  sub: true,
  filters: [{ field: "state", op: "=", value: (/** @type {any} */ ctx) => ctx.args[0] }],
  exposed: { fields: ["id", "title"] },
  row: { mode: "teaser" },
  empty: (/** @type {string[]} */ args) => `No other tickets in ${args[0]}.`,
  count: true,
});
