// ticket/presenter/card: a ticket as one card of the list: id, state, type, age; title; why (only
// when it needs you); labels, assignee, agent status with the machine. Plus the key hint.
import { age } from "../../core/format.js";
import { agentLine } from "./field/agent-line.js";

export const KEY_HINT =
  "Enter or a double click shows the ticket in the panel, N a new ticket, / the filter, R refreshes, cmd-K the actions of the selected ticket. The filter bar narrows the list. Up and down move the selection; the panel, when shown, follows it.";

/** The agent status of a record: the agent line, with the claiming machine when a run has one. @param {any} record @param {number} now */
export function agentStatus(record, now) {
  const agent = agentLine(record, null, now);
  return {
    tone: agent.tone,
    ring: agent.ring,
    text: record.machine && record.run ? `${agent.text}, ${record.machine}` : agent.text,
  };
}

/** @param {any} record @param {{ selected: boolean, now: number }} o */
export function card(record, o) {
  return {
    key: record.id,
    selected: o.selected,
    id: record.id,
    state: record.state,
    type: record.type ?? "",
    age: record.since == null ? "" : age(o.now - record.since),
    title: record.title ?? "",
    why: record.why ?? null,
    labels: record.labels ?? [],
    assignee: record.assignee ?? "",
    agent: agentStatus(record, o.now),
  };
}
