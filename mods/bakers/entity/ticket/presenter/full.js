// presenter/full: a whole ticket for its tab (R2-3): the header (identifier, state, Frozen,
// agent line), the title, the Needs-you card, the description and the comments.
import { age, firstLine, toMs } from "../../../core/format.js";
import { question } from "../rules.js";
import { agentLine } from "./agent.js";

const FOLDED = ["plan", "spec", "summary"];

/** @param {any} detail the store's ticket detail @param {{ terminal: any, now: number }} o */
export function full(detail, o) {
  const tk = detail.ticket;
  const record = {
    run: detail.runs.find((/** @type {any} */ r) => !r.closed) ?? null,
    why: detail.why,
    since: detail.since,
    conductor: tk.conductor,
  };
  return {
    id: tk.identifier,
    state: tk.state,
    frozen: Boolean(tk.frozen),
    agent: agentLine(record, o.terminal, o.now),
    title: tk.title ?? "",
    description: tk.description ?? "",
    needs: needsCard(detail, o.now),
    comments: comments(detail, o.now),
    commentsHeading: `Comments ${(detail.comments ?? []).length}, newest last`,
  };
}

/** @param {any} detail @param {number} now */
export function needsCard(detail, now) {
  if (!detail.why) return null;
  const since = detail.since == null ? "" : `, ${age(now - detail.since)} ago`;
  const base = { label: "NEEDS YOU", title: `${detail.why}${since}`, hint: "A acts on this card" };
  if (detail.why === "Asked a question")
    return { ...base, kind: "question", text: question(detail.comments)?.body ?? "" };
  if (detail.why === "Plan ready for approval") {
    const plan = [...(detail.comments ?? [])].reverse().find((c) => c.type === "plan");
    return { ...base, kind: "plan", text: firstLine(plan?.body ?? "") };
  }
  return { ...base, kind: "review", text: "The branch waits for a review." };
}

/** @param {any} detail @param {number} now */
export function comments(detail, now) {
  const list = detail.comments ?? [];
  const asking = detail.why === "Asked a question";
  const last = [...list].reverse().find((c) => c.type === "question");
  return list.map((/** @type {any} */ c, /** @type {number} */ i) => ({
    key: c.id ?? String(i),
    meta: [c.author ?? "", c.type ?? "comment", age(now - (toMs(c.created) ?? now))],
    body: c.body ?? "",
    firstLine: firstLine(c.body),
    foldable: FOLDED.includes(c.type),
    marked: asking && c === last,
  }));
}
