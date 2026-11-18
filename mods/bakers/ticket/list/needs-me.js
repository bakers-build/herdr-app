// ticket/list/needs-me: the tickets waiting for you, longest waiting first (R2-4).

export default {
  id: "needs-me",
  label: "Needs me",
  derived: [(/** @type {any} */ r) => r.why !== null],
  exposed: { fields: ["id", "title"] },
  sort: [{ field: "since", dir: "asc" }],
  row: { mode: "teaser", reason: true },
  empty: "Nothing else needs you. Switch the view for Mine or Open by state.",
  count: true,
};
