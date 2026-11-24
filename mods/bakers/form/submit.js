// form/submit: how every form is sent, once. Validate; then an optional conflict check that
// warns once (the second submit writes); then the steps in order. A step may be skipped
// (when). When a step fails, the message names what was done and what failed, in the
// definition's words ("Comment posted; unfreezing failed: <why>"), the values stay and the
// form stays open; a retry skips the steps that already finished, unless a field the step
// posts (uses) was edited since: then it runs again with the edited text. A second submit
// while one runs does nothing. A failed check sends nothing and says so like a failed step.
import { classify } from "../core/errors.js";

/**
 * @typedef {{ when?: (v: any) => boolean, run: (v: any) => Promise<any>, done?: string, failed?: string,
 *   uses?: string[] }} Step uses: the fields the step posts; editing one after the step finished runs it again
 * @typedef {{ validate?: (v: any) => Record<string, string> | null, check?: (v: any) => Promise<string | null>,
 *   steps: Step[], success?: string | ((v: any, results: any[]) => string), join?: string }} Submittable
 */

/**
 * @param {Submittable} def
 * @param {import("./state.js").FormState} state
 * @returns {Promise<{ ok: boolean, skipped?: boolean, success?: string | null, results?: any[] }>}
 */
export async function submit(def, state) {
  if (state.busy) return { ok: false, skipped: true };
  const errors = def.validate?.(state.values) ?? null;
  if (errors && Object.keys(errors).length) {
    state.errors = errors;
    return { ok: false };
  }
  state.busy = true;
  state.message = null;
  try {
    if (def.check && !state.warned) {
      let warning;
      try {
        warning = await def.check(state.values);
      } catch (e) {
        // The check itself failed (e.g. the re-read): nothing was sent, say so in the
        // first step's words.
        const f = classify(e) ?? { kind: "failed", message: String(e) };
        state.message = {
          kind: f.kind,
          message: `${def.steps[0]?.failed ?? "Not sent"}: ${f.message}`,
        };
        return { ok: false };
      }
      if (warning) {
        state.warned = true;
        state.message = { kind: "conflict", message: warning };
        return { ok: false };
      }
    }
    const done = [];
    const results = [];
    for (const [i, step] of def.steps.entries()) {
      const seen = (step.uses ?? []).map((f) => state.values[f]);
      const prior = state.finished.get(i);
      const reuse = prior && seen.every((v, k) => v === prior.seen[k]);
      if (!reuse && step.when && !step.when(state.values)) continue;
      try {
        if (!reuse) state.finished.set(i, { result: await step.run(state.values), seen });
        results.push(state.finished.get(i)?.result);
        if (step.done) done.push(step.done);
      } catch (e) {
        // A step may reject without a reason, which classify maps to null.
        const f = classify(e) ?? { kind: "failed", message: String(e), field: null, retry: true };
        const what = step.failed ?? "Not sent";
        const head = done.length
          ? `${done.join(def.join ?? "; ")}${def.join ?? "; "}${what}`
          : what;
        state.message = { kind: f.kind, message: `${head}: ${f.message}` };
        if (f.kind === "invalid" && f.field) state.errors[f.field] = f.message;
        return { ok: false };
      }
    }
    state.finished.clear();
    const success =
      typeof def.success === "function"
        ? def.success(state.values, results)
        : (def.success ?? null);
    return { ok: true, success, results };
  } finally {
    state.busy = false;
  }
}
