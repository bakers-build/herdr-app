// ticket/presenter/field/agent-line: the agent line, shared by the card, the full view and the context.
// "Claude Code needs you" in the blocked tone, then where (from the run terminal's
// address) and since when.
import { age, agentName, toMs } from "../../../core/format.js";
import { machineOf } from "../../../core/herdr.js";

/**
 * @param {{ run: any, why: string | null, since: number | null, conductor?: string | null }} r
 * @param {any} terminal the run's terminal on this computer, if Herdr shows it
 * @param {number} now
 * @returns {{ tone: string, ring: boolean, text: string, where: string | null, age: string | null, rest: string | null, line: string }}
 */
export function agentLine(r, terminal, now) {
  let tone = "muted";
  let text = r.conductor ? "No active run" : "No active run, no conductor";
  if (r.run) {
    const name = agentName(r.run.agent);
    const asking = r.why === "Asked a question";
    tone = asking ? "blocked" : "working";
    text = asking
      ? `${name} needs you`
      : `${name} ${r.run.state === "running" ? "working" : r.run.state}`;
  }
  const where = machineOf(terminal);
  const start = r.why === "Asked a question" ? r.since : toMs(r.run?.started_at);
  const ago = start == null ? null : age(now - start);
  const rest = [where ? `on ${where}` : null, ago].filter(Boolean).join(", ") || null;
  const line = [`${text}${where ? ` on ${where}` : ""}`, ago].filter(Boolean).join(", ");
  return { tone, ring: !r.run, text, where, age: ago, rest, line };
}
