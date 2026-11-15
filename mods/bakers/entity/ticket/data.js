// entity/ticket/data: loading tickets. One store per window, created on first use (never at
// module top level, AGENTS.md), shared by every copy of the mod. Records carry the raw
// ticket facts plus the derived reason and its start; presenters turn them into text.
import { setShared, shared } from "herdr";
import { register } from "../../core/actions.js";
import { call } from "../../core/cli.js";
import { ensureProject, projectError } from "../project/data.js";
import { activeRun, deriveWhy, isClosed, since, STATES } from "./rules.js";

const LIMIT = 4;

/** Every ticket of a project, all pages. @param {string} project */
export async function listTickets(project) {
  const out = [];
  let offset = 0;
  for (let page = 0; page < 50; page++) {
    const r = await call("bakers_ticket_list", { project, limit: 100, offset });
    out.push(...(r?.tickets ?? []));
    if (r?.next_offset == null || r.next_offset <= offset) break;
    offset = r.next_offset;
  }
  return out;
}

/** @param {string} ticket */
export const readTicket = (ticket) => call("bakers_ticket_read", { ticket, newest: 50 });
/** @param {string} ticket */
export const listRuns = async (ticket) =>
  (await call("bakers_ticket_runs_list", { ticket, limit: 20 }))?.runs ?? [];
/** @param {string} ticket */
export const listActivity = async (ticket) =>
  (await call("bakers_ticket_activity_list", { ticket }))?.activity ?? [];
/** @param {string} query @param {string} project */
export const searchTickets = async (query, project) =>
  (await call("bakers_ticket_search", { query, project }))?.tickets ?? [];
/** @param {string} project */
export const listConductors = async (project) =>
  (await call("bakers_conductor_list", { project }))?.conductors ?? [];

/** Runs fn over items with at most `limit` in flight. @param {any[]} items @param {number} limit @param {(item: any) => Promise<void>} fn */
async function pool(items, limit, fn) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/**
 * @param {any} api the loaders (listTickets, readTicket, listRuns)
 * @param {{ now?: () => number }} [options]
 */
