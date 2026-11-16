// core/cli: the bakers CLI: tools (the writes), auth token and dropsh (core/api.js). Every call is `bakers tools <tool> --data <json>` through Herdr's
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
 * Runs the bakers CLI and returns its parsed JSON output.
 * @param {string[]} argv
 * @param {string} label what failed, for the error
 */
export async function run(argv, label) {
  let r;
  try {
    r = await exec("bakers", argv, { timeout: TIMEOUT });
  } catch (e) {
    throw new BakersError(label, null, `bakers offline: ${e instanceof Error ? e.message : e}`, {
      offline: true,
    });
  }
  if (r.code === 127)
    throw new BakersError(label, 127, "bakers offline: the bakers CLI was not found", {
      offline: true,
    });
  if (r.code !== 0) {
    const message = errorMessage(r.stderr || r.stdout);
    throw new BakersError(label, r.code, message, { unknownTool: /unknown tool/i.test(message) });
  }
  try {
    return parseOutput(r.stdout);
  } catch {
    throw new BakersError(label, 0, `bakers returned unreadable output for ${label}`);
  }
}

/**
 * Calls one bakers tool (the writes) and returns its parsed result.
 * @param {string} tool
 * @param {Record<string, unknown>} [args]
 */
export const call = (tool, args = {}) => run(["tools", tool, "--data", JSON.stringify(args)], tool);
