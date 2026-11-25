// ticket/model: the shape of a ticket and how JSON:API entities (core/jsonapi.js normalized)
// become one. Plain objects, typed with JSDoc; no calls, no drawing.

/**
 * @typedef {{ uuid: string, state: string, agent: string | null, started_at: string | null, closed: boolean }} Run
 * @typedef {{ id: string, type: string, author: string, created: string, body: string }} Comment
 * @typedef {{ id: string, identifier: string, title: string, state: string, labels: string[],
 *   frozen: boolean, frozen_at: string | null, closed: boolean, closed_date: string | null,
 *   changed: string | null, assignee: string | null, claim_machine: string | null,
 *   conductor: string | null, type: string | null, runs: Run[],
 *   unnamed?: { labels: string[], type: string | null } }} Ticket
 *   unnamed: the uuids of label and type terms the server related without their names (it
 *   leaves out of `included` what the reader may not view); the catalog names them (named)
 * @typedef {Ticket & { workflow: string | null, description: string, branch_name: string | null,
 *   links: any[], recipe: string | null, parent: string | null,
 *   reviewers: string[], conductorInfo: any, comments: Comment[] }} TicketDetail
 */

/** A term's or a user's name. @param {any} e */
export const nameOf = (e) => e?.name ?? e?.display_name ?? e?.label ?? null;

/** @param {any} r a bb_run */
export const toRun = (r) => ({
  uuid: r.id,
  state: r.state,
  agent: r.agent ?? r.harness ?? null,
  started_at: r.started_at ?? null,
  closed: Boolean(r.closed),
});

/** @param {any} c a bb_comment */
export const toComment = (c) => ({
  id: c.id,
  type: c.bb_comment_type ?? "comment",
  author: c.author_name ?? "",
  created: c.created,
  body: c.body ?? "",
});

/** A related term the document carries only as a reference. @param {any} e */
const bare = (e) => e?.id != null && nameOf(e) === null;

/** A bb_ticket as the list needs it. @param {any} t */
export function toTicket(t) {
  const labels = (t.labels ?? []).filter(bare).map((/** @type {any} */ e) => e.id);
  const type = bare(t.ticket_type) ? t.ticket_type.id : null;
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
    type: nameOf(t.ticket_type),
    claim_machine: t.claim_machine ?? null,
    conductor: t.conductor_id?.id ?? null,
    runs: (t.runs ?? []).filter((/** @type {any} */ r) => r.state).map(toRun),
    ...(labels.length || type ? { unnamed: { labels, type } } : {}),
  };
}

/**
 * The ticket with the names of its unnamed terms, as far as the catalog knows them.
 * @template {Ticket} T @param {T} t @param {Record<string, string> | undefined} names uuid -> name
 * @returns {T}
 */
export function named(t, names) {
  if (!t?.unnamed || !names) return t;
  const found = t.unnamed.labels.map((id) => names[id]).filter(Boolean);
  return {
    ...t,
    labels: [...new Set([...t.labels, ...found])],
    type: t.type ?? (t.unnamed.type ? (names[t.unnamed.type] ?? null) : null),
  };
}

/** A bb_ticket with its includes, as the panel needs it. @param {any} t */
export function toDetail(t) {
  const c = t.conductor_id;
  return {
    ...toTicket(t),
    workflow: t.workflow ?? null,
    description: t.description ?? "",
    branch_name: t.branch_name ?? null,
    links: t.links ?? [],
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
