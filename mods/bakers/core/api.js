// core/api: reading bakers entities through JSON:API, with the developer's own sign-in.
// The CLI hands out a short-lived access token (`bakers auth token`, BAKERS-264); the mod
// keeps it in memory only, sends it with fetch to <base_url>/jsonapi/..., and asks the CLI
// again after a 401. An older CLI without that command is read through `bakers dropsh`
// instead, one process per request; both give the same JSON:API document.
import { BakersError, run } from "./cli.js";
import { normalize } from "./jsonapi.js";

/** @typedef {[string, string, (string | number | boolean | string[])?]} Condition [path, operator, value; IN takes a list] */

/** A condition value as Drupal reads it: booleans as 1 or 0. @param {string | number | boolean} v */
const value = (v) => (typeof v === "boolean" ? (v ? "1" : "0") : String(v));
/** @typedef {{ filter?: Condition[], include?: string[], sort?: string, limit?: number, offset?: number, all?: boolean }} Query */

/** @type {{ base: string, token: string } | null} */
let session = null;
/** @type {"fetch" | "dropsh" | null} */
let mode = null;

/** The token request in flight, shared by parallel callers. @type {Promise<{ base: string, token: string } | null> | null} */
let pending = null;

export function _resetForTests() {
  session = null;
  mode = null;
  pending = null;
}

/** @param {boolean} [fresh] ask the CLI again (after a 401) */
async function token(fresh = false) {
  if (session && !fresh) return session;
  if (mode === "dropsh") return null;
  if (!pending) pending = askToken().finally(() => (pending = null));
  return pending;
}

async function askToken() {
  try {
    const t = await run(["auth", "token"], "bakers auth token");
    session = { base: String(t.base_url).replace(/\/$/, ""), token: t.token };
    mode = "fetch";
    return session;
  } catch (/** @type {any} */ e) {
    if (/unknown command|unknown option|too many arguments/i.test(e?.message ?? "")) {
      mode = "dropsh";
      return null;
    }
    throw e;
  }
}

/** @param {string} path @param {URLSearchParams} params */
async function get(path, params) {
  const q = params.toString();
  for (let attempt = 0; attempt < 2; attempt++) {
    const s = await token(attempt > 0);
    if (!s) return null;
    let r;
    try {
      r = await fetch(`${s.base}/jsonapi/${path}${q ? `?${q}` : ""}`, {
        headers: { Authorization: `Bearer ${s.token}`, Accept: "application/vnd.api+json" },
      });
    } catch (e) {
      throw new BakersError(path, null, `bakers offline: ${e instanceof Error ? e.message : e}`, {
        offline: true,
      });
    }
    if (r.status === 401 && attempt === 0) continue;
    if (!r.ok) {
      /** @type {any} */
      let body = null;
      try {
        body = await r.json();
      } catch {
        // not JSON
      }
      const err = body?.errors?.[0];
      throw new BakersError(path, r.status, err?.detail || err?.title || `HTTP ${r.status}`);
    }
    return r.json();
  }
  return null;
}

/** @param {Query} q @param {number} offset */
function params(q, offset) {
  const p = new URLSearchParams();
  (q.filter ?? []).forEach(([path, op, v], i) => {
    p.set(`filter[f${i}][condition][path]`, path);
    p.set(`filter[f${i}][condition][operator]`, op);
    if (Array.isArray(v)) for (const x of v) p.append(`filter[f${i}][condition][value][]`, x);
    else if (v !== undefined) p.set(`filter[f${i}][condition][value]`, value(v));
  });
  if (q.sort) p.set("sort", q.sort);
  if (q.include?.length) p.set("include", q.include.join(","));
  if (q.limit != null) {
    p.set("page[limit]", String(q.limit));
    p.set("page[offset]", String(offset));
  }
  return p;
}

/** The same query for `bakers dropsh search`. @param {string} type @param {string} bundle @param {Query} q @param {number} offset */
function dropshArgs(type, bundle, q, offset) {
  const a = ["dropsh", "search", type, "--bundle", bundle];
  for (const [path, op, v] of q.filter ?? []) {
    const val = Array.isArray(v) ? v.join(",") : v === undefined ? undefined : value(v);
    a.push(
      "--filter",
      op === "=" ? `${path}:${val}` : val === undefined ? `${path}:${op}` : `${path}:${op}:${val}`,
    );
  }
  if (q.sort) a.push("--sort", q.sort);
  if (q.include?.length) a.push("--include", ...q.include);
  if (q.limit != null) a.push("--limit", String(q.limit), "--offset", String(offset));
  return a;
}

/**
 * One entity by UUID, with its includes resolved.
 * @param {string} type @param {string} bundle @param {string} uuid @param {string[]} [include]
 */
export async function read(type, bundle, uuid, include = []) {
  await token();
  const doc =
    mode === "dropsh"
      ? await run(
          [
            "dropsh",
            "read",
            `${type}/${bundle}/${uuid}`,
            ...(include.length ? ["--include", ...include] : []),
          ],
          `${type} ${uuid}`,
        )
      : await get(`${type}/${bundle}/${uuid}`, params({ include }, 0));
  return normalize(doc).data;
}

/**
 * Entities matching the conditions; with `all`, every page.
 * @param {string} type @param {string} bundle @param {Query} [q]
 */
export async function search(type, bundle, q = {}) {
  await token();
  const out = [];
  let offset = q.offset ?? 0;
  for (let page = 0; page < 50; page++) {
    const doc =
      mode === "dropsh"
        ? await run(dropshArgs(type, bundle, q, offset), `${type} search`)
        : await get(`${type}/${bundle}`, params(q, offset));
    const { data, next } = normalize(doc);
    out.push(...(data ?? []));
    if (!q.all || !next || q.limit == null) break;
    offset += q.limit;
  }
  return out;
}
