// ticket/operations/more: the "..." menu of a ticket: Freeze... or Unfreeze..., Cancel run...
// (only while a run is active), Copy identifier. Each opens its form or runs its action.

/** @param {{ ticket: any, runs: any[] }} detail */
export function moreItems(detail) {
  const tk = detail.ticket;
  const id = tk.identifier;
  return [
    {
      label: tk.frozen ? "Unfreeze..." : "Freeze...",
      action: ["form.open", tk.frozen ? "unfreeze" : "freeze", { ticket: id }],
    },
    {
      label: "Cancel run...",
      action: ["form.open", "cancel", { ticket: id }],
      disabled: !(detail.runs ?? []).some((r) => !r.closed),
    },
    { label: "Copy identifier", action: ["copy", id], separator: true },
  ];
}
