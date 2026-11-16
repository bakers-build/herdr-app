// ticket/presenter/counts: the needs-you count for the rail and the status item.
import { age } from "../../core/format.js";

/** @param {number} count */
export const railLabel = (count) => ({
  text: count ? `b ${count}` : "b",
  aria: `bakers, ${count} ${count === 1 ? "ticket needs" : "tickets need"} you`,
  tone: count ? "blocked" : "accent",
});

/**
 * @param {{ project: string | null, count: number, updated: number | null, failure: any, now: number }} o
 * @returns {{ text: string, tone?: string, strong?: boolean }[]}
 */
export function statusParts(o) {
  if (o.failure?.kind === "offline") return [{ text: "bakers offline" }];
  if (!o.project) return o.failure ? [{ text: o.failure.message }] : [];
  const parts = [{ text: o.project }];
  if (o.count > 0) parts.push({ text: `${o.count} need you`, tone: "blocked", strong: true });
  if (o.updated) parts.push({ text: `updated ${age(o.now - o.updated)} ago` });
  return parts;
}
