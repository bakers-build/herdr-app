// entity/ticket/rules: what a ticket means, independent of how it is shown.
// Needs-you is derived (the bakers API has no such field):
//   frozen + label Question                 -> "Asked a question"
//   state plan + a plan comment + no run    -> "Plan ready for approval"
//   state review                            -> "Ready for review"
import { toMs } from "../core/format.js";

export const STATES = ["qualification", "plan", "working", "review"];
export const ALL_STATES = [...STATES, "done", "cancelled"];
export const CLOSING = ["done", "cancelled"];

/** @param {any} t */
export const isClosed = (t) => Boolean(t?.closed) || CLOSING.includes(t?.state);

/** @param {any} ticket @param {any[]} comments @param {any[]} runs @returns {string | null} */
export function deriveWhy(ticket, comments, runs) {
  if (!ticket || isClosed(ticket)) return null;
  if (ticket.frozen && (ticket.labels ?? []).includes("Question")) return "Asked a question";
  if (
    ticket.state === "plan" &&
    (comments ?? []).some((c) => c.type === "plan") &&
    !(runs ?? []).some((r) => !r.closed)
  )
    return "Plan ready for approval";
  if (ticket.state === "review") return "Ready for review";
  return null;
}

/** When the reason to act began, in ms. @param {any} ticket @param {any[]} comments @param {any[]} runs @param {string | null} why */
export function since(ticket, comments, runs, why) {
  if (why === "Asked a question") return toMs(ticket.frozen_at);
  if (why === "Plan ready for approval") {
    const plans = (comments ?? []).filter((c) => c.type === "plan");
    return toMs(plans[plans.length - 1]?.created);
  }
  const started = (runs ?? []).map((r) => toMs(r.started_at)).filter((v) => v != null);
  return started.length ? Math.max(...started) : null;
}

/** The run that is going on, if any. @param {any[]} runs */
export const activeRun = (runs) => (runs ?? []).find((r) => !r.closed) ?? null;

/** The agent's latest question. @param {any[]} comments */
export function question(comments) {
  const list = comments ?? [];
  return [...list].reverse().find((c) => c.type === "question") ?? list[list.length - 1] ?? null;
}

/** The fingerprint the edit form compares to warn about changes made meanwhile. @param {any} tk */
export const stamp = (tk) =>
  JSON.stringify([tk?.revision ?? tk?.changed ?? null, tk?.title ?? "", tk?.description ?? ""]);
