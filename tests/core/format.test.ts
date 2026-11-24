import { expect, test } from "bun:test";

const format: any = await import("../../mods/bakers/core/format.js");

test("utf8Bytes counts the UTF-8 bytes of a text, by code point", () => {
  expect(format.utf8Bytes("")).toBe(0);
  expect(format.utf8Bytes("abc")).toBe(3);
  expect(format.utf8Bytes("ä")).toBe(2);
  expect(format.utf8Bytes("€")).toBe(3);
  expect(format.utf8Bytes("😀")).toBe(4);
  expect(format.utf8Bytes("ä".repeat(1536))).toBe(3072);
});
