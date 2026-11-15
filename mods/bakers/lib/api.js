// The bakers CLI client. Every call is `bakers tools <tool> --data <json>` through Herdr's
// exec, in the developer's own signed-in environment: the mod keeps no token.
// The CLI prints ["<message>", "<json>"] on success; on failure it exits nonzero with
// {"error": {"code", "message"}} on stderr (exit 4 with "unknown tool" for a tool this
// CLI does not serve).
import { exec } from "herdr";

const TIMEOUT = 30000;

export class BakersError extends Error {
  /**
   * @param {string} tool
   * @param {number | null} code
   * @param {string} message
   * @param {{ offline?: boolean, unknownTool?: boolean }} [flags]
   */
  constructor(tool, code, message, flags = {}) {
    super(message);
    this.name = "BakersError";
    this.tool = tool;
    this.code = code;
    this.offline = Boolean(flags.offline);
    this.unknownTool = Boolean(flags.unknownTool);
  }
}

/** @param {string} text */
function parseOutput(text) {
  const value = JSON.parse(text);
  if (Array.isArray(value)) {
    for (let i = value.length - 1; i >= 0; i--) {
      if (typeof value[i] !== "string") return value[i];
      try {
        const inner = JSON.parse(value[i]);
        if (inner !== null && typeof inner === "object") return inner;
      } catch {
        // a message line, not data
      }
    }
    return null;
  }
  return value;
}

/** @param {string} stderr */
function errorMessage(stderr) {
  try {
    const e = JSON.parse(stderr);
    if (e?.error?.message) return String(e.error.message).split("\nInput schema:")[0];
  } catch {
    // plain text
  }
  return stderr.trim() || "bakers failed";
}

/**
 * Calls one bakers tool and returns its parsed result.
 * @param {string} tool
 * @param {Record<string, unknown>} [args]
 */
export async function call(tool, args = {}) {
  let r;
  try {
    r = await exec("bakers", ["tools", tool, "--data", JSON.stringify(args)], { timeout: TIMEOUT });
  } catch (e) {
    throw new BakersError(tool, null, `bakers offline: ${e instanceof Error ? e.message : e}`, {
      offline: true,
    });
  }
  if (r.code === 127)
    throw new BakersError(tool, 127, "bakers offline: the bakers CLI was not found", {
      offline: true,
    });
  if (r.code !== 0) {
    const message = errorMessage(r.stderr || r.stdout);
    throw new BakersError(tool, r.code, message, { unknownTool: /unknown tool/i.test(message) });
  }
  try {
    return parseOutput(r.stdout);
  } catch {
    throw new BakersError(tool, 0, `bakers returned unreadable output for ${tool}`);
  }
}

/** Every ticket of a project, all pages. @param {string} project */
export async function listTickets(project) {
  const out = [];
  let offset = 0;
  for (let page = 0; page < 50; page++) {
    const r = await call("bakers_ticket_list", { project, limit: 100, offset });
    out.push(...(r?.tickets ?? []));
    if (r?.next_offset == null || r.next_offset <= offset) break;
    offset = r.next_offset;
  }
  return out;
}

/** @param {string} ticket */
export const readTicket = (ticket) => call("bakers_ticket_read", { ticket, newest: 50 });
/** @param {string} ticket */
export const readComments = (ticket) => call("bakers_comment_read", { ticket });
/** @param {string} ticket */
export const listRuns = async (ticket) =>
  (await call("bakers_ticket_runs_list", { ticket, limit: 20 }))?.runs ?? [];
/** @param {string} ticket */
export const listActivity = async (ticket) =>
  (await call("bakers_ticket_activity_list", { ticket }))?.activity ?? [];
/** @param {string} query @param {string} project */
export const searchTickets = async (query, project) =>
  (await call("bakers_ticket_search", { query, project }))?.tickets ?? [];
export const listProjects = async () => (await call("bakers_project_list", {}))?.projects ?? [];
/** @param {string} project key or UUID */
export const readProject = (project) => call("bakers_project_read", { project });
/** @param {string} workspace */
export const listLabels = async (workspace) =>
  (await call("bakers_label_list", { workspace }))?.labels ?? [];
/** @param {string} project */
export const listConductors = async (project) =>
  (await call("bakers_conductor_list", { project }))?.conductors ?? [];
/** @param {string} ticket @param {string} body @param {string} [type] */
export const publishComment = (ticket, body, type = "comment") =>
  call("bakers_comment_publish", { ticket, type, body });
/** @param {string} ticket @param {Record<string, unknown>} fields */
export const updateTicket = (ticket, fields) => call("bakers_ticket_update", { ticket, ...fields });
/** @param {string} ticket @param {{ type?: string, recipe?: string }} fields */
export const classifyTicket = (ticket, fields) =>
  call("bakers_ticket_classify", { ticket, ...fields });
/** @param {string} ticket @param {string} state */
export const transitionTicket = (ticket, state) =>
  call("bakers_ticket_transition", { ticket, state });
/** @param {string} ticket @param {string} reason */
export const cancelRun = (ticket, reason) => call("bakers_run_cancel", { ticket, reason });
/** @param {Record<string, unknown>} fields */
export const createTicket = (fields) => call("bakers_ticket_create", fields);
