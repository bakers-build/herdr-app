import { beforeEach, expect, test } from "bun:test";
import { env, fetched, reset } from "../harness";

const api: any = await import("../../mods/bakers/core/api.js");

const TOKEN = {
  base_url: "https://bakers.test",
  token: "abc",
  token_type: "Bearer",
  expires_at: "2099-01-01T00:00:00Z",
};
const doc = (data: any) => ({ jsonapi: { version: "1.1" }, data });

function cliWithToken(tokens: any[] = [TOKEN]) {
  let n = 0;
  env.exec = async (_c, argv) => {
    if (argv[0] === "auth" && argv[1] === "token")
      return {
        code: 0,
        stdout: JSON.stringify(tokens[Math.min(n++, tokens.length - 1)]),
        stderr: "",
      };
    return { code: 1, stdout: "", stderr: "unexpected" };
  };
}

beforeEach(() => {
  reset();
  api._resetForTests();
});

test("read asks the CLI for a token once and fetches JSON:API with it", async () => {
  cliWithToken();
  const seen: any[] = [];
  env.fetch = async (_url, opts) => {
    seen.push(opts.headers);
    return {
      status: 200,
      ok: true,
      json: async () =>
        doc({ type: "bb_ticket--bb_ticket", id: "u1", attributes: { identifier: "SHOP-41" } }),
      text: async () => "",
    };
  };
  const t = await api.read("bb_ticket", "bb_ticket", "u1", ["runs", "labels"]);
  await api.read("bb_ticket", "bb_ticket", "u1");
  expect(t).toMatchObject({ id: "u1", identifier: "SHOP-41" });
  expect(fetched()).toEqual([
    "https://bakers.test/jsonapi/bb_ticket/bb_ticket/u1?include=runs,labels",
    "https://bakers.test/jsonapi/bb_ticket/bb_ticket/u1",
  ]);
  expect(seen[0]).toEqual({ Authorization: "Bearer abc", Accept: "application/vnd.api+json" });
  expect(env.calls.filter((c) => c.fn === "exec").length).toBe(1);
});

test("search sends filters as JSON:API conditions, sort, include and paging; it follows next pages", async () => {
  cliWithToken();
  env.fetch = async (url) => {
    const offset = Number(new URL(url).searchParams.get("page[offset]") ?? 0);
    const body = {
      ...doc([{ type: "x", id: `r${offset}` }]),
      links: offset === 0 ? { next: { href: "n" } } : {},
    };
    return { status: 200, ok: true, json: async () => body, text: async () => "" };
  };
  const rows = await api.search("bb_ticket", "bb_ticket", {
    filter: [
      ["project_id.id", "=", "p1"],
      ["title", "CONTAINS", "cart"],
      ["closed_date", "IS NOT NULL"],
    ],
    sort: "-changed",
    include: ["runs"],
    limit: 50,
    all: true,
  });
  expect(rows.map((r: any) => r.id)).toEqual(["r0", "r50"]);
  const first = fetched()[0];
  expect(first).toContain("/jsonapi/bb_ticket/bb_ticket?");
  expect(first).toContain(
    "filter[f0][condition][path]=project_id.id&filter[f0][condition][operator]==&filter[f0][condition][value]=p1",
  );
  expect(first).toContain(
    "filter[f1][condition][operator]=CONTAINS&filter[f1][condition][value]=cart",
  );
  expect(first).toContain("filter[f2][condition][operator]=IS NOT NULL");
  expect(first).not.toContain("filter[f2][condition][value]");
  expect(first).toContain("sort=-changed&include=runs&page[limit]=50&page[offset]=0");
  expect(fetched()[1]).toContain("page[offset]=50");
});

test("search sends a boolean as 1 or 0 and an IN value as a list", async () => {
  cliWithToken();
  env.fetch = async () => ({
    status: 200,
    ok: true,
    json: async () => doc([]),
    text: async () => "",
  });
  await api.search("bb_ticket", "bb_ticket", {
    filter: [
      ["closed", "=", false],
      ["frozen", "=", true],
      ["identifier", "IN", ["SHOP-41", "SHOP-49"]],
    ],
  });
  const url = fetched()[0];
  expect(url).toContain(
    "filter[f0][condition][path]=closed&filter[f0][condition][operator]==&filter[f0][condition][value]=0",
  );
  expect(url).toContain("filter[f1][condition][value]=1");
  expect(url).toContain(
    "filter[f2][condition][operator]=IN&filter[f2][condition][value][]=SHOP-41&filter[f2][condition][value][]=SHOP-49",
  );
});

