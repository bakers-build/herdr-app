// ticket/store: the tickets of the window's project, in memory, shared by every copy of the
// mod (created on first use, never at module top level, AGENTS.md). A refresh reads the open
// tickets with the selected one (also when closed), and the open tickets' plan comments, and
// derives who needs you from them. Beside them it reads the project's workspace catalog (labels
// and ticket types) for the menus, in the background: the tickets never wait for it, a failed
// read is kept as its error, and onCatalog tells when one lands. Loads run in the long-lived
// copies (the list, the window task): Herdr ends a closed overlay's tasks, so a load started
// there may never answer.
import { setShared } from "herdr";
import { selectedTicket } from "./tabs.js";
import { ensureProject, PROJECT_TIMEOUT_MS, projectError } from "../project/state.js";
import * as repository from "./repository.js";
import { named } from "./model.js";
import { activeRun, deriveWhy, isClosed, since } from "./rules.js";

/**
 * @param {any} api the loaders (listOpen, planComments, readTicket; listCatalog when served)
 * @param {{ now?: () => number, tabs?: () => string[], onCatalog?: (project: string) => void }} [options]
 *   tabs: identifiers read with the open tickets (the selected one); onCatalog: a catalog read landed
 */
export function createStore(api, options = {}) {
  const now = options.now ?? (() => Date.now());
  const tabs = options.tabs ?? (() => []);
  const listeners = new Set();
  /** @type {Map<string, any>} uuid -> detail (a ticket read) */
  const details = new Map();
  /** @type {Map<string, any>} uuid -> derived facts from the list */
  const facts = new Map();
  /** The newest catalog read; an older one landing later is dropped. */
  let catalogRead = 0;
  /** @type {Promise<void> | null} the user read under way; at most one at a time */
  let readingUser = null;
  /** Reads the signed-in user while there is none; a read that ends after a project switch is dropped. */
  const readUser = () => {
    if (store.user || readingUser) return readingUser;
    const project = store.project;
    readingUser = (async () => {
      /** @type {any} */
      let user = null;
      try {
        user = (await api.currentUser?.()) ?? null;
      } catch {
        user = null;
      }
      readingUser = null;
      if (!user || store.project !== project) return;
      store.user = user;
      for (const fn of listeners) fn(store);
    })();
    return readingUser;
  };
  /** The project's catalog, or its error with no values; null when the api serves none. @param {string} project */
  const readCatalog = async (project) => {
    if (!api.listCatalog) return null;
    try {
      const c = await api.listCatalog(project);
      return { labels: c?.labels ?? [], types: c?.types ?? [], names: c?.names ?? {}, error: null };
    } catch (error) {
      return { labels: [], types: [], names: {}, error };
    }
  };
  /** @type {any} */
  const store = {
    project: null,
    tickets: [],
    error: null,
    loading: false,
    updated: null,
    /** @type {{ uuid: string, name: string, names: string[] } | null} the signed-in user */
    user: null,
    /** @type {import("./filter.js").Catalog | null} the workspace's labels and types; null until read */
    catalog: null,
    /** @type {Promise<void>} the catalog read under way (tests await it) */
    catalogRead: Promise.resolve(),

    /** A switch from another project forgets its rows, time, failure and selection.
     *  @param {string} project */
    async load(project) {
      if (project !== store.project) {
        if (store.project) setShared("bakers.selected", null);
        store.tickets = [];
        store.updated = null;
        store.error = null;
        details.clear();
        facts.clear();
        store.user = null;
        store.catalog = null;
      }
      store.project = project;
      await store.refresh();
    },

    /** Reads the open tickets, then the signed-in user while it is unknown (a failed read is
     *  retried). A read that answers after a project switch is dropped. */
    async refresh() {
      const project = store.project;
      if (!project) return;
      store.loading = true;
      const reads = Promise.all([api.listOpen(project, tabs()), api.planComments(project)]);
      const seq = ++catalogRead;
      store.catalogRead = readCatalog(project).then((read) => {
        if (!read || store.project !== project || seq !== catalogRead) return;
        // A failed read keeps the last good catalog of the project; the error shows only without one.
        if (!read.error || !store.catalog || store.catalog.error) store.catalog = read;
        const names = store.catalog?.names;
        store.tickets = store.tickets.map((/** @type {any} */ t) => named(t, names));
        // a panel read before the catalog arrived holds bare term refs too
        for (const [k, d] of details) details.set(k, { ...d, ticket: named(d.ticket, names) });
        for (const fn of listeners) fn(store);
        options.onCatalog?.(project);
      });
      try {
        const [list, plans] = await reads;
        if (store.project !== project) return;
        facts.clear();
        for (const t of list) {
          const comments = plans.get(t.id) ?? [];
          const why = deriveWhy(t, comments, t.runs);
          facts.set(t.id, { why, since: since(t, comments, t.runs, why), run: activeRun(t.runs) });
        }
        store.tickets = list.map((/** @type {any} */ t) => named(t, store.catalog?.names));
        store.error = null;
        store.updated = now();
      } catch (e) {
        if (store.project !== project) return;
        store.error = e;
      } finally {
        if (store.project === project) store.loading = false;
      }
      for (const fn of listeners) fn(store);
      await readUser();
    },

    /** Reads one ticket with everything a tab or the panel shows. @param {string} id @param {boolean} [byUuid] */
    async enrich(id, byUuid) {
      const ticket = named(await api.readTicket(id, byUuid), store.catalog?.names);
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
        type: t.type ?? null,
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
/**
 * The load under way, for one project. A load for another project, or one older than
 * PROJECT_TIMEOUT_MS (a closed copy's that never answers), does not hold up a new one; the new
 * one releases whoever still waits for the old.
 * @type {{ project: string, started: number, promise: Promise<void>, settle: () => void } | null}
 */
let loading = null;

/** Whether a load of a project under way is recent enough to wait for. @param {string} project */
const loadingFresh = (project) =>
  loading?.project === project && Date.now() - loading.started < PROJECT_TIMEOUT_MS;

export function _resetForTests() {
  store = null;
  loading = null;
}

export function getStore() {
  if (!store)
    store = createStore(repository, {
      tabs: () => [selectedTicket() ?? ""].filter(Boolean),
      // every copy redraws, so the menus and the picker show the catalog once it is there
      onCatalog: (project) => setShared("bakers.catalog", { project, at: Date.now() }),
    });
  return store;
}

/** The project, with the store loaded for it; null when there is none. */
export async function ready() {
  const p = await ensureProject();
  if (!p) return null;
  if (needsLoad(p.uuid)) await startLoad(p.uuid);
  else if (loadingFresh(p.uuid)) await loading?.promise;
  return p;
}

/** Whether the store lacks the project and no recent load of it is under way.
 *  @param {string} project */
export function needsLoad(project) {
  if (loadingFresh(project)) return false;
  return getStore().project !== project || loading?.project === project;
}

/** @param {string} project */
function startLoad(project) {
  const previous = loading;
  /** @type {() => void} */
  let settle = () => {};
  const promise = new Promise((ok) => (settle = () => ok(undefined)));
  const own = { project, started: Date.now(), promise, settle };
  loading = own;
  previous?.settle();
  const done = () => {
    if (loading === own) loading = null;
    settle();
  };
  getStore().load(project).then(done, done);
  return promise;
}

/** The failure to show: the project's, else the last refresh's. */
export const loadError = () => projectError() ?? getStore().error;

/** Reads the project's tickets again and shares the needs-you count with every copy (rail, tab
 *  bar, status). It reads anew rather than wait for a load under way, which may never answer. */
export async function refresh() {
  const p = await ensureProject();
  if (!p) return;
  const s = getStore();
  if (s.project === p.uuid) await s.refresh();
  else await ready();
  publishNeeds();
}

export function publishNeeds() {
  const s = getStore();
  const needs = s.needs();
  setShared("bakers.needs", { count: needs.count, ids: needs.ids, updated: s.updated });
}
