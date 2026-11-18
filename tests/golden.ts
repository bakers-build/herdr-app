// The serialiser of the golden render snapshots: an element tree as plain, ordered data.
import { El } from "./harness";

/**
 * An element as `{ kind, arg, calls, nodes }`: every builder call per name (in call order) with its arguments, children in
 * order. Functions become "[fn]", object keys are sorted, text nodes stay strings.
 */
export function serialise(root: El): unknown {
  return plain(root, new WeakSet());
}

function plain(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === "function") return "[fn]";
  if (typeof value !== "object" || value === null) return value;
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  let out: unknown;
  if (value instanceof El) {
    out = {
      arg: plain(value.arg, seen),
      calls: plain(value.all, seen),
      kind: value.kind,
      nodes: value.nodes.map((n) => plain(n, seen)),
    };
  } else if (Array.isArray(value)) {
    out = value.map((v) => plain(v, seen));
  } else {
    out = Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, plain((value as Record<string, unknown>)[k], seen)]),
    );
  }
  seen.delete(value);
  return out;
}
