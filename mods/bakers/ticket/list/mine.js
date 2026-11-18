// ticket/list/mine: the tickets assigned to you. The mod does not know the signed-in user
// yet, so the list stays empty and carries the API chip.

export default {
  id: "mine",
  label: "Mine",
  api: true,
  disabled: true,
  derived: [() => false],
  row: { mode: "teaser" },
  empty: "Mine needs the signed-in user from the bakers API.",
  count: false,
};
