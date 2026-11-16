// ticket/repository: reading tickets and what belongs to them through JSON:API
// (core/api.js), the only place in the module that reads. Returns model objects.
import { read, search } from "../core/api.js";
import { nameOf, toDetail, toTicket } from "./model.js";

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

/** The open tickets of a project, with runs and labels: the base of the open lists. @param {string} project */
export async function listOpen(project) {
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
 * Tickets matching a list's server query (core/api.js query: filter, sort, include, paging).
 * @param {import("../core/api.js").Query} query
 */
export async function query(query) {
  return (await search(...TICKET, { include: LIST_INCLUDE, ...query })).map(toTicket);
}
