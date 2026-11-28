import { expect, test } from "bun:test";
import { CONTRACT_SERVER, E2E_SERVER, IMAGE } from "./server/bakers-server";

test("contract and e2e servers can run side by side", () => {
  expect(E2E_SERVER.name).not.toBe(CONTRACT_SERVER.name);
  expect(E2E_SERVER.port).not.toBe(CONTRACT_SERVER.port);
  expect(E2E_SERVER).toEqual({ name: "herdr-e2e", port: 18081 });
  expect(CONTRACT_SERVER).toEqual({ name: "herdr-contract", port: 18080 });
});

test("the server image is pinned by version and digest", () => {
  expect(IMAGE).toMatch(/:\d+\.\d+\.\d+@sha256:[0-9a-f]{64}$/);
});
