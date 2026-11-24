// ticket/store: the tickets of the window's project, in memory, shared by every copy of the
// mod (created on first use, never at module top level, AGENTS.md). A refresh reads the open
// tickets with the selected one (also when closed), and the open tickets' plan comments, and
// derives who needs you from them.
import { setShared } from "herdr";
import { selectedTicket } from "./tabs.js";
import { ensureProject, projectError } from "../project/state.js";
import * as repository from "./repository.js";
import { activeRun, deriveWhy, isClosed, since } from "./rules.js";

/**
 * @param {any} api the loaders (listOpen, planComments, readTicket)
 * @param {{ now?: () => number, tabs?: () => string[] }} [options] tabs: identifiers read with the open tickets (the selected one)
 */
export function createStore(api, options = {}) {
  const now = options.now ?? (() => Date.now());
  const tabs = options.tabs ?? (() => []);
  const listeners = new Set();
  /** @type {Map<string, any>} uuid -> detail (a ticket read) */
  const details = new Map();
  /** @type {Map<string, any>} uuid -> derived facts from the list */
  const facts = new Map();
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
        facts.clear();
      }
      store.project = project;
      await store.refresh();
    },

    async refresh() {
      if (!store.project) return;
      store.loading = true;
      try {
        const [list, plans] = await Promise.all([
          api.listOpen(store.project, tabs()),
          api.planComments(store.project),
        ]);
        facts.clear();
        for (const t of list) {
          const comments = plans.get(t.id) ?? [];
          const why = deriveWhy(t, comments, t.runs);
          facts.set(t.id, { why, since: since(t, comments, t.runs, why), run: activeRun(t.runs) });
        }
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

    /** Reads one ticket with everything a tab or the panel shows. @param {string} id @param {boolean} [byUuid] */
    async enrich(id, byUuid) {
      const ticket = await api.readTicket(id, byUuid);
      const comments = ticket?.comments ?? [];
      const runs = ticket?.runs ?? [];
      const why = deriveWhy(ticket, comments, runs);
      const detail = { ticket, comments, runs, why, since: since(ticket, comments, runs, why) };
      details.set(ticket?.id ?? id, detail);
      return detail;
    },

    /** A fresh detail for the panel. @param {string} idOrUuid */
    async ticket(idOrUuid) {
      const row = store.byId(idOrUuid);
      return row ? store.enrich(row.uuid, true) : store.enrich(idOrUuid);
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
      const f = facts.get(t.id);
      const d = details.get(t.id);
      const closed = isClosed(t);
      return {
        id: t.identifier,
        uuid: t.id,
        title: t.title,
        state: t.state,
        labels: t.labels ?? [],
        why: closed ? null : (f?.why ?? null),
        since: f?.since ?? null,
        run: f?.run ?? null,
        machine: t.claim_machine ?? null,
        conductor: t.conductor ?? null,
        assignee: t.assignee ?? null,
        comments: d?.comments ?? [],
        closed,
        closedDate: t.closed_date ?? null,
        frozen: Boolean(t.frozen),
      };
    },

    /** Every record of the open tickets; lists (ticket/list) select from these. */
    records() {
      return store.tickets.map((/** @type {any} */ t) => store.row(t));
    },

    needs() {
      const ids = store
        .records()
        .filter((/** @type {any} */ r) => r.why)
        .sort((/** @type {any} */ a, /** @type {any} */ b) => (a.since ?? 0) - (b.since ?? 0))
        .map((/** @type {any} */ r) => r.id);
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
  if (!store)
    store = createStore(repository, { tabs: () => [selectedTicket() ?? ""].filter(Boolean) });
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
