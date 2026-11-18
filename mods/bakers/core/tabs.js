// core/tabs: keyed tabs of registered kinds in the active space. Herdr's TabInfo carries no props
// and run() returns no tab id (herdr.d.ts v0.1.15), so a keyed tab is recognised by its name: the
// kind's `match` pattern (group 1 = key, group 2 = the rest of the name) and the home tab by the
// kind's home name. A kind is registered as get("tab", kind) = { route, props(key), match, home? }.
// The preview tab is the key in shared("bakers.preview") = { id, index }; index is where the
// replaced preview stood, applied by reconcile() once the new tab shows up.
import { focused, run, setShared, shared, spaces } from "herdr";
import { all, get } from "./registry.js";

const PENDING_MS = 3000;

/** Keyed tabs asked for whose tab has not shown up yet: "kind:key" -> time. */
let pending = new Map();

export function _resetForTests() {
  pending = new Map();
}

/** @param {string} name @returns {{ kind: string, key: string, rest: string } | null} */
export function parseName(name) {
  for (const def of all("tab")) {
    const m = def.match.exec(name ?? "");
    if (m) return { kind: def.id, key: m[1], rest: m[2] };
  }
  return null;
}

function space() {
  return spaces().find((s) => s.active) ?? null;
}

/** @param {string} kind @returns {{ tab: any, key: string, rest: string }[]} */
export function keyedTabs(kind) {
  return (space()?.tabs ?? []).flatMap((tab) => {
    const p = parseName(tab.name);
    return p && p.kind === kind ? [{ tab, key: p.key, rest: p.rest }] : [];
  });
}

/** @param {string} kind */
export function homeTab(kind) {
  const name = get("tab", kind)?.home?.name;
  return name ? ((space()?.tabs ?? []).find((t) => t.name === name) ?? null) : null;
}

/** The kind whose home tab has this name, or null. @param {string} name @returns {string | null} */
export function isHome(name) {
  return all("tab").find((def) => def.home?.name === name)?.id ?? null;
}

/** @param {string} kind */
export function openHome(kind) {
  const home = get("tab", kind)?.home;
  if (!home) return;
  const t = homeTab(kind);
  if (t) run("tab.select", { id: t.id });
  else run("tab.new", { mod: "bakers", props: { view: home.route }, name: home.name });
}

/** The shared preview as written: { id, index }, or null. */
function rawPreview() {
  const p = /** @type {any} */ (shared("bakers.preview"));
  return p && typeof p === "object" && p.id ? p : null;
}

/**
 * The kind of a key: by the preview tab's name, else by the shape of the key. The fallback
 * tries each kind's `match` on `<key> x`, so a kind's `match` must accept `<key> <word>`, and
 * kinds must not overlap (the first registered that matches wins).
 * @param {string} key
 */
function kindOf(key) {
  const open = (space()?.tabs ?? []).flatMap((t) => {
    const p = parseName(t.name);
    return p && p.key === key ? [p.kind] : [];
  });
  if (open[0]) return open[0];
  return all("tab").find((def) => def.match.test(`${key} x`))?.id ?? null;
}

/** @returns {{ kind: string, key: string, index: number | null } | null} */
export function preview() {
  const p = rawPreview();
  const kind = p ? kindOf(p.id) : null;
  return p && kind ? { kind, key: p.id, index: p.index ?? null } : null;
}

/** Keeps each home tab at its index and moves a new preview to where the old one stood. */
export function reconcile() {
  for (const def of all("tab")) {
    if (!def.home) continue;
    const t = homeTab(def.id);
    if (t && t.index !== def.home.index) run("tab.move", { id: t.id, index: def.home.index });
  }
  const p = preview();
  if (p?.index != null) {
    const o = keyedTabs(p.kind).find((x) => x.key === p.key);
    if (o) {
      if (o.tab.index !== p.index) run("tab.move", { id: o.tab.id, index: p.index });
      setShared("bakers.preview", { id: p.key, index: null });
    }
  }
  for (const def of all("tab"))
    for (const o of keyedTabs(def.id)) pending.delete(`${def.id}:${o.key}`);
}

/**
 * Opens a keyed tab as the preview tab, or pinned; an open key is only selected.
 * @param {string} kind
 * @param {string} key
 * @param {string} name
 * @param {{ pin?: boolean }} [opts]
 */
export function open(kind, key, name, opts = {}) {
  const def = get("tab", kind);
  if (!def) return;
  const slot = `${kind}:${key}`;
  const p = preview();
  const mine = p?.kind === kind && p.key === key;
  const found = keyedTabs(kind).find((o) => o.key === key);
  if (found) {
    run("tab.select", { id: found.tab.id });
    if (opts.pin && mine) setShared("bakers.preview", null);
    return;
  }
  const since = pending.get(slot);
  if (since && Date.now() - since < PENDING_MS) {
    if (opts.pin && mine) setShared("bakers.preview", null);
    return;
  }
  let index = null;
  if (!opts.pin && p) {
    const old = keyedTabs(p.kind).find((o) => o.key === p.key);
    if (old) {
      index = old.tab.index;
      run("tab.close", { id: old.tab.id });
    }
  }
  pending.set(slot, Date.now());
  run("tab.new", { mod: "bakers", props: { view: def.route, ...def.props(key) }, name });
  if (!opts.pin) setShared("bakers.preview", { id: key, index });
}

/** Pins the preview tab when it shows this key. @param {string} kind @param {string} key */
export function pin(kind, key) {
  const p = preview();
  if (p?.kind === kind && p.key === key) setShared("bakers.preview", null);
}

/**
 * Renames keyed tabs of a kind whose name changed.
 * @param {string} kind
 * @param {(key: string) => string | null | undefined} nameOf the wanted name, falsy when unknown
 */
export function syncNames(kind, nameOf) {
  for (const o of keyedTabs(kind)) {
    const want = nameOf(o.key);
    if (!want) continue;
    if (want !== o.tab.name) run("tab.rename", { id: o.tab.id, name: want });
  }
}

/** Closes the keyed tabs of a kind that match; never the home tab.
 * @param {string} kind @param {(t: { tab: any, key: string, rest: string }) => boolean} pred */
export function closeWhere(kind, pred) {
  for (const o of keyedTabs(kind)) if (pred(o)) run("tab.close", { id: o.tab.id });
}

/** The key of the focused keyed tab of a kind, or null. @param {string} kind */
export function focusedKey(kind) {
  const f = focused();
  if (!f) return null;
  const tab = (space()?.tabs ?? []).find((t) => t.id === f.tab);
  const p = tab ? parseName(tab.name) : null;
  return p && p.kind === kind ? p.key : null;
}