export function createStore(api, options = {}) {
  const now = options.now ?? (() => Date.now());
  const listeners = new Set();
  /** @type {Map<string, any>} uuid -> detail */
  const details = new Map();
  const cacheKeys = new Map();
  /** @type {any} */
  const store = {
    project: null,
    tickets: [],
    error: null,
    loading: false,
    updated: null,

    /** @param {string} project */
    async load(project) {
      if (project !== store.project) {
        store.tickets = [];
        details.clear();
        cacheKeys.clear();
      }
      store.project = project;
      await store.refresh();
    },

    async refresh() {
      if (!store.project) return;
      store.loading = true;
      try {
        const list = await api.listTickets(store.project);
        const open = list.filter((/** @type {any} */ t) => !isClosed(t));
        await pool(open, LIMIT, async (/** @type {any} */ t) => {
          const key = t.revision ?? t.changed ?? null;
          if (key != null && cacheKeys.get(t.id) === key && details.has(t.id)) return;
          try {
            await store.enrich(t.id);
            if (key != null) cacheKeys.set(t.id, key);
          } catch {
            // the row still shows from the list
          }
        });
        store.tickets = list;
        store.error = null;
        store.updated = now();
      } catch (e) {
        store.error = e;
      } finally {
        store.loading = false;
      }
      for (const fn of listeners) fn(store);
    },

    /** Reads one ticket with its runs and keeps the derived facts. @param {string} id */
    async enrich(id) {
      const [ticket, runs] = await Promise.all([api.readTicket(id), api.listRuns(id)]);
      const comments = ticket?.comments ?? [];
      const why = deriveWhy(ticket, comments, runs);
      const detail = { ticket, comments, runs, why, since: since(ticket, comments, runs, why) };
      details.set(ticket?.id ?? id, detail);
      return detail;
    },

    /** A fresh detail for a ticket tab or the panel. @param {string} idOrUuid */
    async ticket(idOrUuid) {
      const row = store.byId(idOrUuid);
      return store.enrich(row?.uuid ?? idOrUuid);
    },

    /** @param {string} idOrUuid */
    cached(idOrUuid) {
      const row = store.byId(idOrUuid);
      return details.get(row?.uuid ?? idOrUuid) ?? null;
    },

    /** @param {string} idOrUuid */
    byId(idOrUuid) {
      const t = store.tickets.find(
        (/** @type {any} */ x) => x.identifier === idOrUuid || x.id === idOrUuid,
      );
      return t ? store.row(t) : null;
    },

    /** A list record: the raw facts and the derived reason. @param {any} t */
    row(t) {
      const d = details.get(t.id);
      const closed = isClosed(t);
      const why = closed ? null : (d?.why ?? deriveWhy(t, [], []));
      return {
        id: t.identifier,
        uuid: t.id,
        title: t.title,
        state: t.state,
        labels: t.labels ?? [],
        why,
        since: d?.since ?? (why === "Asked a question" ? since(t, [], [], why) : null),
        run: activeRun(d?.runs),
        conductor: d?.ticket?.conductor ?? null,
        comments: d?.comments ?? [],
        closed,
        frozen: Boolean(t.frozen),
      };
    },

    /**
     * @param {string} name needs-me | mine | open | state:<state> | closed
     * @param {{ filter?: string, showClosed?: boolean }} [opts]
     */
    view(name, opts = {}) {
      const q = (opts.filter ?? "").trim().toLowerCase();
      let rows = store.tickets.map((/** @type {any} */ t) => store.row(t));
      if (name === "mine") return [];
      if (name === "needs-me")
        rows = rows
          .filter((/** @type {any} */ r) => r.why)
          .sort((a, b) => (a.since ?? 0) - (b.since ?? 0));
      else if (name === "closed") rows = rows.filter((/** @type {any} */ r) => r.closed);
      else if (name.startsWith("state:"))
        rows = rows.filter((/** @type {any} */ r) => r.state === name.slice(6));
      else {
        const order = (/** @type {any} */ r) => {
          const i = STATES.indexOf(r.state);
          return i < 0 ? STATES.length + (r.closed ? 1 : 0) : i;
        };
        rows = rows.filter((/** @type {any} */ r) => opts.showClosed || !r.closed);
        rows = rows
          .map((r, i) => ({ r, i }))
          .sort((a, b) => order(a.r) - order(b.r) || a.i - b.i)
          .map((/** @type {any} */ x) => x.r);
      }
      if (q)
        rows = rows.filter(
          (/** @type {any} */ r) =>
            r.id.toLowerCase().includes(q) || (r.title ?? "").toLowerCase().includes(q),
        );
      return rows;
    },

    counts() {
      const rows = store.tickets.map((/** @type {any} */ t) => store.row(t));
      const open = rows.filter((/** @type {any} */ r) => !r.closed);
      const byState = {};
      for (const s of STATES) {
        const n = open.filter((/** @type {any} */ r) => r.state === s).length;
        if (n) byState[s] = n;
      }
      return {
        needsMe: open.filter((/** @type {any} */ r) => r.why).length,
        mine: null,
        open: open.length,
        byState,
        recentlyClosed: rows.length - open.length,
      };
    },

    needs() {
      const ids = store.view("needs-me").map((/** @type {any} */ r) => r.id);
      return { count: ids.length, ids };
    },

    /** @param {(store: any) => void} fn */
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  return store;
}

/** @type {any} */
let store = null;
/** @type {Promise<any> | null} */
let loading = null;

export function _resetForTests() {
  store = null;
  loading = null;
}

export function getStore() {
  if (!store) store = createStore({ listTickets, readTicket, listRuns });
  return store;
}

/** The project, with the store loaded for it; null when there is none. */
export async function ready() {
  const p = await ensureProject();
  if (!p) return null;
  const s = getStore();
  if (s.project !== p.uuid || loading) {
    if (!loading) loading = s.load(p.uuid).finally(() => (loading = null));
    await loading;
  }
  return p;
}

/** The failure to show: the project's, else the last refresh's. */
export const loadError = () => projectError() ?? getStore().error;

/** Refreshes and shares the needs-you count with every copy (rail, tab bar, status). */
export async function refresh() {
  if (!(await ready())) return;
  await getStore().refresh();
  publishNeeds();
}

export function publishNeeds() {
  const s = getStore();
  const needs = s.needs();
  setShared("bakers.needs", { count: needs.count, ids: needs.ids, updated: s.updated });
}

/** The Tickets tab's view (shared, so the sidebar and the view menu agree). */
export const currentView = () => /** @type {string} */ (shared("bakers.view")) ?? "needs-me";
/** @param {string} view */
export const setView = (view) => setShared("bakers.view", view);
export const showClosed = () => Boolean(shared("bakers.showClosed"));

register("ticket.refresh", () => refresh());
register("ticket.view", (view) => setView(view));
register("ticket.toggleClosed", () => setShared("bakers.showClosed", !showClosed()));
