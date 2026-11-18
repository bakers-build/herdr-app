import { expect, test } from "bun:test";
import "../harness";

const { classify } = await import("../../mods/bakers/core/errors.js");
const { BakersError } = await import("../../mods/bakers/core/cli.js");

test("offline: the CLI is missing or unreachable, retry offered", () => {
  expect(classify(new BakersError("t", null, "bakers offline: ENOENT", { offline: true }))).toEqual(
    {
      kind: "offline",
      message: "bakers offline: ENOENT",
      field: null,
      retry: true,
    },
  );
});

test("api: a tool this CLI does not serve", () => {
  expect(classify(new BakersError("t", 4, "unknown tool 't'", { unknownTool: true }))?.kind).toBe(
    "api",
  );
});

test("invalid: a validation error, with the field when the CLI names one", () => {
  const e = Object.assign(new BakersError("t", 4, "Invalid input: title is required"), {
    field: "title",
  });
  expect(classify(e)).toMatchObject({ kind: "invalid", field: "title", retry: false });
});

test("denied: the server refuses the change", () => {
  expect(classify(new BakersError("t", 1, "Transition not allowed by the workflow"))?.kind).toBe(
    "denied",
  );
});

test("failed: everything else, with the CLI's text", () => {
  expect(classify(new Error("boom"))).toEqual({
    kind: "failed",
    message: "boom",
    field: null,
    retry: true,
  });
});
