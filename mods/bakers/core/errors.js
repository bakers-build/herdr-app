// core/errors: every failure is sorted into one kind, once, for forms, loading and status.
//   offline   the bakers CLI is missing, unreachable or timed out  -> "bakers offline", Retry
//   api       a tool this CLI does not serve                        -> the API chip
//   invalid   the CLI rejected the input (validation)               -> the field's error
//   denied    the server refuses the change (workflow, rights)      -> the server's words
//   conflict  the ticket changed meanwhile                          -> warn once (form/submit)
//   failed    anything else                                         -> the CLI's words, Retry

/** @typedef {{ kind: "offline" | "api" | "invalid" | "denied" | "conflict" | "failed", message: string, field: string | null, retry: boolean }} Failure */

/** @param {any} e @returns {Failure | null} */
export function classify(e) {
  if (!e) return null;
  if (e.kind && "retry" in e) return e;
  const message = String(e.message ?? e);
  const field = e.field ?? null;
  if (e.offline) return { kind: "offline", message, field, retry: true };
  if (e.unknownTool) return { kind: "api", message, field, retry: false };
  if (/not allowed|forbid|denied|permission|refuse/i.test(message))
    return { kind: "denied", message, field, retry: false };
  if (e.code === 4 || /invalid input|E_VALIDATION/i.test(message))
    return { kind: "invalid", message, field, retry: false };
  return { kind: "failed", message, field, retry: true };
}
