// core/format: small formatting helpers shared by the bakers views.

/** "35m", "2h", "3d" for a duration in ms; "" when unknown. @param {number | null} ms */
export function age(ms) {
  if (ms == null || Number.isNaN(ms)) return "";
  const min = Math.max(1, Math.round(ms / 60000));
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** Epoch seconds, epoch ms or an ISO string, as ms; null when absent. @param {unknown} v */
export function toMs(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v < 1e12 ? v * 1000 : v;
  const n = Date.parse(String(v));
  return Number.isNaN(n) ? null : n;
}

/** The first non-empty line of a text, without Markdown heading marks. @param {string} text */
export function firstLine(text) {
  const line = String(text ?? "")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l);
  return (line ?? "").replace(/^#+\s*/, "");
}

/** What a person reads for an agent name from a run. @param {string} agent */
export function agentName(agent) {
  /** @type {Record<string, string>} */
  const names = { claude: "Claude Code", codex: "Codex", gemini: "Gemini", pi: "Pi" };
  if (!agent) return "Agent";
  return names[agent] ?? agent.charAt(0).toUpperCase() + agent.slice(1);
}
