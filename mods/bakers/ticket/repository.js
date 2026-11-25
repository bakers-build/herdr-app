// ticket/repository: reading tickets and what belongs to them through JSON:API
// (core/api.js), the only place in the module that reads. Returns model objects.
import { me, read, search } from "../core/api.js";
import { nameOf, toDetail, toRun, toTicket } from "./model.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** @type {[string, string]} */
const TICKET = ["bb_ticket", "bb_ticket"];
const LIST_INCLUDE = ["labels", "ticket_type"];
/** What the list rows and the store read of a ticket, a run and a plan comment. */
const LIST_FIELDS = {
  "bb_ticket--bb_ticket": [
    "identifier",
    "title",
    "state",
    "labels",
    "frozen",
    "frozen_at",
    "closed",
    "closed_date",
    "changed",
    "assignee_name",
    "ticket_type",
    "claim_machine",
    "conductor_id",
  ],
};
const RUN_FIELDS = {
  "bb_run--bb_run": ["state", "agent", "harness", "started_at", "closed", "ticket_id"],
};
const PLAN_FIELDS = { "bb_comment--bb_comment": ["created", "ticket_id"] };
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

/**
 * The open tickets of a project, with labels and type (their runs: listRuns): the base of the open lists. The
 * tickets of open tabs come along, closed or not, so their tabs can follow the state.
 * @param {string} project @param {string[]} [tabs] identifiers read besides the open tickets (the selected one)
 */
export async function listOpen(project, tabs = []) {
  const inProject = /** @type {[string, string, string]} */ (["project_id.id", "=", project]);
  const [open, tabbed] = await Promise.all([
    search(...TICKET, {
      filter: [inProject, ["closed", "=", false]],
      include: LIST_INCLUDE,
      fields: LIST_FIELDS,
      sort: "-changed",
      limit: 50,
      all: true,
    }),
    tabs.length
      ? search(...TICKET, {
          filter: [inProject, ["identifier", "IN", tabs]],
          include: LIST_INCLUDE,
          fields: LIST_FIELDS,
          limit: 50,
        })
      : [],
  ]);
  const seen = new Set(open.map((t) => t.id));
  return [...open, ...tabbed.filter((t) => !seen.has(t.id))].map(toTicket);
}

/**
 * The runs of the project's open tickets and of the tickets of open tabs, all of them (the
 * newest start counts), by ticket uuid. A search of their own: reading them with the tickets
 * is by far the slowest part of the list.
 * @param {string} project @param {string[]} [tabs] identifiers, as for listOpen
 * @returns {Promise<Map<string, any[]>>}
 */
export async function listRuns(project, tabs = []) {
  const inProject = /** @type {[string, string, string]} */ ([
    "ticket_id.project_id.id",
    "=",
    project,
  ]);
  const find = (/** @type {import("../core/api.js").Query["filter"]} */ filter) =>
    search("bb_run", "bb_run", { filter, fields: RUN_FIELDS, limit: 50, all: true });
  const [open, tabbed] = await Promise.all([
    find([inProject, ["ticket_id.closed", "=", false]]),
    tabs.length ? find([inProject, ["ticket_id.identifier", "IN", tabs]]) : [],
  ]);
  /** @type {Map<string, any[]>} */
  const byTicket = new Map();
  const seen = new Set();
  for (const r of [...open, ...tabbed]) {
    const ticket = r.ticket_id?.id;
    if (!ticket || !r.state || seen.has(r.id)) continue;
    seen.add(r.id);
    byTicket.set(ticket, [...(byTicket.get(ticket) ?? []), toRun(r)]);
  }
  return byTicket;
}

/** Which open tickets of the project have a plan comment, and when the newest was written. @param {string} project */
export async function planComments(project) {
  const plans = await search("bb_comment", "bb_comment", {
    filter: [
      ["bb_comment_type", "=", "plan"],
      ["ticket_id.project_id.id", "=", project],
      ["ticket_id.closed", "=", false],
    ],
    fields: PLAN_FIELDS,
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
 * Tickets matching a list's server query (core/api.js query: filter, sort, include, paging).
 * @param {import("../core/api.js").Query} query
 */
export async function query(query) {
  return (await search(...TICKET, { include: LIST_INCLUDE, fields: LIST_FIELDS, ...query })).map(
    toTicket,
  );
}

/**
 * The signed-in user: name to show (the display name, else the account name) and names, both
 * of them, since the tickets' assignee may show either. Null when unknown or unreadable.
 */
export async function currentUser() {
  try {
    const uuid = await me();
    if (!uuid) return null;
    const u = await read("user", "user", uuid);
    const names = [...new Set([u?.display_name, u?.name].filter(Boolean).map(String))];
    return names.length ? { uuid, name: names[0], names } : null;
  } catch {
    return null;
  }
}
