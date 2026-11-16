// entity/ticket/data: loading tickets. One store per window, created on first use (never at
// module top level, AGENTS.md), shared by every copy of the mod. Records carry the raw
// ticket facts plus the derived reason and its start; presenters turn them into text.
import { setShared, shared } from "herdr";
import { register } from "../../core/actions.js";
import { read, search } from "../../core/api.js";
import { ensureProject, projectError } from "../project/data.js";
import { activeRun, deriveWhy, isClosed, since, STATES } from "./rules.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** @type {[string, string]} */
const TICKET = ["bb_ticket", "bb_ticket"];
const LIST_INCLUDE = ["runs", "labels"];
const DETAIL_INCLUDE = [
  "comments",
  "runs",
  "labels",
  "ticket_type",
  "recipe",
  "conductor_id",
  "conductor_id.machine",
  "reviewers",
  "parent_id",
];

/** A term's or a user's name. @param {any} e */
const nameOf = (e) => e?.name ?? e?.display_name ?? e?.label ?? null;

/** @param {any} r a bb_run */
const toRun = (r) => ({
  uuid: r.id,
  state: r.state,
  agent: r.agent ?? r.harness ?? null,
  started_at: r.started_at ?? null,
  closed: Boolean(r.closed),
});

/** @param {any} c a bb_comment */
const toComment = (c) => ({
  id: c.id,
  type: c.bb_comment_type ?? "comment",
  author: c.author_name ?? "",
  created: c.created,
  body: c.body ?? "",
});

/** A bb_ticket as the list needs it. @param {any} t */
function toTicket(t) {
  return {
    id: t.id,
    identifier: t.identifier,
    title: t.title,
    state: t.state,
    labels: (t.labels ?? []).map(nameOf).filter(Boolean),
    frozen: Boolean(t.frozen),
    frozen_at: t.frozen_at ?? null,
    closed: Boolean(t.closed),
    closed_date: t.closed_date ?? null,
    changed: t.changed ?? null,
    assignee: t.assignee_name ?? null,
    claim_machine: t.claim_machine ?? null,
    conductor: t.conductor_id?.id ?? null,
    runs: (t.runs ?? []).filter((/** @type {any} */ r) => r.state).map(toRun),
  };
}

/** A bb_ticket with its includes, as a ticket tab and the panel need it. @param {any} t */
function toDetail(t) {
  const c = t.conductor_id;
  return {
    ...toTicket(t),
    workflow: t.workflow ?? null,
    description: t.description ?? "",
    branch_name: t.branch_name ?? null,
    links: t.links ?? [],
    type: nameOf(t.ticket_type),
    recipe: nameOf(t.recipe),
    parent: t.parent_id?.identifier ?? null,
    reviewers: (t.reviewers ?? []).map(nameOf).filter(Boolean),
    conductorInfo: c?.type
      ? {
          label: c.label ?? null,
          online: c.status === "online",
          load: c.node_load_label ?? null,
          machine: nameOf(c.machine),
        }
      : null,
    comments: (t.comments ?? [])
      .filter((/** @type {any} */ x) => x.created)
      .map(toComment)
      .sort((/** @type {any} */ a, /** @type {any} */ b) =>
        String(a.created).localeCompare(String(b.created)),
      ),
  };
}

/** Every ticket of a project, with runs and labels. @param {string} project */
export async function listTickets(project) {
  return (
    await search(...TICKET, {
      filter: [["project_id.id", "=", project]],
      include: LIST_INCLUDE,
      sort: "-changed",
      limit: 50,
      all: true,
    })
  ).map(toTicket);
}

/** Which tickets of the project have a plan comment, and when the newest was written. @param {string} project */
export async function planComments(project) {
  const plans = await search("bb_comment", "bb_comment", {
    filter: [
      ["bb_comment_type", "=", "plan"],
      ["ticket_id.project_id.id", "=", project],
    ],
    limit: 50,
    all: true,
  });
  /** @type {Map<string, any[]>} */
  const byTicket = new Map();
  for (const c of plans) {
    const id = c.ticket_id?.id;
    if (id) byTicket.set(id, [...(byTicket.get(id) ?? []), { type: "plan", created: c.created }]);
  }
  return byTicket;
}

/**
 * One ticket with comments, runs, terms, conductor and reviewers.
 * @param {string} idOrUuid identifier or UUID
 * @param {boolean} [byUuid] it is a UUID (default: it looks like one)
 */
export async function readTicket(idOrUuid, byUuid = UUID.test(idOrUuid)) {
  const t = byUuid
    ? await read(...TICKET, idOrUuid, DETAIL_INCLUDE)
    : (
        await search(...TICKET, {
          filter: [["identifier", "=", idOrUuid]],
          include: DETAIL_INCLUDE,
          limit: 1,
        })
      )[0];
  if (!t) throw new Error(`Ticket ${idOrUuid} does not exist or is not readable.`);
  return toDetail(t);
}

/** The ticket's activity, newest first. @param {string} ticketUuid */
export async function listActivity(ticketUuid) {
  const rows = await search("bb_activity", "bb_activity", {
    filter: [["ticket_id.id", "=", ticketUuid]],
    include: ["actor"],
    sort: "-created",
    limit: 20,
  });
  return rows.map((a) => ({
    kind: a.kind,
    previous: a.previous_state ?? null,
    next: a.new_state ?? null,
    step: a.step ?? null,
    created: a.created,
    actor: nameOf(a.actor),
  }));
}

/** Identifier or title words, within the project. @param {string} query @param {string} project */
export async function searchTickets(query, project) {
  const q = query.trim();
  const inProject = /** @type {[string, string, string]} */ (["project_id.id", "=", project]);
  const [byId, byTitle] = await Promise.all([
    search(...TICKET, {
      filter: [inProject, ["identifier", "STARTS_WITH", q.toUpperCase()]],
      limit: 10,
    }),
    search(...TICKET, {
      filter: [inProject, ["title", "CONTAINS", q]],
      sort: "-changed",
      limit: 10,
    }),
  ]);
  const seen = new Set();
  return [...byId, ...byTitle]
    .filter((t) => !seen.has(t.id) && seen.add(t.id))
    .slice(0, 10)
    .map((t) => ({ identifier: t.identifier, title: t.title, state: t.state, closed: t.closed }));
}

/** The project's conductors with their machine and load. @param {string} project */
export async function listConductors(project) {
  const rows = await search("bb_conductor", "bb_conductor", {
    filter: [["project_id.id", "=", project]],
    include: ["machine"],
    limit: 50,
  });
  return rows.map((c) => ({
    uuid: c.id,
    name: c.label ?? c.conductor_name ?? c.id,
    machine: nameOf(c.machine),
    online: c.status === "online",
    load: c.node_load_label ?? null,
  }));
}

/**
 * @param {any} api the loaders (listTickets, planComments, readTicket)
 * @param {{ now?: () => number }} [options]
 */
export function createStore(api, options = {}) {
  const now = options.now ?? (() => Date.now());
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
          api.listTickets(store.project),
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

    /** A fresh detail for a ticket tab or the panel. @param {string} idOrUuid */
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
      else if (name === "closed")
        rows = rows
          .filter((/** @type {any} */ r) => r.closed)
          .sort((/** @type {any} */ a, /** @type {any} */ b) =>
            String(b.closedDate ?? "").localeCompare(String(a.closedDate ?? "")),
          );
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
  if (!store) store = createStore({ listTickets, planComments, readTicket });
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
