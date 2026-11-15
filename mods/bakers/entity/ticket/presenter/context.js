// presenter/context: a ticket as the right panel shows it (R2-3): the header, Agent and
// conductor, Properties, Activity and Runs. Nothing here repeats the full view.
import { age, agentName, toMs } from "../../../core/format.js";
import { NO_TERMINAL } from "../../../core/herdr.js";
import { activeRun } from "../rules.js";
import { agentLine } from "./agent.js";

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
      branch: tk.branch_name ?? "-",
      parent: tk.parent ? String(tk.parent) : null,
      link: link ? { title: link.title ?? link.uri, uri: link.uri } : null,
    },
    activity: {
      api: !o.activityServed,
      items: (o.activity ?? []).map((/** @type {any} */ a) => ({
        text: a.text ?? a.summary ?? "",
        age: age(o.now - (toMs(a.at ?? a.created) ?? o.now)),
      })),
    },
    runs: (detail.runs ?? []).map((/** @type {any} */ r) => ({
      state: r.state,
      agent: agentName(r.agent),
      age: age(o.now - (toMs(r.started_at) ?? o.now)),
    })),
  };
}
