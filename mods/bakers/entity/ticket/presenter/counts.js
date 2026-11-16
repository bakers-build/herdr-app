// presenter/counts: the numbers over all tickets, for the sidebar's views, the rail and the
// status item.
import { age } from "../../../core/format.js";
import { STATES } from "../rules.js";
import { cap } from "./views.js";

/** @param {any} counts the store's counts() @param {string} view */
export function sidebarRows(counts, view) {
  const row = (
    /** @type {string} */ key,
    /** @type {string} */ label,
    /** @type {number | null} */ count,
    o = {},
  ) => ({ key, label, count, selected: view === key, ...o });
  return [
    row("needs-me", "Needs me", counts.needsMe),
    row("mine", "Mine", null, { api: true, disabled: true }),
    row("open", "Open by state", counts.open),
    ...STATES.map((s) => row(`state:${s}`, cap(s), counts.byState[s] ?? 0, { sub: true })),
    row("closed", "Recently closed", counts.recentlyClosed ?? null, { dim: true }),
  ];
}

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
