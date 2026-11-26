// The E2E driver helpers (tests/e2e/herdr.ts) against the real herdr-app outputs saved in
// tests/fixtures (Herdr 0.1.16). Runs in a plain `bun test`.
import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  e2eEnv,
  herdrCli,
  keyedTicket,
  layoutName,
  readShared,
  statusErrors,
  tabNames,
  tempRoot,
  ticketTabPattern,
  waitFor,
} from "./e2e/herdr";

const fixture = (name: string) =>
  JSON.parse(readFileSync(join(import.meta.dir, "fixtures", name), "utf8"));
const ls = fixture("herdr-ls.json");
const status = fixture("herdr-status.json");

test("e2eEnv keeps every home under the temp directory", () => {
  const env = e2eEnv({ PATH: "/bin", DISPLAY: ":99", HOME: "/Users/dev" }, "/tmp/he2e-x");
  for (const k of ["HOME", "HERDR_APP_HOME", "BAKERS_HOME"])
    expect(env[k]).toStartWith("/tmp/he2e-x/");
  expect(env.BAKERS_CONNECTION).toBe("e2e");
  expect(env.PATH).toBe("/bin");
  expect(env.DISPLAY).toBe(":99");
});

test("e2eEnv drops the developer's own bakers and dropsh selection", () => {
  const env = e2eEnv(
    { BAKERS_CONFIG: "/x.js", DROPSH_CONFIG: "/y.js", DROPSH_CONNECTION: "prod", PATH: "/bin" },
    "/tmp/t",
  );
  expect(env.BAKERS_CONFIG).toBeUndefined();
  expect(env.DROPSH_CONFIG).toBeUndefined();
  expect(env.DROPSH_CONNECTION).toBeUndefined();
});

test("tempRoot is short on macOS, where the core's socket path is limited", () => {
  expect(tempRoot("darwin")).toBe("/tmp");
  expect(tempRoot("linux")).toBe(tmpdir());
});

test("waitFor resolves with the first non-null probe", async () => {
  let n = 0;
  const v = await waitFor(async () => (++n === 3 ? "ok" : null), 1000, "three", 1);
  expect(v).toBe("ok");
  expect(n).toBe(3);
});

test("waitFor rejects after ms with what it waited for and the last error", async () => {
  const p = waitFor(
    async () => {
      throw new Error("no window");
    },
    30,
    "Herdr status",
    5,
  );
  await expect(p).rejects.toThrow(/30 ms for Herdr status.*no window/);
});

test("tabNames lists the tabs of this computer's spaces only", () => {
  expect(tabNames(ls)).toEqual(["1", "Tickets"]);
  const worker = { spaces: [...ls.spaces, { machine: "worker", tabs: [{ name: "Elsewhere" }] }] };
  expect(tabNames(worker)).toEqual(["1", "Tickets"]);
  expect(tabNames(null)).toEqual([]);
});

test("layoutName and statusErrors read herdr-app status", () => {
  expect(layoutName(status)).toBe("bakers");
  expect(statusErrors(status)).toEqual([]);
  expect(statusErrors({ ...status, errors: ["mods/bakers/main.js: boom"] })).toEqual([
    "mods/bakers/main.js: boom",
  ]);
  expect(statusErrors({ errors: [{ file: "a.js", message: "x" }] })).toEqual([
    '{"file":"a.js","message":"x"}',
  ]);
  expect(layoutName({})).toBeNull();
});

test("readShared gives {} for a missing or broken shared.json", () => {
  const home = mkdtempSync(join(tmpdir(), "e2e-shared-"));
  expect(readShared(home)).toEqual({});
  writeFileSync(join(home, "shared.json"), "{oops");
  expect(readShared(home)).toEqual({});
  writeFileSync(join(home, "shared.json"), '{"bakers.selected":"BB-1"}');
  expect(readShared(home)).toEqual({ "bakers.selected": "BB-1" });
});

test("herdrCli runs the binary and parses its JSON answer", () => {
  const ok = herdrCli(
    process.execPath,
    {},
    "-e",
    "console.log(JSON.stringify({ layout: 'bakers' }))",
  );
  expect(ok).toEqual({ code: 0, json: { layout: "bakers" }, text: '{"layout":"bakers"}\n' });
  const bad = herdrCli(process.execPath, {}, "-e", "console.log('no json'); process.exit(1)");
  expect(bad.code).toBe(1);
  expect(bad.json).toBeNull();
});

test("bun run test:e2e starts the E2E runner", () => {
  const pkg = JSON.parse(readFileSync(join(import.meta.dir, "..", "package.json"), "utf8"));
  expect(pkg.scripts["test:e2e"]).toBe("bun tests/e2e/run.ts");
});

test("ticketTabPattern is the mod's own pattern for a ticket tab", () => {
  const p = ticketTabPattern();
  expect(p.test("GLE2E-5 open")).toBe(true);
  expect(p.test("GL-E2E-DERIVE open")).toBe(false);
  expect(p.test("Tickets")).toBe(false);
});

test("keyedTicket picks a ticket the mod can name a tab after, the preferred one first", () => {
  const p = ticketTabPattern();
  expect(keyedTicket(["GL-E2E-DERIVE", "GLE2E-5", "GLE2E-6"], "GLE2E-6", p)).toBe("GLE2E-6");
  expect(keyedTicket(["GL-E2E-DERIVE", "GLE2E-5"], "GL-E2E-DERIVE", p)).toBe("GLE2E-5");
  expect(keyedTicket(["GL-E2E-DERIVE"], "GL-E2E-DERIVE", p)).toBeNull();
});
