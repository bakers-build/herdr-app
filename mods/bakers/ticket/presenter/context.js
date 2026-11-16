// ticket/presenter/context: a ticket as the right panel shows it (R2-3): the header, Agent and
// conductor, Properties, Activity and Runs. Nothing here repeats the full view.
import { age, agentName, toMs } from "../../core/format.js";
import { NO_TERMINAL } from "../../core/herdr.js";
import { activeRun } from "../rules.js";
import { agentLine } from "./field/agent-line.js";

/** What happened, in words: bb_activity's kind with its states. @param {any} a */
export function activityText(a) {
  if (a.kind === "created") return a.actor ? `Created by ${a.actor}` : "Created";
  if (a.kind === "status_changed") return `${a.previous ?? "new"} to ${a.next ?? "?"}`;
  if (a.kind === "claimed") return a.step ? `Run started, ${a.step}` : "Run started";
  if (a.kind === "run_ended") return a.step ? `Run ended, ${a.step}` : "Run ended";
  if (a.kind === "assigned") return "Assigned";
  if (a.kind === "review_requested") return "Review requested";
  if (a.kind === "review_completed") return "Review completed";
  return String(a.kind ?? "");
}

/**
 * @param {any} detail
 * @param {{ terminal: any, now: number, activity: any[] | null, activityServed: boolean }} o
 */
export function context(detail, o) {
  const tk = detail.ticket;
  const run = activeRun(detail.runs);
  const agent = agentLine(
    { run, why: detail.why, since: detail.since, conductor: tk.conductor },
    o.terminal,
    o.now,
  );
  const frozenSince = toMs(tk.frozen_at);
  const link = (tk.links ?? [])[0] ?? null;
  return {
    id: tk.identifier,
    sub: tk.frozen ? `${tk.state}, frozen` : tk.state,
    agent: {
      ...agent,
      show: o.terminal ? null : NO_TERMINAL,
      cancel: run ? null : "No run is active",
      hint: "R moves, G shows the agent.",
    },
    properties: {
      type: tk.type ?? "-",
      recipe: tk.recipe ?? "-",
      labels: tk.labels ?? [],
      frozen: tk.frozen
        ? {
            text: `Yes${frozenSince ? `, ${age(o.now - frozenSince)}` : ""}`,
            form: "unfreeze",
            label: "Unfreeze...",
          }
        : { text: "No", form: "freeze", label: "Freeze..." },
      assignee: tk.assignee ?? "-",
      reviewers: (tk.reviewers ?? []).length ? tk.reviewers.join(", ") : "-",
      branch: tk.branch_name ?? "-",
      parent: tk.parent ? String(tk.parent) : null,
      link: link ? { title: link.title ?? link.uri, uri: link.uri } : null,
    },
    activity: {
      api: !o.activityServed,
      items: (o.activity ?? []).map((/** @type {any} */ a) => ({
        text: activityText(a),
        age: age(o.now - (toMs(a.created) ?? o.now)),
      })),
    },
    runs: (detail.runs ?? []).map((/** @type {any} */ r) => ({
      state: r.state,
      agent: agentName(r.agent),
      age: age(o.now - (toMs(r.started_at) ?? o.now)),
    })),
  };
}
