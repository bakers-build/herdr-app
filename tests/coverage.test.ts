import { expect, test } from "bun:test";
import { belowFloor, totals } from "../scripts/check/coverage";

const lcov = [
  "TN:",
  "SF:mods/a.js",
  "FNF:4",
  "FNH:3",
  "LF:10",
  "LH:9",
  "end_of_record",
  "TN:",
  "SF:mods/b.js",
  "FNF:0",
  "FNH:0",
  "LF:10",
  "LH:7",
  "end_of_record",
].join("\n");

test("totals sums lines and functions over every file", () => {
  expect(totals(lcov)).toEqual({ lines: 16 / 20, functions: 3 / 4 });
});

test("totals of an empty report is full coverage", () => {
  expect(totals("")).toEqual({ lines: 1, functions: 1 });
});

test("belowFloor names each measure under the floor with both numbers", () => {
  const out = belowFloor({ lines: 0.8, functions: 0.75 }, { lines: 0.8, functions: 0.9 });
  expect(out).toEqual(["functions: 75.00 % is below the floor of 90 %"]);
});

test("belowFloor is empty at or above the floor", () => {
  expect(belowFloor({ lines: 0.95, functions: 0.92 }, { lines: 0.92, functions: 0.92 })).toEqual(
    [],
  );
});