test("parallel reads ask the CLI for one token", async () => {
  cliWithToken();
  env.fetch = async () => ({
    status: 200,
    ok: true,
    json: async () => doc({ type: "x", id: "1" }),
    text: async () => "",
  });
  await Promise.all([api.read("x", "x", "1"), api.read("x", "x", "1"), api.read("x", "x", "1")]);
  expect(env.calls.filter((c) => c.fn === "exec").length).toBe(1);
});

test("a 401 asks the CLI for a new token and tries once more", async () => {
  cliWithToken([TOKEN, { ...TOKEN, token: "fresh" }]);
  const auth: string[] = [];
  env.fetch = async (_u, opts) => {
    auth.push(opts.headers.Authorization);
    const ok = opts.headers.Authorization === "Bearer fresh";
    return {
      status: ok ? 200 : 401,
      ok,
      json: async () => doc({ type: "x", id: "1" }),
      text: async () => "unauthorized",
    };
  };
  expect((await api.read("x", "x", "1")).id).toBe("1");
  expect(auth).toEqual(["Bearer abc", "Bearer fresh"]);
});

test("an HTTP error becomes a BakersError with the server's JSON:API message", async () => {
  cliWithToken();
  env.fetch = async () => ({
    status: 403,
    ok: false,
    json: async () => ({ errors: [{ title: "Forbidden", detail: "No access to project p9." }] }),
    text: async () => "",
  });
  const e: any = await api.read("bb_project", "bb_project", "p9").catch((x: any) => x);
  expect(e.message).toBe("No access to project p9.");
  expect(e.code).toBe(403);
});

test("a network failure is offline", async () => {
  cliWithToken();
  const e: any = await api.read("x", "x", "1").catch((x: any) => x);
  expect(e.offline).toBe(true);
});

test("no signed-in CLI: the CLI's message, offline when the CLI is missing", async () => {
  env.exec = async () => ({
    code: 1,
    stdout: "",
    stderr: JSON.stringify({
      error: { code: "E_AUTH", message: "Not signed in; run bakers auth login" },
    }),
  });
  const e: any = await api.read("x", "x", "1").catch((x: any) => x);
  expect(e.message).toBe("Not signed in; run bakers auth login");
  api._resetForTests();
  env.exec = async () => ({ code: 127, stdout: "", stderr: "not found" });
  expect((await api.read("x", "x", "1").catch((x: any) => x)).offline).toBe(true);
});

test("an older CLI without auth token reads through bakers dropsh instead", async () => {
  env.exec = async (_c, argv) => {
    if (argv[0] === "auth")
      return { code: 1, stdout: "", stderr: "error: unknown command 'token'" };
    return {
      code: 0,
      stdout: JSON.stringify(
        doc([{ type: "bb_ticket--bb_ticket", id: "u1", attributes: { title: "A" } }]),
      ),
      stderr: "",
    };
  };
  const rows = await api.search("bb_ticket", "bb_ticket", {
    filter: [
      ["project_id.id", "=", "p1"],
      ["closed_date", "IS NOT NULL"],
    ],
    include: ["runs", "labels"],
    sort: "-changed",
    limit: 20,
  });
  expect(rows[0]).toMatchObject({ id: "u1", title: "A" });
  const argv = env.calls.filter((c) => c.fn === "exec").map((c) => c.args[1])[1];
  expect(argv).toEqual([
    "dropsh",
    "search",
    "bb_ticket",
    "--bundle",
    "bb_ticket",
    "--filter",
    "project_id.id:p1",
    "--filter",
    "closed_date:IS NOT NULL",
    "--sort",
    "-changed",
    "--include",
    "runs",
    "labels",
    "--limit",
    "20",
    "--offset",
    "0",
  ]);
  expect(fetched()).toEqual([]);
});
