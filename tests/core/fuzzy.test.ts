// Fuzzy matching for the actions palette: the query's letters in order, scored.
import { expect, test } from "bun:test";
import "../harness";

const { fuzzyScore } = await import("../../mods/bakers/core/fuzzy.js");

test("the query's letters in order match, ignoring case and spaces; otherwise null", () => {
  expect(fuzzyScore("chst", "Change state...")).not.toBeNull();
  expect(fuzzyScore("CHST", "Change state...")).not.toBeNull();
  expect(fuzzyScore("herd 9", "HERDRAPP-9 Actions on cmd-K")).not.toBeNull();
  expect(fuzzyScore("tsch", "Change state...")).toBeNull();
  expect(fuzzyScore("xyz", "Change state...")).toBeNull();
});

test("an empty query matches everything with score 0", () => {
  expect(fuzzyScore("", "Anything")).toBe(0);
  expect(fuzzyScore("  ", "Anything")).toBe(0);
});

test("consecutive letters and word starts score higher; an exact prefix scores highest", () => {
  const score = (q: string, t: string) => fuzzyScore(q, t) as number;
  expect(score("can", "Cancel run...")).toBeGreaterThan(score("can", "Change state..."));
  expect(score("show", "Show agent")).toBeGreaterThan(score("sa", "Show agent"));
  expect(score("tick", "Tickets")).toBeGreaterThan(score("tick", "Ticket panel"));
});
