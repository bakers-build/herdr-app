// The project's tickets and the facts derived from them, in memory per mod copy.
// Needs-you is derived (the bakers API has no such field):
//   frozen + label Question                 -> "Asked a question"
//   state plan + a plan comment + no run    -> "Plan ready for approval"
//   state review                            -> "Ready for review"
import { agentName, age, toMs } from "./format.js";

export const STATES = ["qualification", "plan", "working", "review"];
const CLOSED = ["done", "cancelled"];
const LIMIT = 4;

/**
 * @param {any} ticket
 * @param {any[]} comments
 * @param {any[]} runs
 * @returns {string | null}
 */
export function deriveWhy(ticket, comments, runs) {
  if (!ticket || ticket.closed || CLOSED.includes(ticket.state)) return null;
  if (ticket.frozen && (ticket.labels ?? []).includes("Question")) return "Asked a question";
  if (
    ticket.state === "plan" &&
    (comments ?? []).some((/** @type {any} */ c) => c.type === "plan") &&
    !(runs ?? []).some((/** @type {any} */ r) => !r.closed)
  )
    return "Plan ready for approval";
  if (ticket.state === "review") return "Ready for review";
  return null;
}

/** When the reason to act began, in ms. @param {any} ticket @param {any[]} comments @param {any[]} runs @param {string | null} why */
function since(ticket, comments, runs, why) {
  if (why === "Asked a question") return toMs(ticket.frozen_at);
  if (why === "Plan ready for approval") {
    const plans = (comments ?? []).filter((/** @type {any} */ c) => c.type === "plan");
    return toMs(plans[plans.length - 1]?.created);
  }
  const started = (runs ?? [])
    .map((/** @type {any} */ r) => toMs(r.started_at))
    .filter((/** @type {any} */ v) => v != null);
  return started.length ? Math.max(...started) : null;
}

/** The agent column and line. @param {any} ticket @param {any[]} runs @param {string | null} why */
export function agentLine(ticket, runs, why) {
  const run = (runs ?? []).find((/** @type {any} */ r) => !r.closed);
  if (run) {
    const name = agentName(run.agent);
    if (why === "Asked a question")
      return { text: `${name} needs you`, tone: "blocked", run: true };
    return {
      text: `${name} ${run.state === "running" ? "working" : run.state}`,
      tone: "working",
      run: true,
    };
  }
  return {
    text: ticket?.conductor ? "No active run" : "No active run, no conductor",
    tone: "muted",
    run: false,
  };
}

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
 * @param {any} api the lib/api.js wrappers (listTickets, readTicket, listRuns)
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
        const open = list.filter((/** @type {any} */ t) => !t.closed && !CLOSED.includes(t.state));
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
      const detail = {
        ticket,
        comments,
        runs,
        why,
        agent: agentLine(ticket, runs, why),
        since: since(ticket, comments, runs, why),
      };
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

    row(t) {
      const d = details.get(t.id);
      const closed = Boolean(t.closed) || CLOSED.includes(t.state);
      const why = closed ? null : (d?.why ?? deriveWhy(t, [], []));
      const start = d?.since ?? (why === "Asked a question" ? toMs(t.frozen_at) : null);
      return {
        id: t.identifier,
        uuid: t.id,
        title: t.title,
        state: t.state,
        why,
        agent: d?.agent ?? agentLine(t, [], why),
        since: start,
        age: start == null ? "" : age(now() - start),
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
