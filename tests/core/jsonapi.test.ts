import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import "../harness";

const { normalize } = await import("../../mods/bakers/core/jsonapi.js");

const real = JSON.parse(
  await readFile(new URL("../fixtures/jsonapi/bb_ticket-read.json", import.meta.url), "utf8"),
);

test("a real bb_ticket read: attributes flat, text fields as their value, relationships as references", () => {
  const { data, next } = normalize(real);
  expect(next).toBe(false);
  expect(data).toMatchObject({
    id: "23b16c12-2739-4fea-bdfe-572eafd1ce71",
    type: "bb_ticket--bb_ticket",
    identifier: "HERDRAPP-3",
    state: "working",
    description: "## Goal\n\nBuild the first two screens.",
    frozen: false,
    assignee_name: "cw",
    project_id: { id: "862d9507-3c0d-4e31-a246-40febf547faa", type: "bb_project--bb_project" },
    labels: [],
    parent_id: null,
  });
  expect(data.comments).toEqual([
    { id: "ceceae7d-e470-4e91-8bbb-51764a18c9d9", type: "bb_comment--bb_comment" },
  ]);
});

test("included resources are resolved, also nested, without looping", () => {
  const doc = {
    data: [
      {
        type: "t",
        id: "1",
        attributes: { title: "A" },
        relationships: {
          runs: { data: [{ type: "r", id: "9" }] },
          self: { data: { type: "t", id: "1" } },
        },
      },
    ],
    included: [
      {
        type: "r",
        id: "9",
        attributes: { state: "running" },
        relationships: { conductor_id: { data: { type: "c", id: "5" } } },
      },
      { type: "c", id: "5", attributes: { label: "ci-box" } },
    ],
    links: { next: { href: "x" } },
  };
  const { data, next } = normalize(doc);
  expect(next).toBe(true);
  expect(data[0].runs[0]).toMatchObject({
    id: "9",
    state: "running",
    conductor_id: { id: "5", label: "ci-box" },
  });
  expect(data[0].self).toEqual({ id: "1", type: "t" });
});
