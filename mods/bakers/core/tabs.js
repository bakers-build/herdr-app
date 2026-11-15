// Ticket tabs in the active space. Herdr's TabInfo carries no props and run() returns no
// tab id (herdr.d.ts v0.1.15), so a ticket tab is recognised by its name, "<ID> <state>"
// or "<ID> closed", and the Tickets tab by the name "Tickets". The preview tab is the
// ticket identifier in shared("bakers.preview") = {id, index}; index is where the
// replaced preview stood, applied by reconcile() once the new tab shows up.
import { focused, run, setShared, shared, spaces } from "herdr";

const NAME = /^([A-Z][A-Z0-9_]*-\d+) (\S+)$/;
const TICKETS = "Tickets";
const CLOSED = ["done", "cancelled"];
const PENDING_MS = 3000;

/** Ticket tabs asked for whose tab has not shown up yet: identifier -> time. */
let pending = new Map();

export function _resetForTests() {
  pending = new Map();
}

/** @param {{ id: string, state: string, closed?: boolean }} t */
export function tabName(t) {
  return t.closed || CLOSED.includes(t.state) ? `${t.id} closed` : `${t.id} ${t.state}`;
}

/** @param {string} name @returns {{ id: string, state: string } | null} */
export function parseName(name) {
  const m = NAME.exec(name ?? "");
  return m ? { id: m[1], state: m[2] } : null;
}

function space() {
  return spaces().find((s) => s.active) ?? null;
}

/** @returns {{ tab: any, id: string, state: string }[]} */
export function openTickets() {
  return (space()?.tabs ?? []).flatMap((tab) => {
    const p = parseName(tab.name);
    return p ? [{ tab, ...p }] : [];
  });
}

export function ticketsTab() {
  return (space()?.tabs ?? []).find((t) => t.name === TICKETS) ?? null;
}

/** @returns {{ id: string, index: number | null } | null} */
export function preview() {
  const p = /** @type {any} */ (shared("bakers.preview"));
  return p && typeof p === "object" && p.id ? p : null;
}

export function ensureTicketsTab() {
  const t = ticketsTab();
  if (t) run("tab.select", { id: t.id });
  else run("tab.new", { mod: "bakers", props: { view: "list" }, name: TICKETS });
}

/** Keeps Tickets at index 1 and moves a new preview to where the old one stood. */
export function reconcile() {
  const t = ticketsTab();
  if (t && t.index !== 1) run("tab.move", { id: t.id, index: 1 });
  const p = preview();
  if (p?.index != null) {
    const o = openTickets().find((x) => x.id === p.id);
    if (o) {
      if (o.tab.index !== p.index) run("tab.move", { id: o.tab.id, index: p.index });
      setShared("bakers.preview", { id: p.id, index: null });
    }
  }
  for (const o of openTickets()) pending.delete(o.id);
}

/**
 * Opens a ticket as the preview tab, or pinned; an open ticket is only selected.
 * @param {{ id: string, state: string, closed?: boolean }} t
 * @param {{ pin?: boolean }} [opts]
 */
export function openTicket(t, opts = {}) {
  const open = openTickets().find((o) => o.id === t.id);
  const p = preview();
  if (open) {
    run("tab.select", { id: open.tab.id });
    if (opts.pin && p?.id === t.id) setShared("bakers.preview", null);
    return;
  }
  const since = pending.get(t.id);
  if (since && Date.now() - since < PENDING_MS) {
    if (opts.pin && p?.id === t.id) setShared("bakers.preview", null);
    return;
  }
  let index = null;
  if (!opts.pin && p) {
    const old = openTickets().find((o) => o.id === p.id);
    if (old) {
      index = old.tab.index;
      run("tab.close", { id: old.tab.id });
    }
  }
  pending.set(t.id, Date.now());
  run("tab.new", { mod: "bakers", props: { view: "ticket", ticket: t.id }, name: tabName(t) });
  if (!opts.pin) setShared("bakers.preview", { id: t.id, index });
}

/** Pins the preview tab when it shows this ticket. @param {string} id */
export function pin(id) {
  if (preview()?.id === id) setShared("bakers.preview", null);
}

/**
 * Renames ticket tabs whose state changed.
 * @param {(id: string) => ({ id: string, state: string, closed?: boolean } | null)} lookup
 */
export function syncNames(lookup) {
  for (const o of openTickets()) {
    const row = lookup(o.id);
    if (!row) continue;
    const want = tabName(row);
    if (want !== o.tab.name) run("tab.rename", { id: o.tab.id, name: want });
  }
}

export function closeFinished() {
  for (const o of openTickets()) if (o.state === "closed") run("tab.close", { id: o.tab.id });
}

export function closeAll() {
  for (const o of openTickets()) run("tab.close", { id: o.tab.id });
}

/** The identifier of the focused ticket tab, or null. */
export function focusedTicket() {
  const f = focused();
  if (!f) return null;
  const tab = (space()?.tabs ?? []).find((t) => t.id === f.tab);
  return tab ? (parseName(tab.name)?.id ?? null) : null;
}
